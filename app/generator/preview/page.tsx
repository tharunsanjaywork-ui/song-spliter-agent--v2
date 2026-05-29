"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DOMPurify from "dompurify";
import Navbar from "@/components/Navbar";
import { useGeneratorContext } from "@/context/GeneratorContext";
import { getJob, renameFile, JobFile, JobData } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDisplayName(file: JobFile, index: number): string {
  if (file.displayName && file.displayName.trim()) return file.displayName;
  return `Unidentified Song ${String(index + 1).padStart(2, "0")}`;
}

// ─── WaveSurfer Audio Player Component ────────────────────────────────────────

interface AudioPlayerProps {
  url: string;
  isActive: boolean;
  isPlaying: boolean;
  onPlayToggle: () => void;
  initialDuration: number;
}

function AudioPlayer({ url, isActive, isPlaying, onPlayToggle, initialDuration }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wavesurferRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);

  useEffect(() => {
    if (!isActive || !containerRef.current) {
      setIsReady(false);
      setCurrentTime(0);
      setDuration(initialDuration);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any;

    import("wavesurfer.js").then(({ default: WaveSurfer }) => {
      if (!containerRef.current) return;
      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: "#1E3A4A",        // --waveform-empty
        progressColor: "#00D4FF",    // --waveform-filled
        cursorColor: "#FF6B35",      // --waveform-cursor
        height: 48,
        normalize: true,
        interact: true,
        backend: "MediaElement",
      });

      ws.on("ready", () => {
        setIsReady(true);
        setDuration(ws.getDuration());
        if (isPlaying) {
          ws.play().catch(() => {});
        }
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
  }, [isActive, url]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !isReady || !isActive) return;
    if (isPlaying) {
      ws.play().catch(() => {});
    } else {
      ws.pause();
    }
  }, [isPlaying, isReady, isActive]);

  if (!isActive) {
    return (
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayToggle();
          }}
          aria-label="Play preview"
          className="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/50 hover:bg-primary/10 transition flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">play_arrow</span>
        </button>
        {/* Placeholder waveform visualization */}
        <div className="flex-1 h-8 flex items-center gap-[3px] opacity-20">
          {Array.from({ length: 45 }).map((_, i) => {
            const h = 4 + Math.sin(i * 0.2) * 14 + Math.cos(i * 0.5) * 6;
            return (
              <div
                key={i}
                className="flex-1 bg-[var(--text-muted)] rounded-full"
                style={{ height: `${Math.max(4, Math.abs(h))}px` }}
              />
            );
          })}
        </div>
        <span className="font-mono text-xs text-on-surface-variant flex-shrink-0">
          0:00&nbsp;/&nbsp;{formatDuration(initialDuration)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 mt-3">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlayToggle();
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center text-primary hover:bg-primary/30 transition flex-shrink-0 flex items-center justify-center"
      >
        {!isReady ? (
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <span className="material-symbols-outlined text-[20px]">pause</span>
        ) : (
          <span className="material-symbols-outlined text-[20px]">play_arrow</span>
        )}
      </button>

      <div ref={containerRef} className="flex-1 min-w-0" />

      <span className="font-mono text-xs text-on-surface-variant flex-shrink-0">
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
      className="w-full font-body text-sm bg-transparent border-b border-primary text-on-surface outline-none pb-0.5"
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
  isActive: boolean;
  isPlaying: boolean;
  onPlayToggle: () => void;
}

function FileCard({
  file, index, displayName, checked, isEditing, editValue,
  onEditValueChange, onDoubleClickName, onRenameCommit, onRenameCancel,
  onToggleCheck, renaming, isActive, isPlaying, onPlayToggle,
}: FileCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: "easeOut" }}
      className={`group relative flex flex-col gap-sm p-5 bg-surface-container/50 border rounded-xl hover:bg-surface-container transition-all glass-panel hover:scale-[1.01] ${
        checked
          ? "border-primary/30 shadow-[0_0_15px_rgba(168,232,255,0.05)]"
          : "border-outline-variant/30 opacity-60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-1">
        {/* Checkbox */}
        <button
          onClick={onToggleCheck}
          aria-label={checked ? "Deselect file" : "Select file"}
          className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${
            checked
              ? "border-primary bg-primary text-surface-container-lowest"
              : "border-outline-variant hover:border-primary/50 bg-[#0f0f0f]/80"
          }`}
        >
          {checked && (
            <span className="material-symbols-outlined text-[16px] font-bold">check</span>
          )}
        </button>

        {/* File index badge */}
        <span className="font-technical-xs text-technical-xs text-on-surface-variant font-bold flex-shrink-0">
          TRACK {String(index + 1).padStart(2, "0")}
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
            <div className="flex items-center gap-2">
              <h3
                className="font-display-lg text-base font-bold text-on-surface truncate cursor-pointer hover:text-primary transition flex-1"
                onDoubleClick={onDoubleClickName}
                title="Double-click to rename"
              >
                {displayName}
              </h3>
              <button
                onClick={onDoubleClickName}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-primary"
                title="Rename track"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
            </div>
          )}
        </div>

        {/* Duration + recognized badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {file.recognized && (
            <span className="font-technical-xs text-[10px] px-2.5 py-0.5 rounded-full bg-tertiary/10 border border-tertiary/20 text-tertiary flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
              Auto ID&apos;d
            </span>
          )}
          <span className="font-technical-sm text-technical-xs text-on-surface-variant">
            {formatDuration(file.duration)}
          </span>
          {renaming && (
            <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          <a
            href={file.cloudinaryUrl}
            download={`${displayName}.mp3`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-full bg-[#0f0f0f]/80 border border-outline-variant hover:border-primary/50 hover-glow transition-all flex items-center justify-center text-on-surface-variant hover:text-primary"
            title="Download track"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
          </a>
        </div>
      </div>

      {/* Audio player */}
      <AudioPlayer
        url={file.cloudinaryUrl}
        isActive={isActive}
        isPlaying={isPlaying}
        onPlayToggle={onPlayToggle}
        initialDuration={file.duration}
      />
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
    <div className="flex flex-col h-full font-body text-sm text-on-surface-variant gap-sm">
      <div className="flex items-center justify-between px-1">
        <span className="font-technical-xs text-technical-xs text-on-surface-variant">
          {checkedCount} of {files.length} selected
        </span>
        <div className="flex gap-2 font-technical-sm text-technical-xs text-primary">
          <button onClick={onSelectAll} className="hover:underline">All</button>
          <span className="text-outline-variant">·</span>
          <button onClick={onDeselectAll} className="hover:underline text-on-surface-variant">None</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {files.map((file, i) => {
          const name = displayNames[i] ?? buildDisplayName(file, i);
          const checked = checkedState[i] ?? true;
          const isEditing = editingIndex === i;
          const isRenaming = renamingIndex === i;

          return (
            <div
              key={i}
              className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-lg border transition-all duration-200 ${
                checked
                  ? "bg-surface-variant/30 border-primary/20"
                  : "border-transparent hover:bg-surface-variant/10"
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(i); }}
                aria-label={checked ? "Deselect file" : "Select file"}
                className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-all ${
                  checked
                    ? "border-primary bg-primary text-surface-container-lowest"
                    : "border-outline-variant bg-[#0f0f0f]/80"
                }`}
              >
                {checked && <span className="text-[8px] font-bold">✓</span>}
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
                    className={`font-body text-xs truncate cursor-pointer hover:text-primary transition block ${
                      checked ? "text-on-surface font-semibold" : "text-on-surface-variant/65"
                    }`}
                    title="Double-click to rename"
                  >
                    {name}
                  </span>
                )}
              </div>

              {isRenaming && (
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
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
          className="relative z-10 glass-panel border border-outline-variant/30 rounded-xl p-6 w-full max-w-md shadow-2xl overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display-lg text-lg text-gradient font-bold">Continue to Editor</h3>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-xl">✕</button>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant mb-6 leading-relaxed">
            You have deselected all songs. They will all be sent to the Audio Editor for manual slicing.
          </p>
          <button
            onClick={onGoToEditor}
            className="btn-gradient w-full py-3 rounded-full text-surface-container-lowest font-bold text-center shadow-[0_0_20px_rgba(168,232,255,0.3)] flex justify-center items-center gap-2"
          >
            <span className="material-symbols-outlined">edit</span>
            <span>Go to Audio Editor</span>
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
        className="relative z-10 glass-panel border border-outline-variant/30 rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display-lg text-lg text-gradient font-bold">Download &amp; Continue</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-xl">✕</button>
        </div>

        {/* Dynamic Division Info Panel */}
        <div className="mb-5 p-4 rounded-xl bg-surface-variant/20 border border-outline-variant/30 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-on-surface-variant font-technical-sm">🎵 Selected for download:</span>
            <span className="font-bold text-primary">{checkedFiles.length} song{checkedFiles.length > 1 ? "s" : ""}</span>
          </div>
          {uncheckedFiles.length > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-on-surface-variant font-technical-sm">✏️ Taking to Audio Editor:</span>
              <span className="font-bold text-tertiary">{uncheckedFiles.length} song{uncheckedFiles.length > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        <p className="font-body-md text-xs text-on-surface-variant mb-3">
          Choose how you would like to download your selected songs:
        </p>

        {/* Format Options */}
        <div className="space-y-3 mb-6">
          <div
            onClick={() => !isDownloading && setDownloadFormat("zip")}
            className={`cursor-pointer p-4 rounded-xl border transition duration-200 ${
              downloadFormat === "zip"
                ? "border-primary/50 bg-primary/10 shadow-[0_0_10px_rgba(0,212,255,0.05)]"
                : "border-outline-variant/30 bg-[#0f0f0f]/80 hover:bg-surface-variant/20"
            } ${isDownloading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full border flex items-center justify-center mt-0.5"
                style={{ borderColor: downloadFormat === "zip" ? "#00D4FF" : "rgba(255,255,255,0.3)" }}
              >
                {downloadFormat === "zip" && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </div>
              <div className="flex-1">
                <p className="font-display-lg text-sm font-semibold text-on-surface">Single ZIP Archive (.zip)</p>
                <p className="font-body-md text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                  Downloads all selected tracks packaged into one single zipped folder. Highly recommended for desktops.
                </p>
              </div>
            </div>
          </div>

          <div
            onClick={() => !isDownloading && setDownloadFormat("individual")}
            className={`cursor-pointer p-4 rounded-xl border transition duration-200 ${
              downloadFormat === "individual"
                ? "border-primary/50 bg-primary/10 shadow-[0_0_10px_rgba(0,212,255,0.05)]"
                : "border-outline-variant/30 bg-[#0f0f0f]/80 hover:bg-surface-variant/20"
            } ${isDownloading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5"
                style={{ borderColor: downloadFormat === "individual" ? "#00D4FF" : "rgba(255,255,255,0.3)" }}
              >
                {downloadFormat === "individual" && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </div>
              <div className="flex-1">
                <p className="font-display-lg text-sm font-semibold text-on-surface">Individual MP3 Files (.mp3)</p>
                <p className="font-body-md text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                  Downloads each track as a separate file sequentially. Recommended for mobile devices.
                </p>
              </div>
            </div>
          </div>
        </div>

        {isDownloading ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3 border border-outline-variant/30 bg-surface-container-low rounded-xl">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-body-md text-sm text-primary animate-pulse">{downloadProgress}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleDownloadAndContinue}
              className="btn-gradient w-full py-3.5 rounded-full text-surface-container-lowest font-bold text-center shadow-[0_0_20px_rgba(168,232,255,0.3)] flex justify-center items-center gap-2"
            >
              <span className="material-symbols-outlined">download</span>
              <span>Download &amp; Continue</span>
            </button>
            <button
              onClick={onClose}
              className="bg-[#0f0f0f]/80 border border-outline-variant hover:border-primary/50 hover-glow transition-all rounded-full py-2 w-full font-technical-sm text-technical-sm text-center text-on-surface-variant hover:text-on-surface"
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
        className="relative z-10 glass-panel border border-outline-variant/30 rounded-xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mb-4 border border-outline-variant">
          <span className="material-symbols-outlined text-[24px] text-primary">headphones</span>
        </div>
        <h3 className="font-display-lg text-headline-lg-mobile text-gradient mb-3">
          AI Cuts &amp; Review Guide
        </h3>
        <p className="font-body-md text-sm text-on-surface-variant leading-relaxed mb-6">
          The AI is not perfect. Some cuts may be incorrect. Listen to all files, select the correct ones, and click Continue. The remaining ones will go to the Audio Editor for manual adjustments.
        </p>
        <button
          onClick={onConfirm}
          className="btn-gradient w-full py-3 rounded-full text-surface-container-lowest font-bold flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(168,232,255,0.3)]"
        >
          <span>Got it, show me</span>
          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
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

  const { selectedFile, jobId: contextJobId, setEditorFiles } = useGeneratorContext();
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

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

      // Try restoring checkedState from sessionStorage
      let savedChecked: Record<number, boolean> | null = null;
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem(`checked_state_${activeJobId}`);
        if (stored) {
          try {
            savedChecked = JSON.parse(stored);
          } catch {}
        }
      }

      setJob(result.data);
      const initNames: Record<number, string> = {};
      const initChecked: Record<number, boolean> = {};
      result.data.files.forEach((f, i) => {
        initNames[i] = buildDisplayName(f, i);
        initChecked[i] = savedChecked && savedChecked[i] !== undefined ? savedChecked[i] : true;
      });
      setDisplayNames(initNames);
      setCheckedState(initChecked);
      setLoading(false);
    };
    fetchJob();
  }, [activeJobId, router]);

  const handleToggle = useCallback(
    (index: number) => setCheckedState((prev) => {
      const next = { ...prev, [index]: !prev[index] };
      if (activeJobId) {
        sessionStorage.setItem(`checked_state_${activeJobId}`, JSON.stringify(next));
      }
      return next;
    }),
    [activeJobId]
  );

  const handleSelectAll = useCallback(() => {
    if (!job) return;
    const all: Record<number, boolean> = {};
    job.files.forEach((_, i) => { all[i] = true; });
    setCheckedState(all);
    if (activeJobId) {
      sessionStorage.setItem(`checked_state_${activeJobId}`, JSON.stringify(all));
    }
  }, [job, activeJobId]);

  const handleDeselectAll = useCallback(() => {
    if (!job) return;
    const none: Record<number, boolean> = {};
    job.files.forEach((_, i) => { none[i] = false; });
    setCheckedState(none);
    if (activeJobId) {
      sessionStorage.setItem(`checked_state_${activeJobId}`, JSON.stringify(none));
    }
  }, [job, activeJobId]);

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
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-body text-sm text-on-surface-variant animate-pulse">Loading your songs...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-4">❌</p>
            <h2 className="font-heading text-xl font-bold text-on-surface mb-2">Failed to Load Songs</h2>
            <p className="font-body text-sm text-on-surface-variant mb-6">{error ?? "Something went wrong on the server. Please try again."}</p>
            <button onClick={() => router.push("/generator/upload")} className="font-body text-sm py-2.5 px-6 border border-primary/30 text-primary rounded-xl hover:bg-primary/85 hover:text-surface transition">
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

  // ── Empty state ───────────────────────────────────────────────────────────────

  if (files.length === 0) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="font-body text-sm text-on-surface-variant">No songs were automatically named. You can rename them by double-clicking.</p>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen text-on-surface flex flex-col relative overflow-hidden bg-[#0f0f0f]">
      {/* Mesh Background */}
      <div className="mesh-bg"></div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />

        <div className="flex-1 flex overflow-hidden max-h-[calc(100vh-64px)]">
          {/* Sidebar */}
          <aside className="hidden md:flex flex-col w-72 border-r border-outline-variant/30 bg-[#131313]/60 backdrop-blur-md p-5 overflow-hidden gap-md">
            <h2 className="font-display-lg text-sm text-gradient tracking-wider font-semibold">
              Tracks Checklist
            </h2>
            <div className="flex-1 overflow-hidden">
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
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto px-lg py-lg">
            <div className="max-w-5xl mx-auto flex flex-col gap-lg pb-10">
              
              {/* Header */}
              <header className="flex flex-col gap-sm">
                <h1 className="font-display-lg text-display-lg text-on-surface tracking-tighter">
                  Generated Tracks Preview
                </h1>
                <div className="flex flex-wrap items-center gap-md font-technical-sm text-technical-sm text-on-surface-variant">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    <span>Project: {selectedFile?.name || "AudioWave_Project"}</span>
                  </div>
                  <span className="opacity-30">•</span>
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">memory</span>
                    <span>AI Model: SynthGen v4.2</span>
                  </div>
                  <span className="opacity-30">•</span>
                  <span>{files.length} Tracks Generated</span>
                </div>
              </header>

              {/* Sticky Action Bar */}
              <div className="sticky top-0 z-40 bg-surface-container-high/80 backdrop-blur-xl border border-outline-variant/20 glass-panel rounded-xl p-md flex flex-col md:flex-row justify-between items-center gap-md shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                {/* Left: Multi-select Controls */}
                <div className="flex items-center gap-md w-full md:w-auto">
                  <div className="flex items-center gap-3 border-r border-outline-variant pr-md font-technical-sm text-technical-sm">
                    <button
                      onClick={handleSelectAll}
                      className="text-primary hover:text-primary-fixed-dim transition-colors"
                    >
                      Select All
                    </button>
                    <span className="text-outline-variant text-xs">/</span>
                    <button
                      onClick={handleDeselectAll}
                      className="text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                  <div className="bg-surface-variant text-on-surface px-3 py-1 rounded-full font-technical-xs text-technical-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                    {checkedFiles.length} Selected
                  </div>
                </div>

                {/* Right: Global Actions */}
                <div className="flex items-center gap-sm w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                  <button
                    onClick={() => router.push("/generator/upload")}
                    className="whitespace-nowrap px-4 py-2 font-technical-sm text-technical-sm text-on-surface-variant border border-outline-variant hover:bg-surface-variant hover:text-on-surface rounded-full transition-all"
                  >
                    Exit to Upload
                  </button>
                  <button
                    onClick={handleContinue}
                    className="whitespace-nowrap px-4 py-2 font-technical-sm text-technical-sm text-primary border border-primary hover:bg-primary/10 rounded-full transition-all glass-edge"
                  >
                    Download Selected Stems
                  </button>
                  <button
                    onClick={handleContinue}
                    className="whitespace-nowrap px-6 py-2 font-technical-sm text-technical-sm text-[#000000] bg-gradient-to-r from-secondary to-primary hover:opacity-90 rounded-full transition-all font-bold shadow-[0_0_20px_rgba(168,232,255,0.3)] flex items-center gap-2 animate-pulse"
                  >
                    <span className="material-symbols-outlined text-[18px]">archive</span>
                    Download ZIP / Edit
                  </button>
                </div>
              </div>

              {/* Stems Grid (2-Column) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-md">
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
                    isActive={activeIndex === i}
                    isPlaying={activeIndex === i && isPlaying}
                    onPlayToggle={() => {
                      if (activeIndex === i) {
                        setIsPlaying(!isPlaying);
                      } else {
                        setActiveIndex(i);
                        setIsPlaying(true);
                      }
                    }}
                  />
                ))}
              </div>

              {/* Bottom Actions Container */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: files.length * 0.05 + 0.2 }}
                className="mt-8 flex flex-col sm:flex-row gap-4 w-full"
              >
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.removeItem(`checked_state_${activeJobId}`);
                    }
                    router.push("/generator/upload");
                  }}
                  className="bg-[#0f0f0f]/80 border border-error/50 hover:border-error hover-glow transition-all rounded-full py-3.5 flex-1 font-technical-sm text-technical-sm flex items-center justify-center gap-2 text-error"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  <span>Discard Project</span>
                </button>
                <button
                  onClick={handleContinue}
                  className="btn-gradient py-3.5 rounded-full text-surface-container-lowest font-headline-lg-mobile flex-1 font-bold text-center shadow-[0_0_20px_rgba(168,232,255,0.3)] flex items-center justify-center gap-2"
                >
                  <span>Continue to Download / Editor</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </button>
              </motion.div>

            </div>
          </main>
        </div>
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
        <div className="min-h-screen bg-[#0f0f0f] flex flex-col justify-center items-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-body text-sm text-on-surface-variant mt-4 animate-pulse">
            Initializing preview parameters...
          </p>
        </div>
      }
    >
      <GeneratorPreviewContent />
    </Suspense>
  );
}
