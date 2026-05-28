"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DOMPurify from "dompurify";
import Navbar from "@/components/Navbar";
import { useGeneratorContext } from "@/context/GeneratorContext";
import { getJob, renameFile, JobFile, JobData } from "@/lib/api";

// ─── Helpers ────────────────--------------------------------------------------

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDisplayName(file: JobFile, index: number): string {
  if (file.displayName && file.displayName.trim()) return file.displayName;
  return `Unidentified Song ${String(index + 1).padStart(2, "0")}`;
}

// ─── WaveSurfer Audio Player Component ────────────────----------------────────

interface AudioPlayerProps {
  url: string;
  isPlaying: boolean;
  onPlayToggle: () => void;
}

function AudioPlayer({ url, isPlaying, onPlayToggle }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wavesurferRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any;

    import("wavesurfer.js").then(({ default: WaveSurfer }) => {
      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: "#1E3A4A",        // --waveform-empty
        progressColor: "#00D4FF",    // --waveform-filled
        cursorColor: "#FF6B35",      // --waveform-cursor
        height: 48,
        normalize: true,
        interact: true,
      });

      ws.on("ready", () => {
        setIsReady(true);
        setDuration(ws.getDuration());
      });

      ws.on("timeupdate", (t: number) => {
        setCurrentTime(t);
      });

      ws.on("finish", () => {
        onPlayToggle();
      });

      ws.load(url);
      wavesurferRef.current = ws;
    });

    return () => {
      ws?.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !isReady) return;
    if (isPlaying) {
      ws.play().catch(() => {});
    } else {
      ws.pause();
    }
  }, [isPlaying, isReady]);

  return (
    <div className="flex items-center gap-3 mt-3">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlayToggle();
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="w-8 h-8 rounded-full bg-[rgba(0,212,255,0.12)] border border-[rgba(0,212,255,0.3)] flex items-center justify-center text-[var(--accent-cyan)] hover:bg-[rgba(0,212,255,0.2)] transition flex-shrink-0"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      <div ref={containerRef} className="flex-1 min-w-0" />

      <span className="font-mono text-xs text-[var(--text-muted)] flex-shrink-0">
        {formatDuration(currentTime)}&nbsp;/&nbsp;{formatDuration(duration)}
      </span>
    </div>
  );
}

// ─── Rename Inline Input Component ───────────────────────────────────────────

