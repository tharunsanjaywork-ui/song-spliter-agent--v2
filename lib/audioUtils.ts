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
    ? (navigator as any).deviceMemory || 4
    : 4;

  const maxSafeMemoryBytes = Math.min(1.2 * 1024 * 1024 * 1024, ramGB * 0.12 * 1024 * 1024 * 1024);
  const maxSampleRate = maxSafeMemoryBytes / (totalDurationSec * 8);

  if (maxSampleRate >= 44100) return 44100;
  if (maxSampleRate >= 32000) return 32000;
  if (maxSampleRate >= 22050) return 22050;
  if (maxSampleRate >= 16000) return 16000;
  return 11025;
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
    lamejs = require("lamejs");
  } catch (err) {
    throw new Error("lamejs could not be loaded client-side: " + err);
  }

  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const kbps = 128;
  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
  
  const mp3Data: any[] = [];
  
  const floatToInt16 = (float32: Float32Array): Int16Array => {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  };
  
  const leftInt16 = floatToInt16(buffer.getChannelData(0));
  const rightInt16 = channels > 1 ? floatToInt16(buffer.getChannelData(1)) : null;
  
  const sampleLength = buffer.length;
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
