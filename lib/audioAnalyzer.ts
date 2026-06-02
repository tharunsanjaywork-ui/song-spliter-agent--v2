/**
 * lib/audioAnalyzer.ts
 * Web Audio API based audio analysis.
 * Performs client-side audio decoding, resampling to 16kHz, mono-mixing,
 * and extracts volume/spectral features to construct the JSON analysis table for the LLM.
 */

import { decodeAudioDataWithRetry, getAudioDuration, calculateOptimalSampleRate } from "./audioUtils";

interface Valley {
  time_sec: number;
  time_min: string;
  depth_db: number;
  duration_s: number;
  recovers: boolean;
  fade_before: boolean;
  is_candidate: boolean;
}

interface NoveltyPeak {
  s: number;
  t: string;
  novelty: number;
}

export interface AnalysisResult {
  metadata: {
    duration_sec: number;
    duration_fmt: string;
    sample_rate: number;
    target_songs: number;
    min_song_sec: number;
    max_song_sec: number;
  };
  energy_valleys: Valley[];
  strong_candidates: Valley[];
  top_novelty_peaks: NoveltyPeak[];
  per_second: Array<{
    s: number;
    t: string;
    energy_db: number;
    mfcc_mean: number;
    mfcc_std: number;
    mfcc_change: number;
    chroma_key: number;
    chroma_change: number;
    mel_novelty: number;
    novelty: number;
    novelty_smooth: number;
  }>;
}

// Cooley-Tukey Radix-2 In-place FFT
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  if (n <= 1) return;

  // Bit reversal permutation
  let limit = 1;
  let bit = n >> 1;
  while (limit < n) {
    for (let i = 0; i < limit; i++) {
      if (i < bit) {
        let temp = re[i]; re[i] = re[i + bit]; re[i + bit] = temp;
        temp = im[i]; im[i] = im[i + bit]; im[i + bit] = temp;
      }
    }
    limit <<= 1;
    bit >>= 1;
  }

  // Cooley-Tukey Radix-2 algorithm
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wlen_re = Math.cos(ang);
    const wlen_im = -Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let w_re = 1;
      let w_im = 0;
      for (let j = 0; j < len / 2; j++) {
        const u_re = re[i + j];
        const u_im = im[i + j];
        const targetIdx = i + j + len / 2;
        const v_re = re[targetIdx] * w_re - im[targetIdx] * w_im;
        const v_im = re[targetIdx] * w_im + im[targetIdx] * w_re;

        re[i + j] = u_re + v_re;
        im[i + j] = u_im + v_im;
        re[targetIdx] = u_re - v_re;
        im[targetIdx] = u_im - v_im;

        const next_w_re = w_re * wlen_re - w_im * wlen_im;
        const next_w_im = w_re * wlen_im + w_im * wlen_re;
        w_re = next_w_re;
        w_im = next_w_im;
      }
    }
  }
}

export function findMp3FrameBoundaries(arrayBuffer: ArrayBuffer): number[] {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  const offsets: number[] = [];
  let offset = 0;

  const bitrateTableV1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitrateTableV2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const sampleRateTable = [
    [44100, 48000, 32000, 0], // V1
    [22050, 24000, 16000, 0], // V2
    [11025, 12000, 8000, 0]   // V2.5
  ];

  while (offset < len - 4) {
    if (bytes[offset] !== 0xFF || (bytes[offset + 1] & 0xE0) !== 0xE0) {
      offset++;
      continue;
    }

    const versionIndex = (bytes[offset + 1] >> 3) & 0x03;
    const layer = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0F;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;

    if (versionIndex === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset++;
      continue;
    }

    const versionMap = [2, -1, 1, 0];
    const version = versionMap[versionIndex];
    if (version === -1) {
      offset++;
      continue;
    }

    const bitrate = version === 0 ? bitrateTableV1[bitrateIndex] * 1000 : bitrateTableV2[bitrateIndex] * 1000;
    const sampleRate = sampleRateTable[version][sampleRateIndex];

    let frameSize = 0;
    if (layer === 3) {
      frameSize = Math.floor((12 * bitrate) / sampleRate + padding) * 4;
    } else {
      const coefficients = version === 0 ? 144 : 72;
      frameSize = Math.floor((coefficients * bitrate) / sampleRate) + padding;
    }

    if (frameSize <= 0) {
      offset++;
      continue;
    }

    offsets.push(offset);
    offset += frameSize;
  }

  return offsets;
}