interface RenameInputProps {
  value: string;
  onChange: (val: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function RenameInput({ value, onChange, onCommit, onCancel }: RenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onCommit();
    if (e.key === "Escape") onCancel();
  };

  return (
    <motion.input
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={handleKeyDown}
      maxLength={80}
      className="w-full font-body text-sm bg-transparent border-b border-[var(--accent-cyan)] text-[var(--text-primary)] outline-none pb-0.5"
    />
  );
}

// ─── File Card Component ──────────────────────────────────────────────────────

interface FileCardProps {
  file: JobFile;
  index: number;
  displayName: string;
  checked: boolean;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onDoubleClickName: () => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onToggleCheck: () => void;
  renaming: boolean;
  isPlaying: boolean;
  onPlayToggle: () => void;
}

function FileCard({
  file, index, displayName, checked, isEditing, editValue,
  onEditValueChange, onDoubleClickName, onRenameCommit, onRenameCancel,
  onToggleCheck, renaming, isPlaying, onPlayToggle,
}: FileCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: "easeOut" }}
      className={`bg-[var(--glass-bg)] border rounded-2xl p-5 backdrop-blur-md transition-all duration-200 ${
        checked
          ? "border-[rgba(0,212,255,0.2)] shadow-[0_0_20px_rgba(0,212,255,0.04)]"
          : "border-[rgba(255,255,255,0.04)] opacity-60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-1">
        {/* Checkbox */}
        <button
          onClick={onToggleCheck}
          aria-label={checked ? "Deselect file" : "Select file"}
          className="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition"
          style={{
            borderColor: checked ? "var(--accent-cyan)" : "rgba(255,255,255,0.15)",
            background: checked ? "var(--accent-cyan)" : "transparent",
          }}
        >
          {checked && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="text-[10px] text-[var(--bg-deep)] font-bold leading-none"
            >
              ✓
            </motion.span>
          )}
        </button>

        {/* File index badge */}
        <span className="font-mono text-xs text-[var(--text-muted)] flex-shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Song name / rename input */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <RenameInput
              value={editValue}
              onChange={onEditValueChange}
              onCommit={onRenameCommit}
              onCancel={onRenameCancel}
            />
          ) : (
            <p
              className="font-body text-sm font-semibold text-[var(--text-primary)] truncate cursor-pointer hover:text-[var(--accent-cyan)] transition"
              onDoubleClick={onDoubleClickName}
              title="Double-click to rename"
            >
              {displayName}
            </p>
          )}
        </div>

        {/* Duration + recognized badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {file.recognized && (
            <span className="font-body text-[10px] px-2 py-0.5 rounded-full bg-[rgba(34,197,94,0.12)] border border-[rgba(34,197,94,0.25)] text-[var(--success)]">
              ID&apos;d
            </span>
          )}
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {formatDuration(file.duration)}
          </span>
          {renaming && (
            <div className="w-3 h-3 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Audio player */}
      <AudioPlayer url={file.cloudinaryUrl} isPlaying={isPlaying} onPlayToggle={onPlayToggle} />
    </motion.div>
  );
}

// ─── Sidebar Component ────────────────────────────────────────────────────────

interface SidebarProps {
  files: JobFile[];
  displayNames: Record<number, string>;
  checkedState: Record<number, boolean>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  editingIndex: number | null;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onDoubleClickName: (index: number) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  renamingIndex: number | null;
}

function PreviewSidebar({
  files, displayNames, checkedState, onToggle, onSelectAll, onDeselectAll,
  editingIndex, editValue, onEditValueChange, onDoubleClickName, onRenameCommit,
  onRenameCancel, renamingIndex,
}: SidebarProps) {
  const checkedCount = Object.values(checkedState).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full font-body text-sm text-[var(--text-secondary)]">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="font-body text-xs text-[var(--text-secondary)]">
          {checkedCount} of {files.length} selected
        </span>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="font-body text-[10px] text-[var(--accent-cyan)] hover:underline">All</button>
          <span className="text-[var(--text-muted)]">·</span>
          <button onClick={onDeselectAll} className="font-body text-[10px] text-[var(--text-secondary)] hover:underline">None</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {files.map((file, i) => {
          const name = displayNames[i] ?? buildDisplayName(file, i);
          const checked = checkedState[i] ?? true;
          const isEditing = editingIndex === i;
          const isRenaming = renamingIndex === i;

          return (
            <div
              key={i}
              className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-xl transition ${
                checked
                  ? "bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.12)]"
                  : "border border-transparent hover:bg-[rgba(255,255,255,0.03)]"
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(i); }}
                aria-label={checked ? "Deselect file" : "Select file"}
                className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition"
                style={{
                  borderColor: checked ? "var(--accent-cyan)" : "rgba(255,255,255,0.15)",
                  background: checked ? "var(--accent-cyan)" : "transparent",
                }}
              >
                {checked && <span className="text-[8px] text-[var(--bg-deep)] font-bold">✓</span>}
              </button>

              <div
                className="flex-1 min-w-0"
                onDoubleClick={(e) => { e.stopPropagation(); onDoubleClickName(i); }}
              >
                {isEditing ? (
                  <RenameInput
                    value={editValue}
                    onChange={onEditValueChange}
                    onCommit={onRenameCommit}
                    onCancel={onRenameCancel}
                  />
                ) : (
                  <span
                    className={`font-body text-xs truncate cursor-pointer hover:text-[var(--accent-cyan)] transition block ${
                      checked ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                    }`}
                    title="Double-click to rename"
                  >
                    {name}
                  </span>
                )}
              </div>

              {isRenaming && (
                <div className="w-3 h-3 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Download Panel Component ─────────────────────────────────────────────────

interface DownloadPanelProps {
  checkedFiles: JobFile[];
  checkedNames: string[];
  uncheckedFiles: JobFile[];
  onGoToEditor: () => void;
  onClose: () => void;
}

function DownloadPanel({ checkedFiles, checkedNames, uncheckedFiles, onGoToEditor, onClose }: DownloadPanelProps) {
  const [downloadFormat, setDownloadFormat] = useState<"zip" | "individual">("zip");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");

  const handleDownloadAndContinue = async () => {
    setIsDownloading(true);
    setDownloadProgress("Preparing downloads...");

    try {
      if (downloadFormat === "zip") {
        const { default: JSZip } = await import("jszip");
        const FileSaver = await import("file-saver");
        const saveAs = FileSaver.default || FileSaver.saveAs || FileSaver;
        const zip = new JSZip();

        for (let i = 0; i < checkedFiles.length; i++) {
          setDownloadProgress(`Fetching song ${i + 1} of ${checkedFiles.length}...`);
          const file = checkedFiles[i];
          const res = await fetch(file.cloudinaryUrl);
          const blob = await res.blob();
          zip.file(`${checkedNames[i]}.mp3`, blob);
        }

        setDownloadProgress("Packaging ZIP file...");
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "audiowave_songs.zip");
      } else {
        const FileSaver = await import("file-saver");
        const saveAs = FileSaver.default || FileSaver.saveAs || FileSaver;

        for (let i = 0; i < checkedFiles.length; i++) {
          setDownloadProgress(`Downloading song ${i + 1} of ${checkedFiles.length}...`);
          const file = checkedFiles[i];
          const name = checkedNames[i];
          const res = await fetch(file.cloudinaryUrl);
          const blob = await res.blob();
          saveAs(blob, `${name}.mp3`);
          // 300ms delay to prevent popup blocks
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      setIsDownloading(false);
      
      // If there are unselected files, send user to Audio Editor
      if (uncheckedFiles.length > 0) {
        onGoToEditor();
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setDownloadProgress("An error occurred during download.");
      setIsDownloading(false);
    }
  };

  if (checkedFiles.length === 0) {
    return (
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative z-10 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-lg font-bold text-[var(--text-primary)]">Continue to Editor</h3>
            <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl">✕</button>
          </div>
          <p className="font-body text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
            You have deselected all songs. They will all be sent to the Audio Editor for manual slicing.
          </p>
          <button
            onClick={onGoToEditor}
            className="w-full py-3 font-body text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl hover:scale-[1.02] active:scale-[0.98] transition transform"
          >
            ✏️ Go to Audio Editor
          </button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative z-10 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-bold text-[var(--text-primary)]">Download &amp; Continue</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl">✕</button>
        </div>

        {/* Dynamic Division Info Panel */}
        <div className="mb-5 p-4 rounded-xl bg-[rgba(0,212,255,0.04)] border border-[rgba(0,212,255,0.1)] flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--text-secondary)]">🎵 Selected for download:</span>
            <span className="font-semibold text-[var(--accent-cyan)]">{checkedFiles.length} song{checkedFiles.length > 1 ? "s" : ""}</span>
          </div>
          {uncheckedFiles.length > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--text-secondary)]">✏️ Taking to Audio Editor:</span>
              <span className="font-semibold text-[var(--accent-orange)]">{uncheckedFiles.length} song{uncheckedFiles.length > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        <p className="font-body text-xs text-[var(--text-secondary)] mb-3">
          Choose how you would like to download your selected songs:
        </p>

        {/* Format Options */}
        <div className="space-y-3 mb-6">
          <div
            onClick={() => !isDownloading && setDownloadFormat("zip")}
            className={`cursor-pointer p-4 rounded-xl border-2 transition duration-200 ${
              downloadFormat === "zip"
                ? "border-[var(--accent-cyan)] bg-[rgba(0,212,255,0.06)]"
                : "border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[rgba(255,255,255,0.02)]"
            } ${isDownloading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5"
                style={{ borderColor: downloadFormat === "zip" ? "var(--accent-cyan)" : "rgba(255,255,255,0.3)" }}
              >
                {downloadFormat === "zip" && <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-cyan)]" />}
              </div>
              <div className="flex-1">
                <p className="font-heading text-sm font-semibold text-[var(--text-primary)]">Single ZIP Archive (.zip)</p>
                <p className="font-body text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Downloads all selected tracks packaged into one single zipped folder. Highly recommended for desktops.
                </p>
              </div>
            </div>
          </div>

          <div
            onClick={() => !isDownloading && setDownloadFormat("individual")}
            className={`cursor-pointer p-4 rounded-xl border-2 transition duration-200 ${
              downloadFormat === "individual"
                ? "border-[var(--accent-cyan)] bg-[rgba(0,212,255,0.06)]"
                : "border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[rgba(255,255,255,0.02)]"
            } ${isDownloading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5"
                style={{ borderColor: downloadFormat === "individual" ? "var(--accent-cyan)" : "rgba(255,255,255,0.3)" }}
              >
                {downloadFormat === "individual" && <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-cyan)]" />}
              </div>
              <div className="flex-1">
                <p className="font-heading text-sm font-semibold text-[var(--text-primary)]">Individual MP3 Files (.mp3)</p>
                <p className="font-body text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Downloads each track as a separate file sequentially. Recommended for mobile devices.
                </p>
              </div>
            </div>
          </div>
        </div>

        {isDownloading ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3 border border-[var(--glass-border)] bg-[var(--glass-bg)] rounded-xl">
            <div className="w-8 h-8 border-3 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
            <p className="font-body text-sm text-[var(--accent-cyan)] animate-pulse">{downloadProgress}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleDownloadAndContinue}
              className="w-full py-3.5 font-body text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl hover:scale-[1.01] active:scale-[0.99] transition transform shadow-[0_0_20px_rgba(0,212,255,0.15)] flex items-center justify-center gap-2"
            >
              📥 Download &amp; Continue
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 font-body text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
            >
              Cancel
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Warning Modal Component ──────────────────────────────────────────────────

function PreviewWarningModal({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      
      {/* Modal */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative z-10 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="text-4xl mb-4">📢</div>
        <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-3">
          AI Cuts & Review Guide
        </h3>
        <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
          The AI is not perfect. Some cuts may be incorrect. Listen to all files, select the correct ones, click Continue. The rest go to the Audio Editor.
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-3 font-body text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl hover:shadow-[0_0_15px_rgba(0,212,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition transform"
        >
          Got it, show me
        </button>
      </motion.div>
    </div>
  );
}

// ─── Main Preview Content Component ──────────────────────────────────────────

function GeneratorPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryJobId = searchParams.get("jobId");

  const { jobId: contextJobId, setEditorFiles } = useGeneratorContext();
  const activeJobId = queryJobId || contextJobId;

  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedState, setCheckedState] = useState<Record<number, boolean>>({});
  const [displayNames, setDisplayNames] = useState<Record<number, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [showDownload, setShowDownload] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(true);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  // Load job from API
  useEffect(() => {
    if (!activeJobId) {
      router.push("/generator/upload");
      return;
    }
    const fetchJob = async () => {
      setLoading(true);
      const result = await getJob(activeJobId);
      if (!result.success || !result.data) {
        setError(result.error ?? "Failed to load songs.");
        setLoading(false);
        return;
      }
      setJob(result.data);
      const initNames: Record<number, string> = {};
      const initChecked: Record<number, boolean> = {};
      result.data.files.forEach((f, i) => {
        initNames[i] = buildDisplayName(f, i);
        initChecked[i] = true;
      });
      setDisplayNames(initNames);
      setCheckedState(initChecked);
      setLoading(false);
    };
    fetchJob();
  }, [activeJobId, router]);

  const handleToggle = useCallback(
    (index: number) => setCheckedState((prev) => ({ ...prev, [index]: !prev[index] })),
    []
  );

  const handleSelectAll = useCallback(() => {
    if (!job) return;
    const all: Record<number, boolean> = {};
    job.files.forEach((_, i) => { all[i] = true; });
    setCheckedState(all);
  }, [job]);

  const handleDeselectAll = useCallback(() => {
    if (!job) return;
    const none: Record<number, boolean> = {};
    job.files.forEach((_, i) => { none[i] = false; });
    setCheckedState(none);
  }, [job]);

  const startEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setEditValue(displayNames[index] ?? "");
  }, [displayNames]);

  const commitRename = useCallback(async () => {
    if (editingIndex === null || !job || !activeJobId) return;
    const safeName = DOMPurify.sanitize(editValue, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
    if (!safeName || safeName === displayNames[editingIndex]) {
      setEditingIndex(null);
      return;
    }
    setEditingIndex(null);
    setDisplayNames((prev) => ({ ...prev, [editingIndex]: safeName }));
    setRenamingIndex(editingIndex);
    await renameFile(activeJobId, editingIndex, safeName);
    setRenamingIndex(null);
  }, [editingIndex, editValue, displayNames, job, activeJobId]);

  const cancelRename = useCallback(() => setEditingIndex(null), []);

  const handleContinue = () => {
    if (!job) return;
    setShowDownload(true);
  };

  const handleGoToEditor = () => {
    if (!job) return;
    const unchecked = job.files.filter((_, i) => !checkedState[i]);
    setEditorFiles(unchecked);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("editorFiles", JSON.stringify(unchecked));
    }
    setShowDownload(false);
    router.push("/generator/editor");
  };

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
            <p className="font-body text-sm text-[var(--text-secondary)] animate-pulse">Loading your songs...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-4">❌</p>
            <h2 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-2">Failed to Load Songs</h2>
            <p className="font-body text-sm text-[var(--text-secondary)] mb-6">{error ?? "Something went wrong on the server. Please try again."}</p>
            <button onClick={() => router.push("/generator/upload")} className="font-body text-sm py-2.5 px-6 border border-[rgba(0,212,255,0.3)] text-[var(--accent-cyan)] rounded-xl hover:bg-[rgba(0,212,255,0.08)] transition">
              Back to Upload
            </button>
          </div>
        </div>
      </div>
    );
  }

  const files = job.files;
  const checkedFiles = files.filter((_, i) => checkedState[i]);
  const uncheckedFiles = files.filter((_, i) => !checkedState[i]);
  const checkedNames = checkedFiles.map((f) => displayNames[files.indexOf(f)] ?? buildDisplayName(f, files.indexOf(f)));

  // ── Empty state ────────────────-----------------------------------------------

  if (files.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="font-body text-sm text-[var(--text-secondary)]">No songs were automatically named. You can rename them by double-clicking.</p>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────-----------------------------------

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex flex-col relative overflow-hidden">
      <Navbar />

      <div className="flex-1 flex overflow-hidden max-h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r border-[var(--glass-border)] bg-[var(--bg-surface)] p-4 overflow-hidden">
          <h2 className="font-heading text-sm font-bold text-[var(--text-primary)] mb-3 tracking-wide">
            Songs ({files.length})
          </h2>
          <PreviewSidebar
            files={files}
            displayNames={displayNames}
            checkedState={checkedState}
            onToggle={handleToggle}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            editingIndex={editingIndex}
            editValue={editValue}
            onEditValueChange={setEditValue}
            onDoubleClickName={startEdit}
            onRenameCommit={commitRename}
            onRenameCancel={cancelRename}
            renamingIndex={renamingIndex}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto">
            {/* Mobile song count */}
            <div className="md:hidden flex items-center justify-between mb-4">
              <h1 className="font-heading text-lg font-bold text-[var(--text-primary)]">
                Preview Songs
              </h1>
              <span className="font-body text-xs text-[var(--text-secondary)]">
                {Object.values(checkedState).filter(Boolean).length} / {files.length} selected
              </span>
            </div>

            <p className="font-body text-xs text-[var(--text-muted)] mb-5 hidden md:block">
              Double-click a song name to rename it. Uncheck any incorrect cuts — they&apos;ll go to the Audio Editor.
            </p>

            {/* File cards */}
            <div className="space-y-4">
              {files.map((file, i) => (
                <FileCard
                  key={i}
                  file={file}
                  index={i}
                  displayName={displayNames[i] ?? buildDisplayName(file, i)}
                  checked={checkedState[i] ?? true}
                  isEditing={editingIndex === i}
                  editValue={editValue}
                  onEditValueChange={setEditValue}
                  onDoubleClickName={() => startEdit(i)}
                  onRenameCommit={commitRename}
                  onRenameCancel={cancelRename}
                  onToggleCheck={() => handleToggle(i)}
                  renaming={renamingIndex === i}
                  isPlaying={playingIndex === i}
                  onPlayToggle={() => {
                    if (playingIndex === i) {
                      setPlayingIndex(null);
                    } else {
                      setPlayingIndex(i);
                    }
                  }}
                />
              ))}
            </div>

            {/* Continue button */}
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: files.length * 0.05 + 0.2 }}
              onClick={handleContinue}
              className="mt-8 w-full py-4 font-body text-base font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition transform duration-200"
            >
              Continue →
            </motion.button>
          </div>
        </main>
      </div>

      {/* Warning modal */}
      <AnimatePresence>
        {showWarningModal && (
          <PreviewWarningModal onConfirm={() => setShowWarningModal(false)} />
        )}
      </AnimatePresence>

      {/* Download panel */}
      <AnimatePresence>
        {showDownload && (
          <DownloadPanel
            checkedFiles={checkedFiles}
            checkedNames={checkedNames}
            uncheckedFiles={uncheckedFiles}
            onGoToEditor={handleGoToEditor}
            onClose={() => setShowDownload(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Standalone Wrap with Suspense to prevent Next Static Compilation error ────

export default function GeneratorPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col justify-center items-center">
          <div className="w-10 h-10 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
          <p className="font-body text-sm text-[var(--text-secondary)] mt-4 animate-pulse">
            Initializing preview parameters...
          </p>
        </div>
      }
    >
      <GeneratorPreviewContent />
    </Suspense>
  );
}
