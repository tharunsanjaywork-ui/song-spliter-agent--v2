import os
import subprocess
import tempfile
import time
import logging
import numpy as np
from scipy.io import wavfile

logger = logging.getLogger(__name__)

def analyze_audio_file(mp3_path: str) -> dict:
    """
    Perform memory-efficient audio feature extraction.
    Downsamples to 16kHz mono WAV using ffmpeg, then computes RMS DB and spectral features using NumPy.
    """
    t0 = time.time()
    
    # 1. Run FFmpeg to downsample to 16kHz mono WAV
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        tmp_wav_name = tmp_wav.name
        
    cmd = [
        "ffmpeg", "-y",
        "-i", mp3_path,
        "-ar", "16000",
        "-ac", "1",
        "-f", "wav",
        tmp_wav_name
    ]
    
    logger.info("Running FFmpeg conversion to 16kHz mono WAV...")
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    t1 = time.time()
    logger.info(f"FFmpeg conversion completed in {t1 - t0:.2f} seconds.")
    
    # 2. Read the downsampled WAV file
    sr, y = wavfile.read(tmp_wav_name)
    if y.dtype == np.int16:
        y = y.astype(np.float32) / 32768.0
    elif y.dtype == np.int8:
        y = (y.astype(np.float32) - 128.0) / 128.0
        
    try:
        os.remove(tmp_wav_name)
    except Exception as e:
        logger.warning(f"Failed to remove temp WAV file: {e}")
        
    t2 = time.time()
    logger.info(f"Wav file loaded in {t2 - t1:.2f} seconds. Samples: {len(y)}, Duration: {len(y)/16000.0:.2f}s")
    
    duration = len(y) / 16000.0
    total_sec = int(duration)
    
    # 3. Calculate fine energy envelope
    hop_fine = 320
    frame_length = 512
    frame_duration = hop_fine / 16000.0
    
    from numpy.lib.stride_tricks import sliding_window_view
    windows = sliding_window_view(y, frame_length)[::hop_fine]
    rms_fine = np.sqrt(np.mean(windows ** 2, axis=1))
    
    max_rms = np.max(rms_fine) if len(rms_fine) > 0 else 1e-5
    if max_rms < 1e-5:
        max_rms = 1e-5
    rms_db = 20 * np.log10(rms_fine / max_rms)
    rms_db = np.maximum(rms_db, -100.0)
    
    # Group fine energy into 1-second chunks
    num_frames = len(rms_fine)
    t_fine = np.arange(num_frames) * frame_duration
    energy_per_sec = []
    for s in range(total_sec):
        mask = (t_fine >= s) & (t_fine < s + 1)
        vals = rms_db[mask]
        if len(vals) == 0:
            energy_per_sec.append(-100.0)
        else:
            energy_per_sec.append(float(np.mean(vals)))
            
    # Silence valleys
    valleys = []
    in_valley = False
    valley_start = 0
    min_valley_frames = int(0.08 / frame_duration)
    
    for i in range(len(rms_db)):
        val = rms_db[i]
        if val < -40.0 and not in_valley:
            in_valley = True
            valley_start = i
        elif val >= -40.0 and in_valley:
            in_valley = False
            dur_frames = i - valley_start
            if dur_frames >= min_valley_frames:
                deepest_idx = valley_start + np.argmin(rms_db[valley_start:i])
                time_sec = t_fine[deepest_idx]
                depth = rms_db[deepest_idx]
                dur_sec = dur_frames * frame_duration
                
                # Check recovers
                recovery_limit = min(i + int(0.5 / frame_duration), len(rms_db))
                recovers = np.any(rms_db[i:recovery_limit] > -15.0)
                
                # Check fade_before
                fade_lo = max(0, deepest_idx - int(1.5 / frame_duration))
                fade_before = True
                if valley_start - fade_lo > 4:
                    fade_seg = rms_db[fade_lo:valley_start]
                    mid = len(fade_seg) // 2
                    fade_before = np.mean(fade_seg[:mid]) > np.mean(fade_seg[mid:])
                    
                valleys.append({
                    "time_sec": float(round(time_sec, 1)),
                    "time_min": f"{int(time_sec // 60)}:{int(time_sec % 60):02d}",
                    "depth_db": float(round(depth, 1)),
                    "duration_s": float(round(dur_sec, 3)),
                    "recovers": bool(recovers),
                    "fade_before": bool(fade_before),
                    "is_candidate": bool(recovers and depth < -42.0)
                })
                
    # 4. FFT Transitions
    fft_size = 1024
    hann = np.hanning(fft_size)
    spectrograms = []
    centroids = []
    
    for s in range(total_sec):
        start_idx = s * 16000
        chunk = np.zeros(fft_size, dtype=np.float32)
        chunk_len = min(fft_size, len(y) - start_idx)
        if chunk_len > 0:
            chunk[:chunk_len] = y[start_idx : start_idx + chunk_len]
            
        windowed = chunk * hann
        fft_res = np.fft.rfft(windowed, n=fft_size)
        mags = np.abs(fft_res)[:fft_size // 2]
        spectrograms.append(mags)
        
        indices = np.arange(len(mags))
        mag_sum = np.sum(mags)
        centroids.append(float(np.sum(indices * mags) / mag_sum if mag_sum > 0 else 0.0))
        
    centroids = np.array(centroids, dtype=np.float32)
    
    # MFCC change proxy
    mfcc_change = [0.0]
    for s in range(1, total_sec):
        diff = abs(centroids[s] - centroids[s-1])
        mfcc_change.append(float(round(diff * 1.5, 2)))
        
    # Chroma change proxy
    chroma_change = [0.0]
    for s in range(1, total_sec):
        prev = spectrograms[s - 1]
        curr = spectrograms[s]
        diff = curr - prev
        flux = np.sum(diff[diff > 0])
        chroma_change.append(float(round(flux, 3)))
        
    # Mel novelty
    fluxes = [0.0]
    for s in range(1, total_sec):
        prev = spectrograms[s - 1]
        curr = spectrograms[s]
        val = np.sqrt(np.sum((curr - prev) ** 2))
        fluxes.append(val)
    fluxes = np.array(fluxes, dtype=np.float32)
    max_flux = np.max(fluxes) if len(fluxes) > 0 else 1e-5
    if max_flux < 1e-5:
        max_flux = 1e-5
    mel_novelty = fluxes / max_flux
    mel_novelty = [float(round(x, 3)) for x in mel_novelty]
    
    # Novelty Raw & Smooth
    novelty_raw = []
    for s in range(total_sec):
        m = min(mfcc_change[s] / 50.0, 1.0)
        c = min(chroma_change[s] / 3.0, 1.0)
        n = mel_novelty[s]
        val = (m * 0.4) + (c * 0.35) + (n * 0.25)
        novelty_raw.append(float(round(val, 3)))
        
    smooth_vals = []
    window_size = 13
    half_w = window_size // 2
    for s in range(total_sec):
        start_idx = max(0, s - half_w)
        end_idx = min(total_sec, s + half_w + 1)
        smooth_vals.append(np.mean(novelty_raw[start_idx:end_idx]))
        
    smooth_vals = np.array(smooth_vals, dtype=np.float32)
    max_smooth = np.max(smooth_vals) if len(smooth_vals) > 0 else 1e-5
    if max_smooth < 1e-5:
        max_smooth = 1e-5
    novelty_smooth = smooth_vals / max_smooth
    novelty_smooth = [float(round(x, 3)) for x in novelty_smooth]
    
    # Top Peaks
    top_peaks = []
    min_peak_distance = 120
    for s in range(1, total_sec - 1):
        val = novelty_smooth[s]
        if val > novelty_smooth[s - 1] and val > novelty_smooth[s + 1] and val > 0.2:
            is_distance_ok = True
            for p in list(top_peaks):
                if abs(p["s"] - s) < min_peak_distance:
                    if novelty_smooth[p["s"]] < val:
                        top_peaks.remove(p)
                    else:
                        is_distance_ok = False
                    break
            if is_distance_ok:
                top_peaks.append({
                    "s": s,
                    "t": f"{s // 60}:{s % 60:02d}",
                    "novelty": val
                })
    top_peaks.sort(key=lambda x: x["novelty"], reverse=True)
    
    # Per second formatting
    per_second = []
    for s in range(total_sec):
        per_second.append({
            "s": s,
            "t": f"{s // 60}:{s % 60:02d}",
            "energy_db": float(round(energy_per_sec[s], 1)),
            "mfcc_mean": 0.0,
            "mfcc_std": 0.0,
            "mfcc_change": mfcc_change[s],
            "chroma_key": 0,
            "chroma_change": chroma_change[s],
            "mel_novelty": mel_novelty[s],
            "novelty": novelty_raw[s],
            "novelty_smooth": novelty_smooth[s]
        })
        
    target_songs = max(2, int(round(duration / (4.5 * 60))))
    strong_candidates = [v for v in valleys if v["is_candidate"] and v["depth_db"] < -42.0]
    
    result = {
        "metadata": {
            "duration_sec": float(round(duration, 1)),
            "duration_fmt": f"{int(duration // 60)}:{int(duration % 60):02d}",
            "sample_rate": 16000,
            "target_songs": target_songs,
            "min_song_sec": 180,
            "max_song_sec": 390
        },
        "energy_valleys": valleys,
        "strong_candidates": strong_candidates,
        "top_novelty_peaks": top_peaks[:12],
        "per_second": per_second
    }
    
    t3 = time.time()
    logger.info(f"Features extracted in {t3 - t2:.2f} seconds. Total time: {t3 - t0:.2f}s")
    return result
