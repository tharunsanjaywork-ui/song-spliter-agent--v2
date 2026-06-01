"use client";

import React, {
  useState, useEffect, useRef, useCallback, ChangeEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { audioBufferToMp3, sliceAudioBuffer, formatSec, getAudioDuration, calculateOptimalSampleRate, decodeAudioDataWithRetry } from "@/lib/audioUtils";
import {
  saveEditorSession,
  saveEditorSegments,
  loadEditorSession,
  clearEditorSession,
} from "@/lib/editorStorage";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Segment {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
}

export interface AudioEditorProps {
  initialFileUrl?: string;
  initialFileName?: string;
  initialFileUrls?: string[];
  initialFileNames?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();

function buildSegmentName(index: number): string {
  return `Track ${String(index + 1).padStart(2, "0")}`;
}

function concatenateAudioBuffers(ctx: AudioContext, buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) throw new Error("No buffers to concatenate");
  if (buffers.length === 1) return buffers[0];

  const targetSampleRate = buffers[0].sampleRate;
  const maxChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);

  const merged = ctx.createBuffer(maxChannels, totalLength, targetSampleRate);

  for (let ch = 0; ch < maxChannels; ch++) {
    const channelData = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      const srcCh = Math.min(ch, buf.numberOfChannels - 1);
      channelData.set(buf.getChannelData(srcCh), offset);
      offset += buf.length;
    }
    merged.copyToChannel(channelData, ch);
  }

  return merged;
}

/**
 * Convert an AudioBuffer into a playable WAV Blob.
 * Uses typed arrays instead of per-sample DataView writes for 10-50x faster performance.
 */
function bufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bps = 2; // 16-bit
  const dataSize = len * numCh * bps;

  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  // WAV header
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);         // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bps, true);
  view.setUint16(32, numCh * bps, true);
  view.setUint16(34, 16, true);        // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  // Use Int16Array view for bulk writes — much faster than DataView per-sample
  const samples = new Int16Array(ab, 44);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numCh; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let idx = 0;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      samples[idx++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  icon, label, onClick, disabled, disabledReason, delay = 0, onShowBlockedMsg,
}: {
  icon: string; label: string; onClick: () => void; disabled?: boolean; disabledReason?: string; delay?: number; onShowBlockedMsg?: (msg: string) => void;
}) {
  const handleClick = () => {
    if (disabled && disabledReason) {
      onShowBlockedMsg?.(disabledReason);
      return;
    }
    if (!disabled) onClick();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="relative group"
    >
      <button
        onClick={handleClick}
        aria-label={label}
        className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border text-xs font-body transition
          ${disabled
            ? "opacity-40 cursor-pointer border-transparent"
            : "border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)]"
          }`}
      >
        <span className="text-base leading-none">{icon}</span>
        <span className="hidden sm:block">{label}</span>
      </button>
      {/* Tooltip: show label when enabled, show disabled reason when disabled */}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
        <div className={`border text-[10px] font-body px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg ${
          disabled
            ? "bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.25)] text-[var(--error)]"
            : "bg-[var(--bg-surface)] border-[var(--glass-border)] text-[var(--text-secondary)]"
        }`}>
          {disabled && disabledReason ? disabledReason : label}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Segment List Item ────────────────────────────────────────────────────────

function SegmentItem({
  segment, index, selected, isEditing, editValue, onSelect,
  onDoubleClick, onEditChange, onEditCommit, onEditCancel, onDownload,
  draggable, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave,
}: {
  segment: Segment; index: number; selected: boolean; isEditing: boolean;
  editValue: string; onSelect: (e: React.MouseEvent) => void; onDoubleClick: () => void;
  onEditChange: (v: string) => void; onEditCommit: () => void; onEditCancel: () => void;
  onDownload: () => void;
  draggable: boolean;
  isDragOver: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDragLeave: () => void;
}) {
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isEditing) { editRef.current?.focus(); editRef.current?.select(); } }, [isEditing]);
  const segDuration = segment.endSec - segment.startSec;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onSelect}
      draggable={draggable && !isEditing}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      className={`group flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition
        ${selected
          ? "bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.25)]"
          : "border-transparent hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--glass-border)]"}
        ${draggable && !isEditing ? "cursor-grab active:cursor-grabbing" : ""}
        ${isDragOver ? "border-t-2 border-t-[var(--accent-cyan)]" : ""}`}
    >
      <div className="w-1 self-stretch rounded-full flex-shrink-0"
        style={{ background: selected ? "var(--accent-cyan)" : "var(--glass-border)" }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          {isEditing ? (
            <input ref={editRef} value={editValue} onChange={(e) => onEditChange(e.target.value)}
              onBlur={onEditCommit}
              onKeyDown={(e) => { if (e.key === "Enter") onEditCommit(); if (e.key === "Escape") onEditCancel(); }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 font-body text-xs bg-transparent border-b border-[var(--accent-cyan)] text-[var(--text-primary)] outline-none pb-0.5" maxLength={60} />
          ) : (
            <p className="flex-1 font-body text-xs font-semibold text-[var(--text-primary)] truncate"
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }} title="Double-click to rename">
              {segment.name}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {formatSec(segment.startSec)}–{formatSec(segment.endSec)}
            <span className="ml-1 opacity-60">({formatSec(segDuration)})</span>
          </span>
          <button onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="opacity-0 group-hover:opacity-100 transition text-[10px] text-[var(--accent-cyan)] hover:underline">
            ↓
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Waveform Segment Overlay ──────────────────────────────────────────────────

function SegmentOverlay({ segment, index, duration, selected, onClick }: {
  segment: Segment; index: number; duration: number; selected: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  if (!duration) return null;
  const leftPct = (segment.startSec / duration) * 100;
  const widthPct = ((segment.endSec - segment.startSec) / duration) * 100;
  const colors = ["rgba(0,212,255,0.12)", "rgba(139,92,246,0.12)", "rgba(34,197,94,0.1)", "rgba(251,146,60,0.1)"];
  const borders = ["rgba(0,212,255,0.4)", "rgba(139,92,246,0.4)", "rgba(34,197,94,0.35)", "rgba(251,146,60,0.35)"];
  const ci = index % colors.length;
  return (
    <div className="absolute top-0 h-full pointer-events-none border-l-2"
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: selected ? colors[ci] : "transparent", borderColor: borders[ci] }}
      title={segment.name}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        className="absolute top-1.5 left-1.5 font-mono text-[10px] text-white/90 bg-[rgba(26,26,26,0.85)] hover:bg-[rgba(0,212,255,0.25)] border border-[rgba(255,255,255,0.15)] hover:border-[rgba(0,212,255,0.5)] px-2 py-0.5 rounded-md cursor-pointer pointer-events-auto select-none transition truncate max-w-[90%] shadow-lg"
      >
        {segment.name}
      </span>
    </div>
  );
}

// ─── Empty Drop Zone ──────────────────────────────────────────────────────────

function EditorDropZone({ dragOver, onDragOver, onDragLeave, onDrop, onClick }: {
  dragOver: boolean; onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void; onDrop: (e: React.DragEvent) => void; onClick: () => void;
}) {
  return (
    <motion.div onClick={onClick} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      animate={{
        borderColor: dragOver ? "rgba(0,212,255,0.8)" : ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0.08)"],
        backgroundColor: dragOver ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.01)",
        scale: dragOver ? 1.02 : 1,
      }}
      transition={dragOver ? { duration: 0.2 } : { borderColor: { duration: 2, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 0.2 } }}
      className="w-full max-w-xl border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer select-none">
      <span className="text-5xl mb-4">{dragOver ? "⬇️" : "🎵"}</span>
      <p className="font-heading text-xl font-bold text-[var(--text-primary)] mb-2">Drop your audio files here</p>
      <p className="font-body text-sm text-[var(--text-secondary)]">or click to choose files (select multiple)</p>
      <p className="font-mono text-xs text-[var(--text-muted)] mt-3">MP3 · WAV · OGG · FLAC · AAC · M4A</p>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AudioEditor({
  initialFileUrl,
  initialFileName,
  initialFileUrls,
  initialFileNames,
}: AudioEditorProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState(0);
  const [cursorTime, setCursorTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<Segment[][]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [waveReady, setWaveReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Decoding audio…");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cutFlash, setCutFlash] = useState<{ xPct: number } | null>(null);
  const [tooltipStep, setTooltipStep] = useState<number>(0);
  // Counter to force WaveSurfer recreation even if blob identity is tricky
  const [waveVersion, setWaveVersion] = useState(0);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [blockedActionMsg, setBlockedActionMsg] = useState<string | null>(null);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Orientation Check Hook
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkOrientation = () => {
      const isSmall = window.innerWidth < 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsPortraitMobile(isSmall && isPortrait);
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // Screen Wake Lock API to prevent phone screen from turning off during editing
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch (err) {
        console.warn("Screen wake lock request failed:", err);
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  // Manage beginner tooltip sequence transitions
  useEffect(() => {
    if (typeof window !== "undefined") {
      const seen = localStorage.getItem("audiowave_editor_tooltips_seen");
      if (seen === "true") {
        setTooltipStep(-1);
      } else if (waveReady) {
        if (segments.length === 1 && cursorTime === 0) {
          setTooltipStep(1);
          setShowGuideModal(true); // Open guide on first load!
        } else if (segments.length === 1 && cursorTime > 0) {
          setTooltipStep(2);
        } else if (segments.length > 1) {
          setTooltipStep(3);
        }
      }
    }
  }, [waveReady, cursorTime, segments.length]);

  const closeGuide = () => {
    setShowGuideModal(false);
    localStorage.setItem("audiowave_editor_tooltips_seen", "true");
    setTooltipStep(-1);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const waveContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wavesurferRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastAnchorIdx = useRef<number>(0); // Anchor index for Shift range selection

  const handleSeekOffset = useCallback((offset: number) => {
    if (!wavesurferRef.current) return;
    const currentTime = wavesurferRef.current.getCurrentTime();
    let targetTime = currentTime + offset;
    if (targetTime < 0) targetTime = 0;
    if (targetTime > duration) targetTime = duration;
    wavesurferRef.current.setTime(targetTime);
    wavesurferRef.current.pause();
    setIsPlaying(false);
    setCursorTime(targetTime);
  }, [duration]);

  // ── Load initial URL(s) (from generator/editor) ───────────────────────────────

  useEffect(() => {
    const urls = initialFileUrls || (initialFileUrl ? [initialFileUrl] : []);
    const names = initialFileNames || (initialFileName ? [initialFileName] : []);
    if (urls.length === 0) return;

    const run = async () => {
      setLoading(true);
      setLoadingMsg("Fetching audio files from server…");
      try {
        const fetchedFiles: File[] = [];
        for (let i = 0; i < urls.length; i++) {
          setLoadingMsg(`Fetching audio file ${i + 1} of ${urls.length}…`);
          const blob = await fetch(urls[i]).then((r) => r.blob());
          const name = names[i] || `track_${i + 1}.mp3`;
          const file = new File([blob], name, { type: blob.type || "audio/mpeg" });
          fetchedFiles.push(file);
        }
        await loadFiles(fetchedFiles);
      } catch (err) {
        console.error("Failed to load audio files from server:", err);
        setErrorMsg("Failed to load audio files from the server.");
        setLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFileUrl, initialFileUrls]);

  // ── Decode and initialise ─────────────────────────────────────────────────────

  const stableStorageKeyRef = useRef<string>("");

  const loadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setLoading(true);
    setLoadingMsg("Calculating audio metadata…");
    setWaveReady(false);
    setSegments([]);
    setSelectedIds(new Set());
    setUndoStack([]);
    setCursorTime(0);
    setErrorMsg(null);
    try {
      // 1. Estimate total duration first to calculate memory footprint
      let totalDurationSec = 0;
      for (let i = 0; i < files.length; i++) {
        const dur = await getAudioDuration(files[i]);
        totalDurationSec += dur;
      }

      // 2. Compute optimal sample rate based on duration and device RAM
      const targetSampleRate = calculateOptimalSampleRate(totalDurationSec);
      const isDownsampled = targetSampleRate < 44100;

      if (audioCtxRef.current) {
        try {
          await audioCtxRef.current.close();
        } catch (e) {
          console.warn("Error closing old AudioContext:", e);
        }
        audioCtxRef.current = null;
      }
      
      // 3. Create AudioContext with dynamic sample rate optimization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: targetSampleRate
      });
      audioCtxRef.current = ctx;
      
      const decodedBuffers: AudioBuffer[] = [];
      const newSegments: Segment[] = [];
      let currentStart = 0;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ab = await file.arrayBuffer();
        const decoded = await decodeAudioDataWithRetry(ab, targetSampleRate, (status) => {
          setLoadingMsg(
            isDownsampled
              ? `[File ${i + 1}/${files.length}] ${status} (memory optimized: ${targetSampleRate / 1000}kHz)`
              : `[File ${i + 1}/${files.length}] ${status}`
          );
        }, ctx);
        decodedBuffers.push(decoded);
        newSegments.push({
          id: uid(),
          name: file.name.replace(/\.[^.]+$/, ""),
          startSec: currentStart,
          endSec: currentStart + decoded.duration,
        });
        currentStart += decoded.duration;
      }

      // Check for saved segments layout in sessionStorage using stable storage key
      const storageKey = stableStorageKeyRef.current || `editor_segments_${files.map(f => f.name).join("_")}`;
      if (!stableStorageKeyRef.current) {
        stableStorageKeyRef.current = storageKey;
      }
      const stored = sessionStorage.getItem(storageKey);
      let restoredSegments: Segment[] = [];
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.length > 0) {
            restoredSegments = parsed;
          }
        } catch {}
      }
      const finalSegments = restoredSegments.length > 0 ? restoredSegments : newSegments;
      
      if (decodedBuffers.length === 1) {
        // Single file: use original file directly (fast path — no WAV conversion)
        setAudioBuffer(decodedBuffers[0]);
        setDuration(decodedBuffers[0].duration);
        setSegments(finalSegments);
        setAudioFile(files[0]);
        setWaveVersion((v) => v + 1);
        if (!initialFileUrl && !initialFileUrls) {
          saveEditorSession(files[0], files[0].name, finalSegments);
        }
        // Don't setLoading(false) here — let WaveSurfer "ready" event do it
        return;
      }
      
      // Multiple files: merge into single AudioBuffer and create WAV blob for WaveSurfer
      setLoadingMsg("Merging audio tracks…");
      const merged = concatenateAudioBuffers(ctx, decodedBuffers);

      setLoadingMsg("Building combined WAV…");
      // Run WAV conversion in a microtask to let React paint the "Building" message
      await new Promise((r) => setTimeout(r, 50));
      const wavBlob = bufferToWavBlob(merged);
      const mergedFile = new File(
        [wavBlob],
        files[0].name.replace(/\.[^.]+$/, "") + "_merged.wav",
        { type: "audio/wav" }
      );

      setAudioBuffer(merged);
      setDuration(merged.duration);
      setSegments(finalSegments);
      setAudioFile(mergedFile);
      setWaveVersion((v) => v + 1);
      if (!initialFileUrl && !initialFileUrls) {
        saveEditorSession(mergedFile, mergedFile.name, finalSegments);
      }
      // Don't set loading=false here — WaveSurfer "ready" event will do it
      return;
    } catch (err) {
      console.error("Decoding error:", err);
      setErrorMsg("Failed to decode one or more audio files. Please ensure they are valid audio files.");
      setLoading(false);
    }
  }, [initialFileUrl, initialFileUrls]);

  // ── Restore saved standalone session from IndexedDB ─────────────────────────

  useEffect(() => {
    if (initialFileUrl || initialFileUrls) return;
    const restoreSession = async () => {
      try {
        const session = await loadEditorSession();
        if (session) {
          setLoading(true);
          setLoadingMsg("Restoring your previous session…");
          const { file, fileName, segments: restoredSegments } = session;
          
          // Re-establish session keys in sessionStorage & stable key ref
          const storageKey = `editor_segments_${fileName}`;
          stableStorageKeyRef.current = storageKey;
          sessionStorage.setItem(storageKey, JSON.stringify(restoredSegments));
          
          const fileObj = file instanceof File ? file : new File([file], fileName, { type: file.type || "audio/mpeg" });
          await loadFiles([fileObj]);
        }
      } catch (err) {
        console.error("Failed to restore session from IndexedDB:", err);
      }
    };
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFileUrl, initialFileUrls, loadFiles]);

  // Save segments to sessionStorage and IndexedDB when they change
  useEffect(() => {
    if (!stableStorageKeyRef.current || segments.length === 0) return;
    sessionStorage.setItem(stableStorageKeyRef.current, JSON.stringify(segments));
    if (!initialFileUrl && !initialFileUrls) {
      saveEditorSegments(segments);
    }
  }, [segments, initialFileUrl, initialFileUrls]);

  // ── WaveSurfer ────────────────────────────────────────────────────────────────
  // Recreates whenever audioFile changes (waveVersion forces recreation)

  useEffect(() => {
    if (!audioFile || !waveContainerRef.current) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any = null;
    const container = waveContainerRef.current;

    setIsPlaying(false); // Reset play state when loading a new file
    const url = URL.createObjectURL(audioFile);

    import("wavesurfer.js").then(({ default: WaveSurfer }) => {
      if (cancelled) return;
      ws = WaveSurfer.create({
        container,
        waveColor: "#1E3A4A",
        progressColor: "#00D4FF",
        cursorColor: "#FF6B35",
        height: 96,
        normalize: true,
        interact: true,
        backend: "MediaElement",
      });

      ws.on("ready", () => {
        if (!cancelled) {
          setWaveReady(true);
          setLoading(false); // Now safe to dismiss overlay — waveform is rendered & playable
        }
      });

      ws.on("error", (err: Error) => {
        console.error("WaveSurfer error:", err);
        if (!cancelled) {
          setErrorMsg("Failed to load audio waveform. Try a different file.");
          setLoading(false);
        }
      });

      ws.on("timeupdate", (t: number) => { if (!cancelled) setCursorTime(t); });
      ws.on("play", () => { if (!cancelled) setIsPlaying(true); });
      ws.on("pause", () => { if (!cancelled) setIsPlaying(false); });
      ws.on("finish", () => { if (!cancelled) setIsPlaying(false); });

      ws.load(url);
      wavesurferRef.current = ws;
    });

    return () => {
      cancelled = true;
      if (ws) {
        ws.destroy();
      }
      URL.revokeObjectURL(url);
      wavesurferRef.current = null;
      setWaveReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioFile, waveVersion]);

  // ── File validation ───────────────────────────────────────────────────────────

  const validateAndLoadFiles = useCallback(async (files: File[]) => {
    const ALLOWED_EXTS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];
    const validFiles: File[] = [];
    for (const file of files) {
      const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        setErrorMsg(`Unsupported file type: ${file.name}`);
        return;
      }
      validFiles.push(file);
    }
    
    setErrorMsg(null);
    if (validFiles.length > 0) {
      await loadFiles(validFiles);
    }
  }, [loadFiles]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await validateAndLoadFiles(Array.from(files));
    }
  }, [validateAndLoadFiles]);

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await validateAndLoadFiles(Array.from(files));
    }
    // Reset input so the same file can be selected again
    if (e.target) e.target.value = "";
  };

  // ── Undo helper ───────────────────────────────────────────────────────────────

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-20), [...segments]]);
  }, [segments]);

  // ── Cut ───────────────────────────────────────────────────────────────────────

  const handleCut = useCallback(() => {
    if (!waveReady || cursorTime <= 0 || cursorTime >= duration) {
      setErrorMsg("Move the cursor to a position on the timeline first, then click Cut.");
      return;
    }
    const segIdx = segments.findIndex((s) => cursorTime > s.startSec + 0.1 && cursorTime < s.endSec - 0.1);
    if (segIdx === -1) {
      setErrorMsg("Move the cursor to a position on the timeline first, then click Cut.");
      return;
    }
    pushUndo();
    const seg = segments[segIdx];
    const total = segments.length;
    setSegments([
      ...segments.slice(0, segIdx),
      { id: uid(), name: buildSegmentName(segIdx), startSec: seg.startSec, endSec: cursorTime },
      { id: uid(), name: buildSegmentName(total), startSec: cursorTime, endSec: seg.endSec },
      ...segments.slice(segIdx + 1),
    ]);
    
    // Trigger cut flash animation
    if (duration > 0) {
      const xPct = (cursorTime / duration) * 100;
      setCutFlash({ xPct });
      setTimeout(() => setCutFlash(null), 200);
    }
    
    setErrorMsg(null);
  }, [waveReady, cursorTime, duration, segments, pushUndo]);

  // ── Merge ─────────────────────────────────────────────────────────────────────
  // Supports non-adjacent segments: rearranges the AudioBuffer so merged audio
  // is contiguous, then recomputes all segment timings.

  const handleMerge = useCallback(async () => {
    if (selectedIds.size < 2) { setErrorMsg("Select at least 2 segments to merge."); return; }
    if (!audioBuffer || !audioCtxRef.current) return;

    pushUndo();
    setLoading(true);
    setLoadingMsg("Merging segments…");

    try {
      const ctx = audioCtxRef.current;
      const selectedSegs = segments.filter((s) => selectedIds.has(s.id));
      const mergedDuration = selectedSegs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);

      // Build the new segment order:
      // Replace the FIRST selected segment with the merged one, skip the rest
      const audioClips: AudioBuffer[] = [];
      const newSegments: Segment[] = [];
      let mergedInserted = false;
      let runningTime = 0;

      for (const seg of segments) {
        if (selectedIds.has(seg.id)) {
          if (!mergedInserted) {
            // Extract audio from ALL selected segments (in timeline order)
            for (const selSeg of selectedSegs) {
              audioClips.push(sliceAudioBuffer(ctx, audioBuffer, selSeg.startSec, selSeg.endSec));
            }
            newSegments.push({
              id: uid(),
              name: selectedSegs[0].name,
              startSec: runningTime,
              endSec: runningTime + mergedDuration,
            });
            runningTime += mergedDuration;
            mergedInserted = true;
          }
          // Skip other selected segments (their audio is already in the merged clip)
        } else {
          // Non-selected segment: extract its audio and keep it
          const dur = seg.endSec - seg.startSec;
          audioClips.push(sliceAudioBuffer(ctx, audioBuffer, seg.startSec, seg.endSec));
          newSegments.push({
            id: seg.id,
            name: seg.name,
            startSec: runningTime,
            endSec: runningTime + dur,
          });
          runningTime += dur;
        }
      }

      // Build the new AudioBuffer from the rearranged clips
      const newBuffer = concatenateAudioBuffers(ctx, audioClips);

      // Build WAV blob for WaveSurfer
      setLoadingMsg("Rebuilding waveform…");
      await new Promise((r) => setTimeout(r, 50));
      const wavBlob = bufferToWavBlob(newBuffer);
      const newFile = new File([wavBlob], "merged_audio.wav", { type: "audio/wav" });

      setAudioBuffer(newBuffer);
      setDuration(newBuffer.duration);
      setSegments(newSegments);
      setSelectedIds(new Set());
      setAudioFile(newFile);
      setWaveVersion((v) => v + 1);
      setErrorMsg(null);
      if (!initialFileUrl && !initialFileUrls) {
        saveEditorSession(newFile, newFile.name, newSegments);
      }
      // Loading overlay stays until WaveSurfer "ready" fires
    } catch (err) {
      console.error("Merge error:", err);
      setErrorMsg("Failed to merge segments. Please try again.");
      setLoading(false);
    }
  }, [selectedIds, segments, pushUndo, audioBuffer, initialFileUrl, initialFileUrls]);

  // ── Undo ──────────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (!undoStack.length) return;
    setSegments(undoStack[undoStack.length - 1]);
    setUndoStack((p) => p.slice(0, -1));
    setSelectedIds(new Set());
  }, [undoStack]);

  // ── Drag & Drop Reordering ───────────────────────────────────────────────────

  const handleReorder = useCallback(async (dragIndex: number, hoverIndex: number) => {
    if (dragIndex === hoverIndex) return;
    if (!audioBuffer || !audioCtxRef.current) return;

    pushUndo();
    setLoading(true);
    setLoadingMsg("Reordering segments…");

    try {
      const ctx = audioCtxRef.current;
      const nextSegs = [...segments];
      const [draggedItem] = nextSegs.splice(dragIndex, 1);
      nextSegs.splice(hoverIndex, 0, draggedItem);

      const audioClips: AudioBuffer[] = [];
      const updatedSegs: Segment[] = [];
      let runningTime = 0;

      for (const seg of nextSegs) {
        const slice = sliceAudioBuffer(ctx, audioBuffer, seg.startSec, seg.endSec);
        audioClips.push(slice);
        
        const dur = seg.endSec - seg.startSec;
        updatedSegs.push({
          id: seg.id,
          name: seg.name,
          startSec: runningTime,
          endSec: runningTime + dur,
        });
        runningTime += dur;
      }

      const newBuffer = concatenateAudioBuffers(ctx, audioClips);

      setLoadingMsg("Rebuilding waveform…");
      await new Promise((r) => setTimeout(r, 50));
      const wavBlob = bufferToWavBlob(newBuffer);
      const newFile = new File([wavBlob], "reordered_audio.wav", { type: "audio/wav" });

      setAudioBuffer(newBuffer);
      setDuration(newBuffer.duration);
      setSegments(updatedSegs);
      setAudioFile(newFile);
      setWaveVersion((v) => v + 1);
      setErrorMsg(null);
      
      if (!initialFileUrl && !initialFileUrls) {
        saveEditorSession(newFile, newFile.name, updatedSegs);
      }
    } catch (err) {
      console.error("Reorder error:", err);
      setErrorMsg("Failed to reorder segments. Please try again.");
      setLoading(false);
    }
  }, [segments, audioBuffer, pushUndo, initialFileUrl, initialFileUrls]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleSegmentDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    await handleReorder(draggedIndex, targetIndex);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handlePlayPause = () => {
    if (!wavesurferRef.current) return;
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.play().catch((err: unknown) => {
        console.error("Playback error:", err);
      });
    }
  };

  // ── Download ──────────────────────────────────────────────────────────────────

  const downloadSegment = useCallback(async (seg: Segment) => {
    if (!audioBuffer || !audioCtxRef.current) return;
    setLoading(true);
    setLoadingMsg(`Encoding segment "${seg.name}" to MP3…`);
    try {
      const FileSaver = await import("file-saver");
      const saveAs = FileSaver.default || FileSaver.saveAs || FileSaver;
      const slice = sliceAudioBuffer(audioCtxRef.current, audioBuffer, seg.startSec, seg.endSec);
      const mp3Blob = await audioBufferToMp3(slice, (percent) => {
        setLoadingMsg(`Encoding "${seg.name}" to MP3: ${percent}%`);
      });
      saveAs(mp3Blob, `${seg.name}.mp3`);
    } catch (err) {
      console.error("Encoding error:", err);
      setErrorMsg("Failed to encode segment to MP3.");
    } finally {
      setLoading(false);
    }
  }, [audioBuffer]);

  const downloadSelected = useCallback(async () => {
    const toGet = segments.filter((s) => selectedIds.has(s.id));
    if (!toGet.length) { setErrorMsg("Select at least one block to download."); return; }
    for (const seg of toGet) await downloadSegment(seg);
  }, [segments, selectedIds, downloadSegment]);

  const downloadAll = useCallback(async () => {
    if (!audioBuffer || !audioCtxRef.current || !segments.length) return;
    setLoading(true);
    try {
      const { default: JSZip } = await import("jszip");
      const FileSaver = await import("file-saver");
      const saveAs = FileSaver.default || FileSaver.saveAs || FileSaver;
      const zip = new JSZip();
      
      for (let idx = 0; idx < segments.length; idx++) {
        const seg = segments[idx];
        setLoadingMsg(`Encoding segment ${idx + 1} of ${segments.length} ("${seg.name}")…`);
        const slice = sliceAudioBuffer(audioCtxRef.current, audioBuffer, seg.startSec, seg.endSec);
        const mp3Blob = await audioBufferToMp3(slice, (percent) => {
          setLoadingMsg(`Encoding segment ${idx + 1} of ${segments.length} ("${seg.name}"): ${percent}%`);
        });
        zip.file(`${seg.name}.mp3`, mp3Blob);
      }
      
      setLoadingMsg("Creating ZIP package…");
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "audiowave_editor.zip");
    } catch (err) {
      console.error("Failed to build ZIP:", err);
      setErrorMsg("Failed to create ZIP package.");
    } finally {
      setLoading(false);
    }
  }, [audioBuffer, segments]);

  // ── Rename ────────────────────────────────────────────────────────────────────

  const startEdit = useCallback((id: string) => {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    setEditingId(id); setEditValue(seg.name);
    if (tooltipStep === 3) {
      localStorage.setItem("audiowave_editor_tooltips_seen", "true");
      setTooltipStep(-1);
    }
  }, [segments, tooltipStep]);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const t = editValue.trim();
    if (t) setSegments((p) => p.map((s) => s.id === editingId ? { ...s, name: t } : s));
    setEditingId(null);
  }, [editingId, editValue]);

  // ── Selection (Windows-style: Click=single, Ctrl=toggle, Shift=range) ───────

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    const clickedIdx = segments.findIndex((s) => s.id === id);
    if (clickedIdx === -1) return;

    if (e.shiftKey) {
      // Shift+Click: range select from anchor to clicked
      const anchor = Math.min(lastAnchorIdx.current, segments.length - 1);
      const lo = Math.min(anchor, clickedIdx);
      const hi = Math.max(anchor, clickedIdx);
      const rangeIds = new Set<string>();
      for (let i = lo; i <= hi; i++) rangeIds.add(segments[i].id);
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Shift: ADD range to existing selection
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
      } else {
        // Shift only: REPLACE selection with range
        setSelectedIds(rangeIds);
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: toggle individual item
      lastAnchorIdx.current = clickedIdx;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      // Plain click: single select (deselect all others)
      lastAnchorIdx.current = clickedIdx;
      setSelectedIds((prev) => {
        if (prev.size === 1 && prev.has(id)) return new Set<string>();
        return new Set([id]);
      });
    }
  }, [segments]);

  // ── Add File ──────────────────────────────────────────────────────────────────

  const handleAddFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !audioBuffer || !audioCtxRef.current || !audioFile) return;

    // Reset input immediately so the same file can be selected again
    const input = e.target;
    
    setLoading(true);
    setLoadingMsg("Calculating metadata for added files…");
    try {
      // 1. Calculate the new combined duration
      let addedDuration = 0;
      for (let i = 0; i < files.length; i++) {
        addedDuration += await getAudioDuration(files[i]);
      }
      const newCombinedDuration = duration + addedDuration;

      // 2. Compute the new optimal sample rate
      const newOptimalRate = calculateOptimalSampleRate(newCombinedDuration);
      
      let ctx = audioCtxRef.current;
      const currentBuffers: AudioBuffer[] = [];

      // 3. Check if we need to downsample the existing audio buffer to save memory
      if (newOptimalRate < ctx.sampleRate) {
        setLoadingMsg(`Downsampling workspace for memory efficiency (${newOptimalRate / 1000}kHz)…`);
        
        // Re-create a context with the lower sample rate
        try {
          await ctx.close();
        } catch {}
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: newOptimalRate
        });
        audioCtxRef.current = ctx;

        // Re-decode the original merged file
        const originalArrayBuffer = await audioFile.arrayBuffer();
        const reDecodedOriginal = await decodeAudioDataWithRetry(originalArrayBuffer, newOptimalRate, (status) => {
          setLoadingMsg(`Original file: ${status} (memory optimized: ${newOptimalRate / 1000}kHz)`);
        }, ctx);
        currentBuffers.push(reDecodedOriginal);
      } else {
        // Safe to keep the existing decoded buffer
        currentBuffers.push(audioBuffer);
      }

      const newBuffers: AudioBuffer[] = [];
      const newSegs: Segment[] = [];
      let runningEnd = duration;

      // 4. Decode all added files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ab = await file.arrayBuffer();
        const decoded = await decodeAudioDataWithRetry(ab, newOptimalRate, (status) => {
          setLoadingMsg(
            newOptimalRate < 44100
              ? `[Added File ${i + 1}/${files.length}] ${status} (memory optimized: ${newOptimalRate / 1000}kHz)`
              : `[Added File ${i + 1}/${files.length}] ${status}`
          );
        }, ctx || undefined);
        newBuffers.push(decoded);
        newSegs.push({
          id: uid(),
          name: file.name ? file.name.replace(/\.[^.]+$/, "") : `Added Track ${i + 1}`,
          startSec: runningEnd,
          endSec: runningEnd + decoded.duration,
        });
        runningEnd += decoded.duration;
      }

      // Merge existing buffer(s) + all new buffers
      setLoadingMsg("Merging audio tracks…");
      const allBuffers = [...currentBuffers, ...newBuffers];
      const merged = concatenateAudioBuffers(ctx, allBuffers);

      // Build WAV blob for WaveSurfer to play the full combined track
      setLoadingMsg("Building combined WAV…");
      await new Promise((r) => setTimeout(r, 50)); // Let React paint
      const wavBlob = bufferToWavBlob(merged);
      const newFile = new File(
        [wavBlob],
        "combined_audio.wav",
        { type: "audio/wav" }
      );

      // Update all state
      const nextSegs = [...segments, ...newSegs];
      setAudioBuffer(merged);
      setDuration(runningEnd);
      setSegments(nextSegs);
      setAudioFile(newFile);
      setWaveVersion((v) => v + 1);
      if (!initialFileUrl && !initialFileUrls) {
        saveEditorSession(newFile, newFile.name, nextSegs);
      }
      // Loading overlay stays until WaveSurfer fires "ready"
    } catch (err) {
      console.error("Add file error:", err);
      setErrorMsg("Failed to decode the added file. Please try a different audio file.");
      setLoading(false);
    } finally {
      // Reset input so the same file can be selected again
      input.value = "";
    }
  };

  // ── Empty state ───────────────────────────────────────────────────────────────

  if (!audioFile) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent mb-3">
              Audio Editor
            </h1>
            <p className="font-body text-sm text-[var(--text-secondary)]">
              Cut, merge, and rename audio segments. Download each track as WAV.
            </p>
          </motion.div>
          <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a" className="hidden" onChange={handleFileInput} multiple />
          <EditorDropZone dragOver={dragOver}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} />
          {loading && <p className="font-body text-sm text-[var(--text-secondary)] mt-6 animate-pulse">{loadingMsg}</p>}
          {errorMsg && <p className="font-body text-sm text-[var(--error)] mt-4 text-center max-w-sm">{errorMsg}</p>}
        </main>
      </div>
    );
  }

  // ── Editor UI ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex flex-col">
      <Navbar />
      <div className={`flex-1 flex overflow-hidden relative ${isPortraitMobile ? "blur-md select-none pointer-events-none" : ""}`} style={{ maxHeight: "calc(100vh - 64px)" }}>
        {loading && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center flex-col gap-4">
            <div className="w-10 h-10 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
            <p className="font-body text-sm text-[var(--text-secondary)] animate-pulse">
              {loadingMsg}
            </p>
          </div>
        )}

        {/* Sidebar */}
        <aside className="w-56 sm:w-64 flex flex-col border-r border-[var(--glass-border)] bg-[var(--bg-surface)] overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
            <span className="font-heading text-xs font-bold tracking-wide">SEGMENTS ({segments.length})</span>
            <span className="font-body text-[10px] text-[var(--text-muted)]">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "click to select"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {segments.map((seg, i) => (
              <div key={seg.id} className="relative">
                <SegmentItem segment={seg} index={i} selected={selectedIds.has(seg.id)}
                  isEditing={editingId === seg.id} editValue={editValue}
                  onSelect={(e) => toggleSelect(seg.id, e)} onDoubleClick={() => startEdit(seg.id)}
                  onEditChange={setEditValue} onEditCommit={commitEdit} onEditCancel={() => setEditingId(null)}
                  onDownload={() => downloadSegment(seg)}
                  draggable={true}
                  isDragOver={dragOverIndex === i}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleSegmentDrop}
                  onDragEnd={handleDragEnd}
                  onDragLeave={handleDragLeave} />
                {i === 0 && tooltipStep === 3 && (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ delay: 0.3, duration: 0.15 }}
                      className="absolute left-full top-0 ml-2 z-30 bg-[rgba(26,26,26,0.95)] border border-[var(--glass-border)] px-4 py-2.5 rounded-xl shadow-2xl w-[220px] flex flex-col gap-2 pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="font-body text-[13px] text-[var(--text-primary)] leading-snug">
                        Double-click the label above a block to rename it
                      </p>
                      <button
                        onClick={() => {
                          localStorage.setItem("audiowave_editor_tooltips_seen", "true");
                          setTooltipStep(-1);
                        }}
                        className="self-end text-[10px] text-[var(--accent-cyan)] font-semibold hover:underline"
                      >
                        Got it
                      </button>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Playback bar */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--glass-border)] bg-[var(--bg-surface)]">
            <button onClick={handlePlayPause} disabled={!waveReady} aria-label={isPlaying ? "Pause" : "Play"}
              className="w-9 h-9 rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] flex items-center justify-center text-white shadow-md hover:scale-105 active:scale-95 transition disabled:opacity-40">
              {isPlaying ? "⏸" : "▶"}
            </button>
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              <span className="text-[var(--accent-cyan)]">{formatSec(cursorTime)}</span>
              <span className="mx-1 opacity-40">/</span>{formatSec(duration)}
            </span>
            <div className="flex-1" />
            {!waveReady && (
              <div className="w-4 h-4 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
            )}
            <span className="font-body text-xs text-[var(--text-muted)] truncate max-w-[180px]">{audioFile.name}</span>
            <button
              onClick={() => setShowGuideModal(true)}
              className="px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-xs font-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] transition flex items-center gap-1.5"
            >
              💡 Guide
            </button>
          </div>

          {/* Waveform */}
          <div className="relative flex-shrink-0 bg-[rgba(0,0,0,0.2)] border-b border-[var(--glass-border)] overflow-hidden min-h-[96px]">
            <div ref={waveContainerRef} className={`w-full ${waveReady ? "reveal-waveform" : ""}`} />
            {waveReady && duration > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {segments.map((seg, i) => (
                  <SegmentOverlay key={seg.id} segment={seg} index={i} duration={duration}
                    selected={selectedIds.has(seg.id)}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(seg.id, e); }} />
                ))}
              </div>
            )}
            {cutFlash && (
              <motion.div
                initial={{ opacity: 0.9, scaleX: 1 }}
                animate={{ opacity: 0, scaleX: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute top-0 h-full w-1 bg-white shadow-[0_0_12px_rgba(255,255,255,1)] z-20 pointer-events-none"
                style={{ left: `${cutFlash.xPct}%` }}
              />
            )}
            {waveReady && tooltipStep === 1 && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  transition={{ delay: 0.3, duration: 0.15 }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto bg-[rgba(26,26,26,0.95)] border border-[var(--glass-border)] px-4 py-2.5 rounded-xl shadow-2xl max-w-[220px]"
                >
                  <p className="font-body text-[13px] text-[var(--text-primary)] text-center leading-snug">
                    Click anywhere on the waveform to place your cursor
                  </p>
                </motion.div>
              </AnimatePresence>
            )}
            {!waveReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--glass-border)] bg-[var(--bg-surface)] overflow-x-auto flex-shrink-0">
            <input ref={addFileInputRef} type="file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a" className="hidden" onChange={handleAddFile} multiple />
            <div className="relative">
              <ToolbarBtn icon="✂️" label="Cut" onClick={handleCut}
                disabled={!waveReady || cursorTime <= 0 || cursorTime >= duration}
                disabledReason={!waveReady ? "Wait for audio to load" : "Click the waveform to place cursor first"}
                delay={0.05}
                onShowBlockedMsg={setBlockedActionMsg} />
              {tooltipStep === 2 && (
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ delay: 0.3, duration: 0.15 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 bg-[rgba(26,26,26,0.95)] border border-[var(--glass-border)] px-4 py-2.5 rounded-xl shadow-2xl w-[220px]"
                  >
                    <p className="font-body text-[13px] text-[var(--text-primary)] text-center leading-snug">
                      Click Cut to split the audio at the cursor position
                    </p>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
            <ToolbarBtn icon="🔗" label="Merge" onClick={handleMerge}
              disabled={!waveReady || selectedIds.size < 2}
              disabledReason={!waveReady ? "Wait for audio to load" : "Select 2+ segments (Ctrl+Click or Shift+Click)"}
              delay={0.1}
              onShowBlockedMsg={setBlockedActionMsg} />
            <ToolbarBtn icon="➕" label="Add File" onClick={() => addFileInputRef.current?.click()}
              disabled={!waveReady}
              disabledReason="Wait for audio to load"
              delay={0.15}
              onShowBlockedMsg={setBlockedActionMsg} />
            <ToolbarBtn icon="✏️" label="Rename"
              onClick={() => { const id = Array.from(selectedIds)[0]; if (id) startEdit(id); }}
              disabled={!waveReady || selectedIds.size !== 1}
              disabledReason={!waveReady ? "Wait for audio to load" : selectedIds.size === 0 ? "Click a segment first" : "Select only 1 segment to rename"}
              delay={0.2}
              onShowBlockedMsg={setBlockedActionMsg} />
            <div className="w-px h-8 bg-[var(--glass-border)] mx-1 flex-shrink-0" />
            <ToolbarBtn icon="⬇️" label="Download Selected" onClick={downloadSelected}
              disabled={!waveReady || !selectedIds.size}
              disabledReason={!waveReady ? "Wait for audio to load" : "Select segments to download"}
              delay={0.25}
              onShowBlockedMsg={setBlockedActionMsg} />
            <ToolbarBtn icon="🗜️" label="Download All" onClick={downloadAll}
              disabled={!waveReady || !segments.length}
              disabledReason="Wait for audio to load"
              delay={0.3}
              onShowBlockedMsg={setBlockedActionMsg} />
            <div className="w-px h-8 bg-[var(--glass-border)] mx-1 flex-shrink-0" />
            <ToolbarBtn icon="↩️" label="Undo" onClick={handleUndo}
              disabled={!undoStack.length}
              disabledReason="Nothing to undo"
              delay={0.35}
              onShowBlockedMsg={setBlockedActionMsg} />
            
            {/* Center-aligned Playback Seek Button Group */}
            <div className="flex-1 flex justify-center items-center gap-1 mx-4 min-w-[280px]">
              <button
                type="button"
                disabled={!waveReady}
                onClick={() => handleSeekOffset(-10)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                title="Rewind 10s & Pause"
              >
                ⏪ 10s
              </button>
              <button
                type="button"
                disabled={!waveReady}
                onClick={() => handleSeekOffset(-5)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                title="Rewind 5s & Pause"
              >
                ⏪ 5s
              </button>
              <button
                type="button"
                disabled={!waveReady}
                onClick={() => handleSeekOffset(-1)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                title="Rewind 1s & Pause"
              >
                ⏪ 1s
              </button>
              
              <button
                type="button"
                disabled={!waveReady}
                onClick={handlePlayPause}
                className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.08)] border border-[var(--glass-border)] hover:border-[var(--accent-cyan)] flex items-center justify-center text-xs text-[var(--text-primary)] hover:scale-105 active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>

              <button
                type="button"
                disabled={!waveReady}
                onClick={() => handleSeekOffset(1)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                title="Forward 1s & Pause"
              >
                1s ⏩
              </button>
              <button
                type="button"
                disabled={!waveReady}
                onClick={() => handleSeekOffset(5)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                title="Forward 5s & Pause"
              >
                5s ⏩
              </button>
              <button
                type="button"
                disabled={!waveReady}
                onClick={() => handleSeekOffset(10)}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                title="Forward 10s & Pause"
              >
                10s ⏩
              </button>
            </div>
            <button onClick={() => {
              if (stableStorageKeyRef.current) {
                sessionStorage.removeItem(stableStorageKeyRef.current);
              }
              stableStorageKeyRef.current = "";
              setAudioFile(null);
              setAudioBuffer(null);
              setSegments([]);
              setDuration(0);
              setWaveReady(false);
              setUndoStack([]);
              setSelectedIds(new Set());
              clearEditorSession();
            }}
              className="font-body text-xs text-[var(--text-muted)] hover:text-[var(--error)] px-3 py-1.5 border border-[var(--glass-border)] rounded-lg hover:bg-[rgba(239,68,68,0.08)] hover:border-[rgba(239,68,68,0.2)] transition">
              ✕ Discard &amp; Cancel Project
            </button>
          </div>

          <style>{`
            @keyframes revealWaveform {
              from {
                clip-path: polygon(0 0, 0 0, 0 100%, 0% 100%);
              }
              to {
                clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
              }
            }
            .reveal-waveform {
              animation: revealWaveform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            }
          `}</style>

          {/* Error bar */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2 px-4 py-2.5 bg-[rgba(239,68,68,0.08)] border-b border-[rgba(239,68,68,0.2)]">
                <span className="text-sm">⚠️</span>
                <span className="font-body text-xs text-[var(--error)] flex-1">{errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">✕</button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Comprehensive Guide Modal */}
      <AnimatePresence>
        {showGuideModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeGuide}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative z-10 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto"
            >
              {/* Close icon */}
              <button
                onClick={closeGuide}
                className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl animate-pulse"
                aria-label="Close guide"
              >
                ✕
              </button>

              <div className="w-12 h-12 rounded-xl bg-[rgba(0,212,255,0.1)] flex items-center justify-center border border-[rgba(0,212,255,0.25)] text-[var(--accent-cyan)] mb-6 text-2xl">
                💡
              </div>

              <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-5">
                Audio Wave Editor Guide
              </h3>

              <div className="space-y-4 font-body text-xs text-[var(--text-secondary)] leading-relaxed flex-1">
                <div>
                  <h4 className="font-semibold text-[var(--accent-cyan)] text-sm mb-1">
                    ✂️ Slicing/Cutting
                  </h4>
                  <p>
                    Click anywhere on the waveform visualization to position your playback cursor. Once placed, click the <strong>Cut</strong> button in the toolbar to split the track at that exact second.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-[var(--accent-cyan)] text-sm mb-1">
                    🖱️ Multi-Select Tracks
                  </h4>
                  <p>
                    You can select multiple tracks in the sidebar for renaming or merging:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 mt-1">
                    <li><strong>Click</strong> a track to select only that track.</li>
                    <li><strong>Ctrl + Click</strong> (or Cmd + Click) to select multiple specific tracks.</li>
                    <li><strong>Shift + Click</strong> to select a range of tracks in a single click.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-[var(--accent-cyan)] text-sm mb-1">
                    🔗 Merging Tracks
                  </h4>
                  <p>
                    Select two or more tracks (adjacent or non-adjacent), then click the <strong>Merge</strong> button. The timeline will automatically rearrange the tracks to be contiguous and merge them.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-[var(--accent-cyan)] text-sm mb-1">
                    ✏️ Renaming Tracks
                  </h4>
                  <p>
                    Double-click a segment&apos;s name in the left panel, or select exactly one segment and click <strong>Rename</strong> in the toolbar. Type the new name and press Enter to save.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-[var(--accent-cyan)] text-sm mb-1">
                    Download Tracks
                  </h4>
                  <p>
                    Select specific segments and click <strong>Download Selected</strong>, or click <strong>Download All</strong> to compile and download all segments as a single packaged ZIP file.
                  </p>
                </div>
              </div>

              <button
                onClick={closeGuide}
                className="mt-6 w-full py-3 font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl hover:scale-[1.02] active:scale-[0.98] transition transform"
              >
                Close Guide
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Blocked Action Modal Pop-up */}
      <AnimatePresence>
        {blockedActionMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <div
              className="absolute inset-0"
              onClick={() => setBlockedActionMsg(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="relative z-10 bg-[var(--bg-surface)] border border-[rgba(239,68,68,0.25)] rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-[rgba(239,68,68,0.1)] flex items-center justify-center border border-[rgba(239,68,68,0.25)] text-[var(--error)] mb-4 text-xl">
                ⚠️
              </div>
              <h3 className="font-heading text-base font-bold text-[var(--text-primary)] mb-2">
                Action Blocked
              </h3>
              <p className="font-body text-xs text-[var(--text-secondary)] leading-relaxed mb-6">
                {blockedActionMsg}
              </p>
              <button
                onClick={() => setBlockedActionMsg(null)}
                className="w-full py-2.5 px-4 rounded-xl border border-[var(--glass-border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] transition"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Portrait Orientation Guard */}
      <AnimatePresence>
        {isPortraitMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative w-28 h-28 flex items-center justify-center mb-6">
              {/* Curved rotation arrow */}
              <motion.svg
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                className="absolute w-24 h-24 text-[var(--accent-cyan)] opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4.5 12a7.5 7.5 0 0115 0" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12l-3-3m3 3l-3 3" />
              </motion.svg>
              {/* Rotating Phone */}
              <motion.div
                animate={{ rotate: [0, 90, 90, 0] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", times: [0, 0.4, 0.6, 1] }}
                className="w-12 h-20 border-2 border-[var(--accent-cyan)] rounded-xl relative flex items-center justify-center bg-[var(--bg-deep)] shadow-lg shadow-[var(--accent-cyan)]/10"
              >
                {/* Speaker */}
                <div className="absolute top-1.5 w-6 h-0.5 bg-[var(--accent-cyan)] rounded-full opacity-60" />
                {/* Home indicator */}
                <div className="absolute bottom-1.5 w-8 h-1 bg-[var(--accent-cyan)] rounded-full opacity-60" />
                {/* Visual screen content simulation */}
                <div className="w-8 h-12 border border-[var(--accent-cyan)]/25 rounded bg-[var(--accent-cyan)]/5 flex flex-col justify-between p-1">
                  <div className="w-full h-1 bg-[var(--accent-cyan)]/40 rounded-full" />
                  <div className="w-3/4 h-1 bg-[var(--accent-cyan)]/30 rounded-full" />
                  <div className="w-full h-1 bg-[var(--accent-cyan)]/30 rounded-full" />
                </div>
              </motion.div>
            </div>
            
            <h2 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-3">
              Rotate Your Device
            </h2>
            <p className="font-body text-sm text-[var(--text-secondary)] max-w-xs leading-relaxed mb-6">
              The Audio Wave Editor requires landscape orientation to display the timeline and editor tools properly.
            </p>
            <div className="font-mono text-[10px] text-[var(--accent-cyan)] border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.04)] px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-pulse">
              <span>🔄 Auto-rotates when you turn your phone</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
