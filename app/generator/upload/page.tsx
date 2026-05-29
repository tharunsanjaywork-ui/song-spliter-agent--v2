"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useGeneratorContext } from "@/context/GeneratorContext";
import { useAuth } from "@/hooks/useAuth";
import { wakeupServer } from "@/lib/api";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
        className="relative z-10 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="w-12 h-12 rounded-xl bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.2)] flex items-center justify-center text-2xl mb-4">
          🎬
        </div>
        <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-3">
          Download from YouTube
        </h3>
        <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          Visit{" "}
          <a
            href="https://v2.yt1s.biz/en19/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-cyan)] underline hover:text-cyan-300 font-semibold"
          >
            https://v2.yt1s.biz/en19/
          </a>{" "}
          to download your audio as MP3. Higher quality = more accurate results.
          The site opens in a new tab. Come back here and upload the downloaded file.
        </p>
        <div className="flex gap-3">
          <a
            href="https://v2.yt1s.biz/en19/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 text-center font-body text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl hover:shadow-[0_0_15px_rgba(0,212,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition transform"
          >
            Open Downloader
          </a>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 font-body text-sm font-semibold border border-[rgba(255,255,255,0.08)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition"
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
        borderColor: dragOver ? "rgba(0,212,255,0.8)" : "rgba(255,255,255,0.08)",
        backgroundColor: dragOver ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.02)",
        scale: dragOver ? 1.02 : 1,
      }}
      transition={{ duration: 0.2 }}
      className={`w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer min-h-[260px] select-none h-full ${
        dragOver ? "" : "pulse-border"
      }`}
    >
      <motion.div
        animate={{ y: dragOver ? -4 : 0 }}
        transition={{ duration: 0.2 }}
        className="text-5xl mb-4"
      >
        {dragOver ? "⬇️" : "🎵"}
      </motion.div>
      <p className="font-heading text-lg font-bold text-[var(--text-primary)] mb-2 text-center">
        {dragOver ? "Drop your audio file here" : "Drag & drop your audio file"}
      </p>
      <p className="font-body text-sm text-[var(--text-secondary)] mb-4 text-center">
        or click to browse your files
      </p>
      
      {/* Choose File Button inside Dropzone */}
      <button className="px-5 py-2.5 bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] rounded-xl font-body text-xs font-semibold hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text-primary)] text-[var(--text-secondary)] transition mb-6 shadow-md transform active:scale-95 duration-200">
        Choose File
      </button>

      <div className="flex flex-wrap gap-2 justify-center">
        {["MP3", "WAV", "OGG", "FLAC", "AAC", "M4A"].map((ext) => (
          <span
            key={ext}
            className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.2)] text-[var(--accent-cyan)]"
          >
            .{ext.toLowerCase()}
          </span>
        ))}
      </div>
      <p className="font-body text-xs text-[var(--text-muted)] mt-3">Maximum file size: 500 MB</p>
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
      className="w-full bg-[rgba(34,197,94,0.06)] border border-[rgba(34,197,94,0.25)] rounded-2xl p-6 flex items-center gap-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
        className="w-12 h-12 rounded-xl bg-[rgba(34,197,94,0.15)] border border-[rgba(34,197,94,0.3)] flex items-center justify-center text-xl flex-shrink-0 animate-pulse"
      >
        ✅
      </motion.div>
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
        ✕
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
        // Client-side Firestore check — no backend cold start needed
        const userDocRef = doc(db, "users", user.uid);
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
      <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col justify-center items-center">
        <div className="w-10 h-10 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
        <p className="font-body text-sm text-[var(--text-secondary)] mt-4 animate-pulse">
          Securing session and verifying credentials...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex flex-col relative overflow-hidden">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-4xl mx-auto w-full z-10">
        
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 w-full"
        >
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-wide bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent mb-3">
            Add Your Mixtape
          </h1>
          <p className="font-body text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            Harness AI pipeline to split your downloaded YouTube mixtape audio into properly segmented, fully named individual songs.
          </p>
        </motion.div>

        {/* Wakeup Server Banner (Triggers on response > 3 seconds) */}
        <AnimatePresence>
          {wakingUp && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full mb-6 p-4 bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.2)] rounded-xl flex items-center gap-3"
            >
              <div className="w-5 h-5 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="font-body text-sm font-semibold text-[var(--accent-cyan)]">
                  Waking up server... (~30s)
                </p>
                <p className="font-body text-xs text-[var(--text-secondary)]">
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
              className="w-full mb-6 p-3.5 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] rounded-xl flex items-start gap-2"
            >
              <span className="text-[var(--error)] mt-0.5">⚠️</span>
              <span className="font-body text-sm text-[var(--error)]">{error}</span>
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
        <div className="w-full max-w-3xl">
          <AnimatePresence mode="wait">
            {!fileLocal ? (
              <motion.div
                key="options"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full h-full"
              >
                {/* Option 1: YouTube Downloader Helper Card */}
                <div
                  onClick={() => setShowYouTubePopup(true)}
                  className="group cursor-pointer bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-8 backdrop-blur-[20px] hover:border-[var(--accent-cyan)] hover:shadow-[0_0_25px_rgba(0,212,255,0.1)] transition duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-[rgba(0,212,255,0.1)] flex items-center justify-center border border-[rgba(0,212,255,0.25)] text-[var(--accent-cyan)] mb-6 transition duration-300 group-hover:scale-110 shadow-[0_0_10px_rgba(0,212,255,0.1)] text-2xl">
                      🎬
                    </div>
                    <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-3">
                      I have a YouTube link
                    </h3>
                    <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed">
                      mixtapes and playlists from YouTube need to be downloaded as MP3s first. Learn how to convert them in 2 steps for splitting.
                    </p>
                  </div>
                  <span className="font-body text-xs font-semibold text-[var(--accent-cyan)] mt-6 inline-block group-hover:underline">
                    Get MP3 Downloader →
                  </span>
                </div>

                {/* Option 2: Upload File Drag & Drop Card */}
                <div className="h-full">
                  <DropZone
                    dragOver={dragOver}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  />
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
              className="mt-8 w-full max-w-md py-4 font-body text-base font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition transform duration-200 flex items-center justify-center gap-3"
            >
              <span className="text-xl">🚀</span>
              <span>Start Processing</span>
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      {/* YouTube Downloader Guidelines Popup */}
      <AnimatePresence>
        {showYouTubePopup && <YouTubePopup onClose={() => setShowYouTubePopup(false)} />}
      </AnimatePresence>

      <style jsx global>{`
        .pulse-border {
          animation: borderPulse 3s infinite ease-in-out;
        }

        @keyframes borderPulse {
          0%, 100% {
            border-color: var(--glass-border);
          }
          50% {
            border-color: rgba(0, 212, 255, 0.3);
          }
        }
      `}</style>
    </div>
  );
}