export async function analyzeAudioFile(
  file: File,
  onProgress: (status: string) => void
): Promise<AnalysisResult> {
  const arrayBuffer = await file.arrayBuffer();

  onProgress("Estimating audio metadata...");
  let durationSec = await getAudioDuration(file);
  if (durationSec <= 0) {
    // Fallback: estimate based on file size (approx 128kbps)
    durationSec = file.size / (128 * 1024 / 8);
  }

  const optimalRate = calculateOptimalSampleRate(durationSec);
  const targetSr = 16000;

  onProgress(`Decoding audio at optimized rate of ${optimalRate / 1000}kHz...`);
  const AudioContextClass = typeof window !== "undefined"
    ? (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : null;
    
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this environment.");
  }

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContextClass({ sampleRate: optimalRate });
  } catch {
    ctx = new AudioContextClass();
  }

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeAudioDataWithRetry(arrayBuffer, optimalRate, onProgress, ctx);
  } finally {
    // We will extract and copy the mono channel data first.
  }

  const numChannels = audioBuffer.numberOfChannels;
  const originalSr = audioBuffer.sampleRate;
  const chData = audioBuffer.getChannelData(0);
  let decodedMono = new Float32Array(chData.length);
  if (numChannels > 1) {
    const chData2 = audioBuffer.getChannelData(1);
    for (let j = 0; j < chData.length; j++) {
      decodedMono[j] = (chData[j] + chData2[j]) / 2;
    }
  } else {
    decodedMono.set(chData);
  }

  // Release the heavy stereo AudioBuffer from the AudioContext memory immediately
  try {
    await ctx.close();
  } catch {}

  let monoData: Float32Array;
  if (originalSr !== targetSr) {
    onProgress(`Upsampling mono signal to ${targetSr / 1000}kHz...`);
    const ratio = originalSr / targetSr;
    const resampledLength = Math.round(decodedMono.length / ratio);
    monoData = new Float32Array(resampledLength);
    for (let j = 0; j < resampledLength; j++) {
      const srcIndex = j * ratio;
      const indexLow = Math.floor(srcIndex);
      const indexHigh = Math.min(decodedMono.length - 1, indexLow + 1);
      const weight = srcIndex - indexLow;
      monoData[j] = decodedMono[indexLow] * (1 - weight) + decodedMono[indexHigh] * weight;
    }
    decodedMono = new Float32Array(0); // free original mono buffer
  } else {
    monoData = decodedMono;
  }

  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
  const isMobile = typeof navigator !== "undefined" ? /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) : false;

  const useLowSpec = isMobile || cores <= 4;
  const hopFine = useLowSpec ? 320 : 160;
  const fftSize = useLowSpec ? 1024 : 2048;
  const frameDuration = hopFine / targetSr;
  const frameLength = useLowSpec ? 512 : 800;

  // Hann Window Cache
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  const rmsFine: number[] = [];
  const tFine: number[] = [];
  const spectrograms: Float32Array[] = [];
  const centroids: number[] = [];

  const fftRe = new Float32Array(fftSize);
  const fftIm = new Float32Array(fftSize);

  onProgress("Extracting fine energy envelope...");
  for (let j = 0; j < monoData.length; j += hopFine) {
    if (j + frameLength > monoData.length) break;
    let sumSq = 0;
    for (let k = 0; k < frameLength; k++) {
      sumSq += monoData[j + k] * monoData[j + k];
    }
    rmsFine.push(Math.sqrt(sumSq / frameLength));
    tFine.push(j / targetSr);
  }

  onProgress("Analyzing spectral transitions...");
  const totalSec = Math.floor(monoData.length / targetSr);
  for (let s = 0; s < totalSec; s++) {
    const startIdx = s * targetSr;
    fftRe.fill(0);
    fftIm.fill(0);
    for (let j = 0; j < fftSize; j++) {
      const idx = startIdx + j;
      if (idx < monoData.length) {
        fftRe[j] = monoData[idx] * hann[j];
      }
    }

    fft(fftRe, fftIm);

    const mags = new Float32Array(fftSize / 2);
    let centroidSum = 0;
    let magSum = 0;
    for (let j = 0; j < fftSize / 2; j++) {
      const mag = Math.sqrt(fftRe[j] * fftRe[j] + fftIm[j] * fftIm[j]);
      mags[j] = mag;
      centroidSum += j * mag;
      magSum += mag;
    }
    spectrograms.push(mags);
    centroids.push(magSum > 0 ? centroidSum / magSum : 0);
  }

  // Free resampled monoData array immediately
  monoData = new Float32Array(0);

  // Convert RMS fine to dB relative to maximum energy value (matching librosa)
  let maxRms = 1e-5;
  for (const r of rmsFine) {
    if (r > maxRms) maxRms = r;
  }
  const rmsDb = rmsFine.map((r) => {
    const ratioVal = r / maxRms;
    const db = ratioVal > 0 ? 20 * Math.log10(ratioVal) : -100;
    return Math.max(db, -100);
  });

  const duration = totalSec;

  // Group fine energy into 1-second chunks
  const energyPerSec: number[] = [];
  for (let s = 0; s < totalSec; s++) {
    let lo = 0;
    while (lo < tFine.length && tFine[lo] < s) lo++;
    let hi = lo;
    while (hi < tFine.length && tFine[hi] < s + 1) hi++;
    if (lo >= hi) {
      energyPerSec.push(-100);
      continue;
    }
    let sum = 0;
    for (let i = lo; i < hi; i++) {
      sum += rmsDb[i];
    }
    energyPerSec.push(Number((sum / (hi - lo)).toFixed(1)));
  }
  
  onProgress("Finding silence valley candidates...");
  
  // Identify silence valleys (energy below -40.0dB, duration >= 80ms)
  const valleys: Valley[] = [];
  const valleyDbThreshold = -40.0;
  const minValleyFrames = Math.round(0.08 / frameDuration); // ~8 frames at 10ms hops, ~4 frames at 20ms hops
  let inValley = false;
  let valleyStartFrame = 0;
  
  for (let i = 0; i < rmsDb.length; i++) {
    const val = rmsDb[i];
    if (val < valleyDbThreshold && !inValley) {
      inValley = true;
      valleyStartFrame = i;
    } else if (val >= valleyDbThreshold && inValley) {
      inValley = false;
      const durationFrames = i - valleyStartFrame;
      if (durationFrames >= minValleyFrames) {
        // Find deepest sample
        let deepestFrame = valleyStartFrame;
        let minVal = rmsDb[valleyStartFrame];
        for (let k = valleyStartFrame; k < i; k++) {
          if (rmsDb[k] < minVal) {
            minVal = rmsDb[k];
            deepestFrame = k;
          }
        }
        const timeSec = tFine[deepestFrame];
        const depth = rmsDb[deepestFrame];
        const durSec = durationFrames * frameDuration;
        
        // check recovers: any value in the next 0.5s is > -15.0dB
        let recovers = false;
        const recoveryLimit = Math.min(i + Math.round(0.5 / frameDuration), rmsDb.length);
        for (let k = i; k < recoveryLimit; k++) {
          if (rmsDb[k] > -15.0) {
            recovers = true;
            break;
          }
        }
        
        // fade_before: mean energy of first half of preceding 1.5s is greater than second half
        const fadeLo = Math.max(0, deepestFrame - Math.round(1.5 / frameDuration));
        let fadeBefore = true;
        if (valleyStartFrame - fadeLo > 4) {
          const fadeSeg = rmsDb.slice(fadeLo, valleyStartFrame);
          const mid = Math.floor(fadeSeg.length / 2);
          let sum1 = 0;
          for (let k = 0; k < mid; k++) sum1 += fadeSeg[k];
          let sum2 = 0;
          for (let k = mid; k < fadeSeg.length; k++) sum2 += fadeSeg[k];
          fadeBefore = (sum1 / mid) > (sum2 / (fadeSeg.length - mid));
        }
        
        valleys.push({
          time_sec: Number(timeSec.toFixed(1)),
          time_min: `${Math.floor(timeSec / 60)}:${String(Math.floor(timeSec % 60)).padStart(2, "0")}`,
          depth_db: Number(depth.toFixed(1)),
          duration_s: Number(durSec.toFixed(3)),
          recovers,
          fade_before: fadeBefore,
          is_candidate: recovers && depth < -42.0,
        });
      }
    }
  }
  

  
  // Calculate mfcc_change proxy (spectral centroid change scaled to 0-60)
  const mfccChange: number[] = [0];
  for (let s = 1; s < totalSec; s++) {
    const diff = Math.abs(centroids[s] - centroids[s - 1]);
    mfccChange.push(Number((diff * 1.5).toFixed(2)));
  }
  
  // Calculate chroma_change proxy (spectral flux)
  const chromaChange: number[] = [0];
  for (let s = 1; s < totalSec; s++) {
    let flux = 0;
    const prev = spectrograms[s - 1];
    const curr = spectrograms[s];
    for (let i = 0; i < curr.length; i++) {
      const d = curr[i] - prev[i];
      if (d > 0) flux += d;
    }
    chromaChange.push(Number(flux.toFixed(3)));
  }
  
  // Calculate mel_novelty (normalized spectral difference)
  const melNovelty: number[] = [];
  let maxFlux = 1e-5;
  const fluxes: number[] = [0];
  for (let s = 1; s < totalSec; s++) {
    let diffSq = 0;
    const prev = spectrograms[s - 1];
    const curr = spectrograms[s];
    for (let i = 0; i < curr.length; i++) {
      const diff = curr[i] - prev[i];
      diffSq += diff * diff;
    }
    const val = Math.sqrt(diffSq);
    fluxes.push(val);
    if (val > maxFlux) maxFlux = val;
  }
  for (const f of fluxes) {
    melNovelty.push(Number((f / maxFlux).toFixed(3)));
  }
  
  onProgress("Smoothing novelty peaks...");
  
  // Combined raw novelty (matching logic from pipeline.py)
  const noveltyRaw: number[] = [];
  for (let s = 0; s < totalSec; s++) {
    const m = Math.min(mfccChange[s] / 50.0, 1.0);
    const c = Math.min(chromaChange[s] / 3.0, 1.0);
    const n = melNovelty[s];
    noveltyRaw.push(Number(((m * 0.4) + (c * 0.35) + (n * 0.25)).toFixed(3)));
  }
  
  // Savitzky-Golay / Moving Average Smoothing (window width = 13)
  const noveltySmooth: number[] = [];
  const windowSize = 13;
  const halfW = Math.floor(windowSize / 2);
  let maxSmooth = 1e-5;
  const smoothVals: number[] = [];
  
  for (let s = 0; s < totalSec; s++) {
    let sum = 0;
    let count = 0;
    for (let j = -halfW; j <= halfW; j++) {
      const idx = s + j;
      if (idx >= 0 && idx < totalSec) {
        sum += noveltyRaw[idx];
        count++;
      }
    }
    const val = sum / count;
    smoothVals.push(val);
    if (val > maxSmooth) maxSmooth = val;
  }
  
  for (const val of smoothVals) {
    noveltySmooth.push(Number((val / maxSmooth).toFixed(3)));
  }
  
  // Find local maxima in noveltySmooth (min distance 120s)
  const topPeaks: NoveltyPeak[] = [];
  const minPeakDistance = 120;
  for (let s = 1; s < totalSec - 1; s++) {
    const val = noveltySmooth[s];
    if (val > noveltySmooth[s - 1] && val > noveltySmooth[s + 1] && val > 0.2) {
      let isDistanceOk = true;
      for (const p of topPeaks) {
        if (Math.abs(p.s - s) < minPeakDistance) {
          if (noveltySmooth[p.s] < val) {
            // Replace with better peak
            topPeaks.splice(topPeaks.indexOf(p), 1);
          } else {
            isDistanceOk = false;
          }
          break;
        }
      }
      if (isDistanceOk) {
        topPeaks.push({
          s,
          t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
          novelty: val,
        });
      }
    }
  }
  topPeaks.sort((a, b) => b.novelty - a.novelty);
  
  // Format per_second table
  const perSecond = [];
  for (let s = 0; s < totalSec; s++) {
    perSecond.push({
      s,
      t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
      energy_db: energyPerSec[s],
      mfcc_mean: 0.0, // Dummy placeholder
      mfcc_std: 0.0,  // Dummy placeholder
      mfcc_change: mfccChange[s],
      chroma_key: 0,  // Dummy placeholder
      chroma_change: chromaChange[s],
      mel_novelty: melNovelty[s],
      novelty: noveltyRaw[s],
      novelty_smooth: noveltySmooth[s],
    });
  }
  
  const targetSongs = Math.max(2, Math.round(duration / (4.5 * 60)));
  const strongCandidates = valleys.filter((v) => v.is_candidate && v.depth_db < -42.0);
  
  // Context was managed and closed internally during decoding/resampling
  
  return {
    metadata: {
      duration_sec: Number(duration.toFixed(1)),
      duration_fmt: `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`,
      sample_rate: targetSr,
      target_songs: targetSongs,
      min_song_sec: 180,
      max_song_sec: 390,
    },
    energy_valleys: valleys,
    strong_candidates: strongCandidates,
    top_novelty_peaks: topPeaks.slice(0, 12),
    per_second: perSecond,
  };
}
