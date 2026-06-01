"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useGeneratorContext } from "@/context/GeneratorContext";
import { useAuth } from "@/hooks/useAuth";
import { wakeupServer, getJob } from "@/lib/api";
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
        className="relative z-10 bg-surface-container-high border border-outline-variant rounded-2xl p-8 max-w-md w-full shadow-2xl backdrop-blur-xl"
      >
        {/* Inner edge lighting border */}
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none z-20" />

        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
          <span className="material-symbols-outlined text-[28px]" style={{fontVariationSettings: "'FILL' 1"}}>smart_display</span>
        </div>
        <h3 className="font-display-lg text-[20px] font-bold text-on-surface mb-3">
          Download from YouTube
        </h3>
        <p className="font-body-md text-sm text-on-surface-variant leading-relaxed mb-6">
          Visit{" "}
          <a
            href="https://v2.yt1s.biz/en19/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-cyan-300 font-semibold"
          >
            yt1s.biz
          </a>{" "}
          to download your audio as MP3. Higher quality results in more accurate splits.
          The site opens in a new tab. Come back here and upload the downloaded file.
        </p>
        <div className="flex gap-3">
          <a
            href="https://v2.yt1s.biz/en19/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 text-center font-body-md text-sm font-semibold bg-secondary-container hover:bg-[#5235e8] text-on-surface rounded-full border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Open Downloader
          </a>
          <button
            onClick={onClose}
            className="flex-1 py-3 font-body-md text-sm font-semibold border border-outline-variant hover:bg-surface-variant/50 text-on-surface-variant hover:text-on-surface rounded-full transition"
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
    <motion.div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      animate={{
        borderColor: dragOver ? "rgba(168,232,255,0.8)" : "rgba(60, 73, 78, 0.4)",
        backgroundColor: dragOver ? "rgba(168,232,255,0.05)" : "rgba(14, 14, 14, 0.4)",
        scale: dragOver ? 1.02 : 1,
      }}
      transition={{ duration: 0.2 }}
      className={`w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer min-h-[300px] select-none h-full relative ${
        dragOver ? "" : "animate-pulse-border"
      }`}
    >
      <motion.div
        animate={{ y: dragOver ? -4 : 0 }}
        transition={{ duration: 0.2 }}
        className="w-16 h-16 rounded-full bg-surface-variant/50 flex items-center justify-center text-primary mb-4"
      >
        <span className="material-symbols-outlined text-[32px]">
          {dragOver ? "download" : "cloud_upload"}
        </span>
      </motion.div>
      <p className="font-display-lg text-[18px] font-bold text-on-surface mb-2 text-center">
        {dragOver ? "Drop your audio file here" : "Drag & drop audio file here"}
      </p>
      <p className="font-body-md text-sm text-on-surface-variant mb-6 text-center">
        or click to browse your files
      </p>
      
      {/* Choose File Button inside Dropzone */}
      <button className="px-5 py-2 bg-surface-bright hover:bg-surface-variant rounded-full font-technical-sm text-technical-sm text-on-surface border border-white/5 transition mb-6 shadow-md transform active:scale-95 duration-200">
        Browse Files
      </button>

      <div className="flex flex-wrap gap-2 justify-center">
        {["MP3", "WAV", "OGG", "FLAC", "AAC", "M4A"].map((ext) => (
          <span
            key={ext}
            className="font-technical-xs text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary"
          >
            .{ext.toLowerCase()}
          </span>
        ))}
      </div>
      <p className="font-technical-xs text-[11px] text-on-surface-variant mt-4">Supported up to 500 MB</p>
    </motion.div>
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
      className="w-full bg-tertiary-container/10 border border-tertiary-container/30 rounded-2xl p-6 flex items-center gap-4 relative overflow-hidden"
    >
      {/* Inner edge lighting border */}
      <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
        className="w-12 h-12 rounded-xl bg-tertiary/15 border border-tertiary/30 flex items-center justify-center text-tertiary flex-shrink-0 animate-pulse"
      >
        <span className="material-symbols-outlined text-[24px]">check_circle</span>
      </motion.div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-body-md text-sm font-semibold text-on-surface truncate">
            {file.name}
          </p>
          <span className="font-technical-xs text-[9px] px-1.5 py-0.5 rounded bg-tertiary/15 text-tertiary border border-tertiary/30 uppercase flex-shrink-0">
            {ext.replace(".", "")}
          </span>
        </div>
        <p className="font-technical-xs text-[11px] text-on-surface-variant mt-0.5">
          {formatFileSize(file.size)}
        </p>
      </div>
      <button
        onClick={onRemove}
        aria-label="Remove selected file"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition flex-shrink-0"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
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
        if (typeof window !== "undefined") {
          // 1. Check for active generator route persistence
          const activeRoute = localStorage.getItem("active_generator_route");
          if (activeRoute && activeRoute !== "/generator/upload") {
            router.push(activeRoute);
            return;
          }

          // 2. Fallback check for active split job status
          const activeJob = localStorage.getItem("active_split_job");
          if (activeJob) {
            try {
              const res = await getJob(activeJob);
              if (res.success && res.data) {
                const status = res.data.status;
                if (status === "complete") {
                  router.push(`/generator/preview?jobId=${activeJob}`);
                  return;
                } else if (status === "processing") {
                  router.push("/generator/processing");
                  return;
                }
              }
              localStorage.removeItem("active_split_job");
            } catch {
              router.push("/generator/processing");
              return;
            }
          }
        }

        // Client-side Firestore check — no backend cold start needed
        const userDocRef = doc(getFirebaseDb(), "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const setupComplete = userDocSnap.exists() ? userDocSnap.data()?.setupComplete : false;
        if (!setupComplete) {
          router.push("/generator/setup");
          return;
        }
        localStorage.setItem("active_route", "/generator/upload");
        localStorage.setItem("active_generator_route", "/generator/upload");
        setCheckingSetup(false);
      } catch (err) {
        console.error("Setup check error:", err);
        router.push("/generator/setup");
      }
    };

    // Wakeup call triggers delayed wakeup notification banner
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

  // Render Premium Skeleton Loading Resolution State
  if (authLoading || checkingSetup) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="font-body-md text-sm text-on-surface-variant mt-4 animate-pulse">
          Securing session and verifying credentials...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col relative overflow-hidden">
      <Navbar />

      {/* Atmospheric mesh gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/10 blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-secondary-container/20 blur-[120px]" />
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      </div>

      <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 max-w-5xl mx-auto w-full z-10 pt-24">
        
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 w-full max-w-2xl"
        >
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight mb-4 drop-shadow-md">
            AI Mixtape Splitter
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Import a continuous audio file or YouTube mix, and split it into named songs using our AI pipeline.
          </p>
        </motion.div>

        {/* Wakeup Server Banner (Triggers on response > 3 seconds) */}
        <AnimatePresence>
          {wakingUp && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3"
            >
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="font-body-md text-sm font-semibold text-primary">
                  Waking up server... (~30s)
                </p>
                <p className="font-technical-xs text-xs text-on-surface-variant">
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
              className="w-full mb-6 p-4 bg-error-container/20 border border-error/30 rounded-xl flex items-start gap-2 text-error"
            >
              <span className="material-symbols-outlined text-[20px] mt-0.5">warning</span>
              <span className="font-body-md text-sm">{error}</span>
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

        {/* Action Container */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            {!fileLocal ? (
              <motion.div
                key="options"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full bg-surface-container/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative"
              >
                {/* Inner edge lighting border */}
                <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none z-20" />

                {/* Left Column: Drop Zone */}
                <div className="flex-grow p-6 md:p-12 flex flex-col min-h-[400px] items-center justify-center text-center relative z-10 md:w-1/2">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-primary text-[24px]" style={{fontVariationSettings: "'FILL' 1"}}>audio_file</span>
                    <h3 className="font-display-lg text-[20px] font-bold text-on-surface">Local File</h3>
                  </div>
                  <div className="w-full flex-grow">
                    <DropZone
                      dragOver={dragOver}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    />
                  </div>
                </div>

                {/* Center Separator */}
                <div className="md:w-[1px] md:h-auto h-[1px] w-full bg-gradient-to-b from-transparent via-outline-variant to-transparent flex items-center justify-center relative md:my-0 my-4 z-10">
                  <span className="absolute bg-surface-container-highest border border-outline-variant rounded-full px-3 py-1 font-technical-sm text-technical-xs text-on-surface-variant font-bold">
                    OR
                  </span>
                </div>

                {/* Right Column: YouTube Link Info */}
                <div className="flex-grow p-6 md:p-12 flex flex-col justify-center min-h-[400px] text-center items-center relative z-10 md:w-1/2">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-secondary text-[24px]" style={{fontVariationSettings: "'FILL' 1"}}>smart_display</span>
                    <h3 className="font-display-lg text-[20px] font-bold text-on-surface">YouTube Mix</h3>
                  </div>
                  <p className="font-body-md text-sm text-on-surface-variant leading-relaxed max-w-sm mb-8">
                    mixtapes and playlists from YouTube need to be downloaded as MP3s first. Learn how to convert them in 2 steps for splitting.
                  </p>
                  <button
                    onClick={() => setShowYouTubePopup(true)}
                    className="w-full max-w-xs py-3.5 rounded-full bg-secondary-container hover:bg-[#5235e8] text-on-surface font-headline-lg-mobile text-[16px] font-semibold ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] flex items-center justify-center gap-2 transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>auto_fix_high</span>
                    I Have a YouTube Link
                  </button>
                </div>
              </motion.div>
            ) : (
              <FileAcceptedCard
                key="file-accepted"
                file={fileLocal}
                onRemove={() => {
                  setFileLocal(null);
                  setError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Start Processing Button */}
        <AnimatePresence>
          {fileLocal && (
            <motion.button
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              onClick={handleStartProcessing}
              className="mt-8 w-full max-w-md py-4 rounded-full bg-secondary-container hover:bg-[#5235e8] text-on-surface font-headline-lg-mobile text-[16px] font-semibold ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] flex items-center justify-center gap-3 transition transform duration-200"
            >
              <span className="material-symbols-outlined text-[22px]" style={{fontVariationSettings: "'FILL' 1"}}>auto_fix_high</span>
              <span>Start Processing</span>
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      {/* YouTube Downloader Guidelines Popup */}
      <AnimatePresence>
        {showYouTubePopup && <YouTubePopup onClose={() => setShowYouTubePopup(false)} />}
      </AnimatePresence>
    </div>
  );
}
