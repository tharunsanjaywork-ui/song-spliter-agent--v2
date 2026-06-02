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

// ─── Decorative Waveform Bars Component ────────────────────────────────────────

const WaveformBars = ({ isPlaying }: { isPlaying: boolean }) => {
  return (
    <div className="flex items-center gap-[3px] h-6 flex-shrink-0 w-14 justify-center">
      {[12, 18, 8, 22, 14, 20, 10].map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full transition-all duration-300 ${
            isPlaying ? "bg-primary animate-wave-bounce" : "bg-on-surface-variant/30"
          }`}
          style={{
            height: isPlaying ? "100%" : `${h}px`,
            maxHeight: `${h}px`,
            animationDelay: `${i * 0.12}s`,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </div>
  );
};

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
    let cancelled = false;

    import("wavesurfer.js").then(({ default: WaveSurfer }) => {
      if (cancelled || !containerRef.current) return;
      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: "#3c494e",
        progressColor: "#a8e8ff",
        cursorColor: "#00d4ff",
        height: 32,
        normalize: true,
        interact: true,
        backend: "MediaElement",
      });

      ws.on("ready", () => {
        if (cancelled) return;
        setIsReady(true);
        setDuration(ws.getDuration());
        if (isPlaying) {
          ws.play().catch(() => {});
        }
      });

      ws.on("timeupdate", (t: number) => {
        if (cancelled) return;
        setCurrentTime(t);
      });

      ws.on("finish", () => {
        if (cancelled) return;
        onPlayToggle();
      });

      ws.load(url);
      wavesurferRef.current = ws;
    });

    return () => {
      cancelled = true;
      if (ws) {
        ws.destroy();
      }
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
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlayToggle();
        }}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 transition flex-shrink-0"
      >
        {!isReady ? (
          <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <span className="material-symbols-outlined text-[16px]">pause</span>
        ) : (
          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
        )}
      </button>

      <div ref={containerRef} className="flex-1 min-w-0" />

      <span className="font-technical-xs text-xs text-on-surface-variant flex-shrink-0">
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
      className="w-full font-body-md text-sm bg-transparent border-b border-primary text-on-surface outline-none pb-0.5"
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
      className={`bg-surface-container-low backdrop-blur-md border rounded-xl p-4 glass-edge transition-all duration-200 flex flex-col ${
        isActive
          ? "border-primary/50 shadow-[0_0_15px_rgba(168,232,255,0.05)]"
          : checked
            ? "border-primary/30"
            : "border-outline-variant/30 opacity-60"
      }`}
    >
      {/* Main Row */}
      <div className="flex items-center gap-4 w-full">
        {/* Checkbox */}
        <button
          onClick={onToggleCheck}
          aria-label={checked ? "Deselect file" : "Select file"}
          className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
            checked
              ? "bg-[var(--accent-cyan)] border-[var(--accent-cyan)] shadow-[0_0_8px_rgba(0,212,255,0.3)] text-white"
              : "border-outline-variant bg-surface-container-lowest text-primary"
          }`}
        >
          {checked && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="text-[12px] text-white font-extrabold leading-none"
            >
              ✓
            </motion.span>
          )}
        </button>

        {/* Index */}
        <span className="font-technical-sm text-on-surface-variant w-6 text-center flex-shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Song Details */}
        <div className="flex-grow min-w-0" onDoubleClick={onDoubleClickName}>
          {isEditing ? (
            <RenameInput
              value={editValue}
              onChange={onEditValueChange}
              onCommit={onRenameCommit}
              onCancel={onRenameCancel}
            />
          ) : (
            <div className="flex flex-col min-w-0">
              <p
                className={`font-body-md text-sm font-semibold truncate hover:text-primary cursor-pointer transition ${
                  isActive ? "text-primary" : "text-on-surface"
                }`}
                title="Double-click to rename"
              >
                {displayName}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {file.recognized && (
                  <span className="bg-tertiary/10 border border-tertiary/30 text-tertiary font-technical-xs text-[10px] px-1.5 py-0.5 rounded-full">
                    ID&apos;d
                  </span>
                )}
                {renaming && (
                  <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Decorative wave bars */}
        <WaveformBars isPlaying={isActive && isPlaying} />

        {/* Duration */}
        <span className="font-technical-sm text-on-surface-variant w-12 text-right flex-shrink-0">
          {formatDuration(file.duration)}
        </span>

        {/* Play/Pause Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayToggle();
          }}
          aria-label={isPlaying && isActive ? "Pause" : "Play"}
          className={`w-9 h-9 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition flex-shrink-0 relative ${
            isActive && isPlaying
              ? "bg-primary text-[#000] shadow-[0_0_10px_rgba(168,232,255,0.5)]"
              : "bg-surface-variant text-on-surface hover:bg-surface-bright"
          }`}
        >
          {isActive && isPlaying ? (
            <>
              {/* Pulse Ring animation when playing */}
              <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping pointer-events-none" />
              <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>pause</span>
            </>
          ) : (
            <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>play_arrow</span>
          )}
        </button>

        {/* Individual Download */}
        <a
          href={file.cloudinaryUrl}
          download={`${displayName}.mp3`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 transition flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">download</span>
        </a>
      </div>

      {/* Expanded Audio Player */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full mt-3 pt-3 border-t border-outline-variant/30"
          >
            <AudioPlayer
              url={file.cloudinaryUrl}
              isActive={isActive}
              isPlaying={isPlaying}
              onPlayToggle={onPlayToggle}
              initialDuration={file.duration}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Download Panel Component ─────────────────────────────────────────────────

interface DownloadPanelProps {
  checkedFiles: JobFile[];
  checkedNames: string[];
  uncheckedFiles: JobFile[];
  onGoToEditor: () => void;
  onClose: () => void;
  defaultFormat?: "zip" | "individual";
}

function DownloadPanel({ checkedFiles, checkedNames, uncheckedFiles, onGoToEditor, onClose, defaultFormat = "zip" }: DownloadPanelProps) {
  const [downloadFormat, setDownloadFormat] = useState<"zip" | "individual">(defaultFormat);
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
          className="relative z-10 bg-surface-container-high border border-outline-variant rounded-2xl p-6 w-full max-w-md shadow-2xl backdrop-blur-xl"
        >
          {/* Inner edge lighting border */}
          <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none z-20" />

          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display-lg text-lg font-bold text-on-surface">Continue to Editor</h3>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-xl">✕</button>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant mb-6 leading-relaxed">
            You have deselected all songs. They will all be sent to the Audio Editor for manual slicing.
          </p>
          <button
            onClick={onGoToEditor}
            className="w-full py-3.5 font-body-md text-sm font-semibold bg-gradient-to-r from-secondary to-primary text-[#000] rounded-full hover:scale-[1.02] active:scale-[0.98] transition transform"
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
        className="relative z-10 bg-surface-container-high border border-outline-variant rounded-2xl p-6 w-full max-w-lg shadow-2xl backdrop-blur-xl max-h-[85vh] overflow-y-auto"
      >
        {/* Inner edge lighting border */}
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none z-20" />

        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display-lg text-lg font-bold text-on-surface">Download &amp; Continue</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-xl">✕</button>
        </div>

        {/* Dynamic Division Info Panel */}
        <div className="mb-5 p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-on-surface-variant">🎵 Selected for download:</span>
            <span className="font-semibold text-primary">{checkedFiles.length} song{checkedFiles.length > 1 ? "s" : ""}</span>
          </div>
          {uncheckedFiles.length > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-on-surface-variant">✏] Slicing manually in editor:</span>
              <span className="font-semibold text-secondary">{uncheckedFiles.length} song{uncheckedFiles.length > 1 ? "s" : ""}</span>
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
            className={`cursor-pointer p-4 rounded-xl border-2 transition duration-200 ${
              downloadFormat === "zip"
                ? "border-primary bg-primary/5"
                : "border-outline-variant bg-surface-container-lowest/80 hover:bg-surface-container-low"
            } ${isDownloading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5"
                style={{ borderColor: downloadFormat === "zip" ? "var(--primary-container)" : "rgba(255,255,255,0.3)" }}
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
            className={`cursor-pointer p-4 rounded-xl border-2 transition duration-200 ${
              downloadFormat === "individual"
                ? "border-primary bg-primary/5"
                : "border-outline-variant bg-surface-container-lowest/80 hover:bg-surface-container-low"
            } ${isDownloading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5"
                style={{ borderColor: downloadFormat === "individual" ? "var(--primary-container)" : "rgba(255,255,255,0.3)" }}
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
          <div className="flex flex-col items-center justify-center py-6 gap-3 border border-outline-variant bg-surface-container-low rounded-xl">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-body-md text-sm text-primary animate-pulse">{downloadProgress}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleDownloadAndContinue}
              className="w-full py-3.5 font-body-md text-sm font-semibold bg-gradient-to-r from-secondary to-primary text-[#000] rounded-full hover:scale-[1.01] active:scale-[0.99] transition transform shadow-[0_0_20px_rgba(0,212,255,0.15)] flex items-center justify-center gap-2"
            >
              📥 Download &amp; Continue
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 font-body-md text-xs font-semibold text-on-surface-variant hover:text-on-surface transition"
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
        className="relative z-10 bg-surface-container-high border border-outline-variant rounded-2xl p-8 max-w-md w-full shadow-2xl backdrop-blur-xl"
      >
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
          <span className="material-symbols-outlined text-[28px]">notification_important</span>
        </div>
        <h3 className="font-display-lg text-[20px] font-bold text-on-surface mb-3">
          AI Cuts & Review Guide
        </h3>
        <p className="font-body-md text-sm text-on-surface-variant leading-relaxed mb-6">
          The AI is not perfect. Some cuts may be incorrect. Listen to all files, select the correct ones, and click Continue. The rest will go to the Audio Editor.
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-3 font-body-md text-sm font-semibold bg-secondary-container hover:bg-[#5235e8] text-on-surface rounded-full border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
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

  const { jobId: contextJobId, setEditorFiles, selectedFile } = useGeneratorContext();
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
  const [downloadFormat, setDownloadFormat] = useState<"zip" | "individual">("zip");

  // Load job from API
  useEffect(() => {
    if (!activeJobId) {
      router.push("/generator/upload");
      return;
    }
    localStorage.setItem("active_route", `/generator/preview?jobId=${activeJobId}`);
    localStorage.setItem("active_generator_route", `/generator/preview?jobId=${activeJobId}`);
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
    setDownloadFormat("zip");
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-grow flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-body-md text-sm text-on-surface-variant animate-pulse font-semibold">Loading your songs...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-grow flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-4">❌</p>
            <h2 className="font-display-lg text-xl font-bold text-on-surface mb-2">Failed to Load Songs</h2>
            <p className="font-body-md text-sm text-on-surface-variant mb-6">{error ?? "Something went wrong on the server. Please try again."}</p>
            <button onClick={() => router.push("/generator/upload")} className="font-body-md text-sm py-2.5 px-6 border border-primary/30 text-primary rounded-xl hover:bg-primary/10 transition">
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

  if (files.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-grow flex items-center justify-center px-4">
          <p className="font-body-md text-sm text-on-surface-variant">No songs were automatically named. You can rename them by double-clicking.</p>
        </div>
      </div>
    );
  }

  const checkedCount = Object.values(checkedState).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-on-background flex flex-col font-body-md antialiased relative">
      <Navbar />

      <main className="flex-grow pt-24 pb-12 px-6 max-w-[1440px] mx-auto w-full z-10">
        
        {/* Header Title & Metadata */}
        <div className="mb-6">
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">
            Generated Tracks Preview
          </h1>
          
          <div className="font-technical-sm text-technical-sm text-on-surface-variant flex flex-wrap items-center gap-6 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">folder_open</span>
              <span>{selectedFile?.name || "Mixtape Project"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">memory</span>
              <span>DeepSeek V4 Flash</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px]">queue_music</span>
              <span>{files.length} Tracks</span>
            </div>
          </div>
        </div>

        {/* Sticky Action Bar */}
        <div className="sticky top-[80px] z-40 bg-surface-container-high/80 backdrop-blur-xl border border-white/5 glass-edge rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xl">
          <div className="flex items-center gap-4">
            <button
              onClick={handleSelectAll}
              className="font-technical-sm text-technical-sm text-primary hover:underline font-semibold"
            >
              Select All
            </button>
            <span className="text-outline-variant">|</span>
            <button
              onClick={handleDeselectAll}
              className="font-technical-sm text-technical-sm text-on-surface-variant hover:underline font-semibold"
            >
              Deselect All
            </button>
            <div className="flex items-center gap-1.5 bg-surface-container-highest rounded-full px-3 py-1 font-technical-xs text-technical-xs text-on-surface">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span>{checkedCount} of {files.length} selected</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.removeItem(`checked_state_${activeJobId}`);
                }
                localStorage.removeItem("active_split_job");
                localStorage.removeItem("active_route");
                localStorage.removeItem("active_generator_route");
                router.push("/generator/upload");
              }}
              className="border border-red-800/40 hover:bg-red-900/90 text-red-200 bg-red-950/70 font-technical-sm text-technical-sm rounded-full px-4 py-2 transition duration-200 flex items-center gap-1.5 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
              Exit to Upload
            </button>
            <button
              onClick={handleContinue}
              className="border border-primary text-primary hover:bg-primary/10 font-technical-sm text-technical-sm rounded-full px-4 py-2 glass-edge transition duration-200 flex items-center gap-1.5 font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">checklist</span>
              Download Selected
            </button>
            <button
              onClick={() => {
                handleSelectAll();
                setDownloadFormat("zip");
                setShowDownload(true);
              }}
              className="bg-gradient-to-r from-secondary to-primary text-[#000] rounded-full font-bold shadow-[0_0_20px_rgba(168,232,255,0.3)] font-technical-sm text-technical-sm px-4 py-2 flex items-center gap-1.5 transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>archive</span>
              Download All as ZIP
            </button>
          </div>
        </div>

        {/* Track list grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
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

        {/* Bottom Button Container */}
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
              localStorage.removeItem("active_split_job");
              localStorage.removeItem("active_route");
              localStorage.removeItem("active_generator_route");
              router.push("/generator/upload");
            }}
            className="flex-1 py-4 font-body-md text-base font-semibold border border-red-800/40 text-red-200 bg-red-950/70 hover:bg-red-900/90 rounded-xl transition duration-200 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
          >
            ✕ Cancel &amp; Discard Project
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 py-4 font-body-md text-base font-semibold bg-gradient-to-r from-secondary to-primary text-[#000] rounded-xl font-bold shadow-[0_0_20px_rgba(168,232,255,0.3)] transition transform duration-200"
          >
            Continue →
          </button>
        </motion.div>

      </main>

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
            defaultFormat={downloadFormat}
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
        <div className="min-h-screen bg-background flex flex-col justify-center items-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-body-md text-sm text-on-surface-variant mt-4 animate-pulse">
            Initializing preview parameters...
          </p>
        </div>
      }
    >
      <GeneratorPreviewContent />
    </Suspense>
  );
}
