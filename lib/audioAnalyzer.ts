/**
 * lib/audioAnalyzer.ts
 * Web Audio API based audio analysis.
 * Performs client-side audio decoding, resampling to 16kHz, mono-mixing,
 * and extracts volume/spectral features to construct the JSON analysis table for the LLM.
 */

import { decodeAudioDataWithRetry } from "./audioUtils";

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

export async function analyzeAudioFile(
  file: File,
  onProgress: (status: string) => void
): Promise<AnalysisResult> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await decodeAudioDataWithRetry(arrayBuffer, 16000, onProgress);
  
  onProgress("Mixing to mono & downsampling to 16kHz...");
  const duration = audioBuffer.duration;
  const numChannels = audioBuffer.numberOfChannels;
  const originalSr = audioBuffer.sampleRate;
  const targetSr = 16000;
  
  // Mix stereo channels to mono
  const chData = audioBuffer.getChannelData(0);
  const monoData = new Float32Array(chData.length);
  if (numChannels > 1) {
    const chData2 = audioBuffer.getChannelData(1);
    for (let i = 0; i < chData.length; i++) {
      monoData[i] = (chData[i] + chData2[i]) / 2;
    }
  } else {
    monoData.set(chData);
  }
  
  // Linear Downsampling to 16000Hz (same as Python's downsampling step)
  const ratio = originalSr / targetSr;
  const downsampledLength = Math.round(monoData.length / ratio);
  const data = new Float32Array(downsampledLength);
  for (let i = 0; i < downsampledLength; i++) {
    const srcIndex = Math.round(i * ratio);
    data[i] = monoData[Math.min(srcIndex, monoData.length - 1)];
  }
  
  onProgress("Extracting fine energy envelope...");
  
  // Device performance detection
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
  const isMobile = typeof navigator !== "undefined" ? /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) : false;
  
  // Choose settings based on performance
  // Default (High Performance): hopFine = 160 (10ms), fftSize = 2048
  // Low Performance (low core count or mobile): hopFine = 320 (20ms), fftSize = 1024
  const useLowSpec = isMobile || cores <= 4;
  const hopFine = useLowSpec ? 320 : 160;
  const fftSize = useLowSpec ? 1024 : 2048;
  const frameDuration = hopFine / targetSr;
  
  const frameLength = useLowSpec ? 512 : 800;
  const rmsFine: number[] = [];
  const tFine: number[] = [];
  
  for (let i = 0; i < data.length; i += hopFine) {
    if (i + frameLength > data.length) break;
    let sumSq = 0;
    for (let j = 0; j < frameLength; j++) {
      sumSq += data[i + j] * data[i + j];
    }
    rmsFine.push(Math.sqrt(sumSq / frameLength));
    tFine.push(i / targetSr);
  }
  
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
  
  // Group fine energy into 1-second chunks
  const totalSec = Math.floor(duration);
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
  
  onProgress("Running spectral transition analysis (FFT)...");
  
  // Calculate Spectral Centroid (Timbre) and Spectral Flux (Chroma Key/Novelty proxies)
  const fftRe = new Float32Array(fftSize);
  const fftIm = new Float32Array(fftSize);
  
  // Hann Window Cache
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }
  
  const spectrograms: Float32Array[] = [];
  const centroids: number[] = [];
  
  for (let s = 0; s < totalSec; s++) {
    const startIdx = s * 16000;
    fftRe.fill(0);
    fftIm.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const idx = startIdx + i;
      if (idx < data.length) {
        fftRe[i] = data[idx] * hann[i];
      }
    }
    
    fft(fftRe, fftIm);
    
    const mags = new Float32Array(fftSize / 2);
    let centroidSum = 0;
    let magSum = 0;
    for (let i = 0; i < fftSize / 2; i++) {
      const mag = Math.sqrt(fftRe[i] * fftRe[i] + fftIm[i] * fftIm[i]);
      mags[i] = mag;
      centroidSum += i * mag;
      magSum += mag;
    }
    spectrograms.push(mags);
    centroids.push(magSum > 0 ? centroidSum / magSum : 0);
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
