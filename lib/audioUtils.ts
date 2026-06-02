/**
 * Audio manipulation utilities — pure functions, no side effects.
 * All run client-side via Web Audio API.
 */

/** Writes a 4-char ASCII string into a DataView at the given byte offset. */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encodes an AudioBuffer as a 16-bit PCM WAV ArrayBuffer.
 * Ready to be wrapped in a Blob and saved with file-saver.
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * numChannels * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return ab;
}

/**
 * Slices an AudioBuffer between startSec and endSec.
 * Returns a new AudioBuffer — does not mutate the source.
 */
export function sliceAudioBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sr));
  const endSample = Math.min(buffer.length, Math.floor(endSec * sr));
  const length = Math.max(1, endSample - startSample);
  const sliced = ctx.createBuffer(buffer.numberOfChannels, length, sr);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    sliced.copyToChannel(buffer.getChannelData(ch).slice(startSample, endSample), ch);
  }

  return sliced;
}

/** Formats seconds as M:SS */
export function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Uses a lightweight, temporary HTML5 Audio element to read metadata and
 * resolve the duration of a local file in seconds without decoding it.
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(0);
      return;
    }
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;

    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(objectUrl);
    };

    audio.onerror = () => {
      resolve(0); // fallback if metadata cannot be parsed
      URL.revokeObjectURL(objectUrl);
    };
  });
}

/**
 * Calculates the optimal sample rate for loading audio files client-side.
 * Balances memory footprint (to avoid V8 heap allocation OOM tab crashes) and audio quality.
 */
export function calculateOptimalSampleRate(totalDurationSec: number): number {
  if (totalDurationSec <= 0) return 44100;

  const ramGB = typeof navigator !== "undefined" && "deviceMemory" in navigator
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (navigator as any).deviceMemory || 4
    : 4;

  const maxSafeMemoryBytes = Math.min(1.2 * 1024 * 1024 * 1024, ramGB * 0.12 * 1024 * 1024 * 1024);
  const maxSampleRate = maxSafeMemoryBytes / (totalDurationSec * 8);

  if (maxSampleRate >= 44100) return 44100;
  if (maxSampleRate >= 32000) return 32000;
  if (maxSampleRate >= 22050) return 22050;
  if (maxSampleRate >= 16000) return 16000;
  if (maxSampleRate >= 11025) return 11025;
  return 8000;
}

/**
 * Encodes an AudioBuffer as a 128kbps MP3 Blob client-side using lamejs.
 * Runs asynchronously and yields control to the browser event loop regularly
 * to keep the tab fully responsive and avoid "Page Unresponsive" freezing.
 */
