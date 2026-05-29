"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useGeneratorContext } from "@/context/GeneratorContext";
import { useAuth } from "@/hooks/useAuth";
import { wakeupServer } from "@/lib/api";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg", "audio/wav", "audio/ogg",
  "audio/flac", "audio/aac", "audio/mp4", "audio/x-m4a",
]);
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

// ─── Helper: format bytes ─────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── YouTube Link Popup ───────────────────────────────────────────────────────

function YouTubePopup({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative z-10 glass-panel border border-outline-variant/30 rounded-xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mb-4 border border-outline-variant">
          <span className="material-symbols-outlined text-[24px] text-primary">smart_display</span>
        </div>
        <h3 className="font-display-lg text-headline-lg-mobile text-gradient mb-3">
          Download YouTube MP3
        </h3>
        <p className="font-body-md text-sm text-on-surface-variant leading-relaxed mb-6">
          Since direct server-side YouTube downloads are restricted, please download your mixtape audio first.
          Visit{" "}
          <a
            href="https://v2.yt1s.biz/en19/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary-fixed-dim font-bold"
          >
            yt1s.biz
          </a>{" "}
          to convert your YouTube link to a high-quality MP3. Then drag and drop it into the local file area.
        </p>
        <div className="flex gap-3">
          <a
            href="https://v2.yt1s.biz/en19/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gradient py-2.5 rounded-full text-surface-container-lowest font-bold text-center flex-1"
          >
            Open Downloader
          </a>
          <button
            onClick={onClose}
            className="bg-[#0f0f0f]/80 border border-outline-variant hover:border-primary/50 hover-glow transition-all rounded-full py-2.5 flex-1 font-technical-sm text-technical-sm text-center text-on-surface-variant hover:text-on-surface"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

interface DropZoneProps {
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}

function DropZone({ dragOver, onDragOver, onDragLeave, onDrop, onClick }: DropZoneProps) {
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative w-full h-full min-h-[250px] flex flex-col items-center justify-center select-none"
    >
      {/* Dashed Neon Violet Pulsing Border */}
      <div
        className={`absolute inset-0 border-2 border-dashed rounded-xl transition-all duration-300 z-0 ${
          dragOver
            ? "border-primary bg-surface-container-low"
            : "border-secondary/30 bg-surface-container-low/50 animate-pulse-border hover:bg-surface-container-low"
        }`}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-lg text-center z-10">
        <div className="w-16 h-16 rounded-full bg-surface-variant/50 flex items-center justify-center mb-md hover:scale-110 hover:bg-secondary/20 transition-all duration-300">
          <span className="material-symbols-outlined text-[32px] text-secondary">cloud_upload</span>
        </div>
        <p className="font-body-md text-body-md text-on-surface mb-xs font-semibold">Drag &amp; Drop audio file here</p>
        <p className="font-technical-xs text-technical-xs text-on-surface-variant mb-md">Supported: WAV, MP3, FLAC, OGG, AAC, M4A (Max 500MB)</p>
        <div className="inline-flex px-md py-sm bg-surface-bright hover:bg-surface-variant rounded-full font-technical-sm text-technical-sm text-on-surface transition-colors shadow-sm cursor-pointer">
          Browse Files
        </div>
      </div>
    </div>
  );
}

// ─── File Accepted Card ───────────────────────────────────────────────────────

interface FileAcceptedProps {
  file: File;
  onRemove: () => void;
}

function FileAcceptedCard({ file, onRemove }: FileAcceptedProps) {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="w-full bg-[rgba(34,197,94,0.06)] border border-[rgba(34,197,94,0.25)] rounded-2xl p-6 flex items-center gap-4 relative"
    >
      <div className="w-12 h-12 rounded-xl bg-[rgba(34,197,94,0.15)] border border-[rgba(34,197,94,0.3)] flex items-center justify-center text-xl flex-shrink-0 animate-pulse">
        <span className="material-symbols-outlined text-tertiary">check_circle</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-body text-sm font-semibold text-[var(--text-primary)] truncate">
            {file.name}
          </p>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.15)] text-[var(--success)] border border-[rgba(34,197,94,0.3)] uppercase flex-shrink-0">
            {ext.replace(".", "")}
          </span>
        </div>
        <p className="font-mono text-xs text-[var(--text-secondary)] mt-0.5">
          {formatFileSize(file.size)}
        </p>
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove selected file"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--error)] hover:bg-[rgba(239,68,68,0.1)] transition flex-shrink-0"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GeneratorUploadPage() {
  const router = useRouter();
  const { setSelectedFile } = useGeneratorContext();
  const { user, loading: authLoading } = useAuth();

  const [checkingSetup, setCheckingSetup] = useState(true);
  const [wakingUp, setWakingUp] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileLocal, setFileLocal] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showYouTubePopup, setShowYouTubePopup] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [acknowledgeDuration, setAcknowledgeDuration] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mount Guard: check API keys setup, wakeup server
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/");
      return;
    }

    const checkStatusAndWakeup = async () => {
      try {
        const userDocRef = doc(getFirebaseDb(), "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const setupComplete = userDocSnap.exists() ? userDocSnap.data()?.setupComplete : false;
        if (!setupComplete) {
          router.push("/generator/setup");
          return;
        }
        setCheckingSetup(false);
      } catch (err) {
        console.error("Setup check error:", err);
        router.push("/generator/setup");
      }
    };

    const wakeupTimer = setTimeout(() => {
      setWakingUp(true);
    }, 3000);

    const triggerWakeup = async () => {
      try {
        await wakeupServer();
      } catch (err) {
        console.error("Wakeup error:", err);
      } finally {
        clearTimeout(wakeupTimer);
        setWakingUp(false);
      }
    };

    checkStatusAndWakeup();
    triggerWakeup();
  }, [user, authLoading, router]);

  const validateAndSetFile = useCallback((file: File) => {
    setError(null);
    if (file.size > MAX_SIZE_BYTES) {
      setError("This file is too large. Maximum size is 500MB.");
      return;
    }
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES.has(file.type)) {
      setError(
        "This file type is not supported. Please upload an MP3, WAV, OGG, FLAC, AAC, or M4A file."
      );
      return;
    }
    setFileLocal(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleStartProcessing = () => {
    if (!fileLocal) return;
    setSelectedFile(fileLocal);
    router.push("/generator/processing");
  };

  const handleAnalyzeMixtape = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) {
      setError("Please paste a valid YouTube mix link.");
      return;
    }
    setShowYouTubePopup(true);
  };

  // Render Premium Skeleton Loading Resolution State
  if (authLoading || checkingSetup) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex flex-col justify-center items-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="font-body text-sm text-on-surface-variant mt-4 animate-pulse">
          Securing session and verifying credentials...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col relative overflow-hidden">
      {/* Atmospheric Mesh Gradient Lights & Grid */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-grid-pattern bg-[#0f0f0f]">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-secondary/15 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />

        {/* Exit Action button aligned top right */}
        <div className="w-full max-w-5xl mx-auto px-margin pt-lg flex justify-end z-20">
          <button
            onClick={() => router.push("/welcome")}
            className="group flex items-center gap-xs font-technical-sm text-technical-sm text-on-surface-variant hover:text-on-surface transition-colors duration-300"
          >
            <span className="material-symbols-outlined text-[18px] group-hover:rotate-90 transition-transform duration-300">close</span>
            <span>Cancel &amp; Return</span>
          </button>
        </div>

        <main className="flex-1 flex flex-col items-center justify-center px-margin pb-xl max-w-5xl mx-auto w-full z-10">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-xl max-w-2xl w-full"
          >
            <h1 className="font-display-lg text-display-lg text-on-surface mb-sm tracking-tight drop-shadow-md">
              AI Mixtape Splitter
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Import a continuous audio file or YouTube mix. Our AI will analyze waveforms, detect transitions, and automatically segment individual tracks.
            </p>
          </motion.div>

          {/* Wakeup Server Banner (Triggers on response > 3 seconds) */}
          <AnimatePresence>
            {wakingUp && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-3xl mb-6 p-4 bg-primary/10 border border-primary/30 rounded-xl flex items-center gap-3"
              >
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-body-md text-sm font-semibold text-primary">
                    Waking up server... (~30s)
                  </p>
                  <p className="font-body-md text-xs text-on-surface-variant">
                    The backend service is cold starting. Please wait while we initialize the AI pipeline.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="w-full max-w-3xl mb-6 p-3.5 bg-error-container/20 border border-error/30 rounded-xl flex items-start gap-2"
              >
                <span className="text-error mt-0.5">⚠️</span>
                <span className="font-body-md text-sm text-error">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={handleFileInput}
            aria-label="Choose audio file"
          />

          {/* Action Card Section */}
          <div className="w-full max-w-5xl">
            <AnimatePresence mode="wait">
              {!fileLocal ? (
                <motion.div
                  key="options"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="w-full bg-surface-container/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative z-10"
                >
                  {/* Edge lighting effect */}
                  <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none"></div>

                  {/* Left Column: Drag & Drop */}
                  <div className="flex-1 p-lg md:p-xl flex flex-col min-h-[400px]">
                    <div className="flex items-center gap-sm mb-md">
                      <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>audio_file</span>
                      <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">Local File</h2>
                    </div>
                    <div className="flex-1 relative group cursor-pointer h-full min-h-[220px]">
                      <DropZone
                        dragOver={dragOver}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                      />
                    </div>
                  </div>

                  {/* Center: Glowing Separator */}
                  <div className="relative flex md:flex-col items-center justify-center px-lg md:px-0 py-md md:py-xl bg-surface-container/30">
                    <div className="absolute md:static w-full md:w-px h-px md:h-full bg-gradient-to-r md:bg-gradient-to-b from-transparent via-secondary/50 to-transparent shadow-[0_0_10px_rgba(199,191,255,0.3)]"></div>
                    <div className="absolute z-10 bg-surface-container-highest border border-outline-variant rounded-full px-sm py-xs flex items-center justify-center shadow-lg">
                      <span className="font-technical-xs text-technical-xs text-on-surface-variant tracking-widest font-bold">OR</span>
                    </div>
                  </div>

                  {/* Right Column: YouTube Input */}
                  <div className="flex-1 p-lg md:p-xl flex flex-col justify-center min-h-[400px] gap-md">
                    <div className="flex items-center gap-sm mb-md">
                      <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_display</span>
                      <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">YouTube Mix</h2>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                      Paste a link to a DJ set. We&apos;ll extract the high-quality audio stream directly.
                    </p>
                    <form onSubmit={handleAnalyzeMixtape} className="flex flex-col gap-md">
                      {/* Glassy Search Bar */}
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-md flex items-center pointer-events-none">
                          <span className="material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">link</span>
                        </div>
                        <input
                          className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-md pl-[44px] pr-md font-technical-sm text-technical-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all placeholder:text-outline-variant shadow-inner"
                          placeholder="https://youtube.com/watch?v=..."
                          type="url"
                          required
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                        />
                      </div>
                      
                      {/* Warning Checkbox */}
                      <label className="flex items-start gap-sm cursor-pointer group mt-sm select-none">
                        <div className="relative flex items-center justify-center mt-[2px]">
                          <input
                            className="peer appearance-none w-4 h-4 border border-outline-variant rounded-[3px] bg-surface-container-lowest checked:bg-secondary checked:border-secondary transition-colors cursor-pointer focus:ring-2 focus:ring-secondary/30 focus:outline-none"
                            type="checkbox"
                            checked={acknowledgeDuration}
                            onChange={(e) => setAcknowledgeDuration(e.target.checked)}
                          />
                          <span className="material-symbols-outlined text-[12px] text-surface-container-lowest absolute opacity-0 peer-checked:opacity-100 pointer-events-none" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                        </div>
                        <span className="font-technical-xs text-technical-xs text-on-surface-variant group-hover:text-on-surface transition-colors leading-relaxed">
                          I acknowledge this video exceeds 1 hour. AI processing may take several minutes depending on server load.
                        </span>
                      </label>

                      {/* AI Magic Action Button */}
                      <button
                        type="submit"
                        className="mt-lg w-full py-md rounded-full bg-secondary hover:bg-secondary-container text-surface-container-lowest font-headline-lg-mobile text-[16px] leading-[24px] font-bold flex items-center justify-center gap-sm transition-all duration-300 ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)]"
                      >
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                        Analyze Mixtape
                      </button>
                    </form>
                  </div>
                </motion.div>
              ) : (
                <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 items-center">
                  <FileAcceptedCard
                    file={fileLocal}
                    onRemove={() => {
                      setFileLocal(null);
                      setError(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  />
                  
                  {/* Start Processing Button */}
                  <motion.button
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    onClick={handleStartProcessing}
                    className="btn-gradient w-full py-4 rounded-full text-surface-container-lowest font-bold text-center shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition transform duration-200 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                    <span>Start Processing</span>
                  </motion.button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* YouTube Downloader Guidelines Popup */}
      <AnimatePresence>
        {showYouTubePopup && <YouTubePopup onClose={() => setShowYouTubePopup(false)} />}
      </AnimatePresence>
    </div>
  );
}