export async function audioBufferToMp3(
  buffer: AudioBuffer,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  let lamejs;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lamejs = require("lamejs");
  } catch (err) {
    throw new Error("lamejs could not be loaded client-side: " + err);
  }

  const channels = buffer.numberOfChannels;
  const originalSr = buffer.sampleRate;
  const targetSr = 44100; // Always encode MP3 at standard 44.1kHz for maximum compatibility and encoder stability
  const kbps = 128;
  const mp3encoder = new lamejs.Mp3Encoder(channels, targetSr, kbps);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mp3Data: any[] = [];
  
  // Resample channels to 44.1kHz in JS if needed
  let leftData = buffer.getChannelData(0);
  let rightData = channels > 1 ? buffer.getChannelData(1) : null;
  let sampleLength = buffer.length;

  if (originalSr !== targetSr) {
    const ratio = originalSr / targetSr;
    sampleLength = Math.round(buffer.length / ratio);
    
    // Resample left channel
    const resampledLeft = new Float32Array(sampleLength);
    for (let i = 0; i < sampleLength; i++) {
      const srcIndex = i * ratio;
      const indexLow = Math.floor(srcIndex);
      const indexHigh = Math.min(leftData.length - 1, indexLow + 1);
      const weight = srcIndex - indexLow;
      resampledLeft[i] = leftData[indexLow] * (1 - weight) + leftData[indexHigh] * weight;
    }
    leftData = resampledLeft;
    
    // Resample right channel
    if (rightData) {
      const resampledRight = new Float32Array(sampleLength);
      for (let i = 0; i < sampleLength; i++) {
        const srcIndex = i * ratio;
        const indexLow = Math.floor(srcIndex);
        const indexHigh = Math.min(rightData.length - 1, indexLow + 1);
        const weight = srcIndex - indexLow;
        resampledRight[i] = rightData[indexLow] * (1 - weight) + rightData[indexHigh] * weight;
      }
      rightData = resampledRight;
    }
  }

  const floatToInt16 = (float32: Float32Array): Int16Array => {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  };
  
  const leftInt16 = floatToInt16(leftData);
  const rightInt16 = rightData ? floatToInt16(rightData) : null;
  
  const sampleBlockSize = 1152;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const blocksPerYield = cores >= 8 ? 500 : cores >= 4 ? 250 : 100;
  let blockCount = 0;
  
  for (let i = 0; i < sampleLength; i += sampleBlockSize) {
    const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
    let mp3buf: Int8Array;
    if (channels > 1 && rightInt16) {
      const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    }
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
    
    blockCount++;
    if (blockCount % blocksPerYield === 0) {
      if (onProgress) {
        onProgress(Math.round((i / sampleLength) * 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf));
  }
  
  if (onProgress) {
    onProgress(100);
  }
  
  return new Blob(mp3Data, { type: "audio/mp3" });
}

/**
 * Resamples an AudioBuffer to a target sample rate in JS.
 * Uses a linear resampler and yields execution in chunks to prevent the UI from freezing.
 */
export async function resampleAudioBuffer(
  originalBuffer: AudioBuffer,
  targetSampleRate: number,
  ctx: AudioContext,
  onProgress?: (progressMsg: string) => void
): Promise<AudioBuffer> {
  const numChannels = originalBuffer.numberOfChannels;
  const originalSr = originalBuffer.sampleRate;
  if (originalSr === targetSampleRate) {
    return originalBuffer;
  }
  
  const ratio = originalSr / targetSampleRate;
  const newLength = Math.round(originalBuffer.length / ratio);
  const resampledBuffer = ctx.createBuffer(numChannels, newLength, targetSampleRate);
  
  for (let ch = 0; ch < numChannels; ch++) {
    const originalData = originalBuffer.getChannelData(ch);
    const resampledData = resampledBuffer.getChannelData(ch);
    
    // Process in chunks to prevent UI blocking
    const chunkSize = 5000000; // 5M samples per yield
    for (let i = 0; i < newLength; i += chunkSize) {
      const end = Math.min(newLength, i + chunkSize);
      for (let j = i; j < end; j++) {
        const srcIndex = j * ratio;
        const indexLow = Math.floor(srcIndex);
        const indexHigh = Math.min(originalData.length - 1, indexLow + 1);
        const weight = srcIndex - indexLow;
        resampledData[j] = originalData[indexLow] * (1 - weight) + originalData[indexHigh] * weight;
      }
      
      if (onProgress) {
        onProgress(`Resampling channel ${ch + 1}/${numChannels}: ${Math.round((end / newLength) * 100)}%`);
      }
      // Yield to event loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  
  return resampledBuffer;
}

/**
 * Safely creates an AudioContext at the target sample rate.
 * If the browser throws an error due to the rate being too low, it automatically falls back
 * through standard rates (22050Hz, 32000Hz, or native hardware rate).
 */
export function createSafeAudioContext(targetRate: number): AudioContext {
  const AudioContextClass = typeof window !== "undefined"
    ? (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : null;
    
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this environment.");
  }

  const rates = [targetRate, 22050, 32000, 0];
  for (const rate of rates) {
    try {
      if (rate === 0) {
        return new AudioContextClass();
      } else {
        return new AudioContextClass({ sampleRate: rate });
      }
    } catch (err) {
      console.warn(`Failed to create AudioContext at ${rate}Hz, trying fallback...`, err);
    }
  }
  throw new Error("Failed to create AudioContext after all fallbacks.");
}

/**
 * Decodes an audio file array buffer into an AudioBuffer at a target sample rate.
 * Uses a robust, multi-stage retry fallback sequence to handle browser decoding limitations and OOM:
 * 1. Tries to decode directly at the target sample rate (reusing existingCtx if provided).
 * 2. Tries standard 22050 Hz (if target was lower).
 * 3. Tries standard 32000 Hz (if target was lower).
 * 4. Tries the native default hardware sample rate (typically 44.1kHz or 48kHz).
 * 
 * Automatically calls resampleAudioBuffer in JS if the decoded sample rate is higher than target.
 */
export async function decodeAudioDataWithRetry(
  arrayBuffer: ArrayBuffer,
  targetSampleRate: number,
  onProgress: (status: string) => void,
  existingCtx?: AudioContext
): Promise<AudioBuffer> {
  const AudioContextClass = typeof window !== "undefined"
    ? (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : null;
    
  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported in this environment.");
  }

  const tryDecode = async (ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> => {
    return await ctx.decodeAudioData(buffer);
  };

  // Build the list of rates to try in order
  const ratesToTry = [targetSampleRate];
  if (targetSampleRate < 22050) ratesToTry.push(22050);
  if (targetSampleRate < 32000) ratesToTry.push(32000);
  // Last fallback is native default rate (0 will represent new AudioContext Class with no options)
  ratesToTry.push(0);

  for (let idx = 0; idx < ratesToTry.length; idx++) {
    const rate = ratesToTry[idx];
    const isLast = idx === ratesToTry.length - 1;
    const rateLabel = rate === 0 ? "native rate" : `${rate / 1000}kHz`;
    
    // Slice a copy of the array buffer so the original remains intact if this attempt fails/neuters it
    const bufferCopy = isLast ? arrayBuffer : arrayBuffer.slice(0);
    
    let tempCtx: AudioContext | null = null;
    let useExisting = false;
    
    try {
      if (rate === targetSampleRate && existingCtx) {
        tempCtx = existingCtx;
        useExisting = true;
      } else {
        tempCtx = rate === 0
          ? new AudioContextClass()
          : new AudioContextClass({ sampleRate: rate });
      }
      
      onProgress(`Decoding attempt ${idx + 1}/${ratesToTry.length} (at ${rateLabel})...`);
      const decoded = await tryDecode(tempCtx, bufferCopy);
      
      // If we decoded at a higher rate than target, we resample it to the target rate in JS
      const currentRate = decoded.sampleRate;
      if (currentRate !== targetSampleRate) {
        onProgress(`Resampling from ${currentRate / 1000}kHz to ${targetSampleRate / 1000}kHz...`);
        const resampled = await resampleAudioBuffer(
          decoded,
          targetSampleRate,
          tempCtx,
          onProgress
        );
        if (!useExisting) {
          await tempCtx.close();
        }
        return resampled;
      }
      
      if (!useExisting) {
        await tempCtx.close();
      }
      return decoded;
    } catch (err) {
      console.warn(`Decoding attempt ${idx + 1} at ${rateLabel} failed:`, err);
      if (tempCtx && !useExisting) {
        try {
          await tempCtx.close();
        } catch {}
      }
      
      if (isLast) {
        throw new Error(
          "Unable to decode audio data. Please ensure it is a valid, uncorrupted audio file."
        );
      }
    }
  }
  
  throw new Error("Unable to decode audio data.");
}

