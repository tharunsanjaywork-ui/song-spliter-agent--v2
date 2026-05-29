"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useGeneratorContext } from "@/context/GeneratorContext";
import { wakeupServer, streamProcess, ProcessingEvent } from "@/lib/api";
import { analyzeAudioFile } from "@/lib/audioAnalyzer";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId = "wakeup" | "analyzing" | "thinking" | "saving" | "naming" | "complete";
type ErrorType = "acr_limit_exceeded" | "openrouter_limit_exceeded" | "general";

interface ChatMessage {
  id: StepId;
  emoji: string;
  text: string;
}

// ─── Error content (exact wording from APP_FLOW.md) ──────────────────────────

const ERROR_CONTENT: Record<ErrorType, { title: string; body: string }> = {
  acr_limit_exceeded: {
    title: "ACRCloud Free Trial Ended",
    body: "Your ACRCloud free trial has ended. No worries — you can create a new free ACRCloud account with a different Gmail address and continue using AudioWave for free. This app is always free and open source.",
  },
  openrouter_limit_exceeded: {
    title: "OpenRouter Credits Ended",
    body: "Your OpenRouter credits have run out. You can top up your balance or create a new OpenRouter account. AudioWave is always free and open source.",
  },
  general: {
    title: "Something Went Wrong",
    body: "Something went wrong on the server. Please try again.",
  },
};

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-4 px-5 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl w-fit">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-[var(--accent-cyan)] rounded-full"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Chat Message Card ────────────────────────────────────────────────────────

function MessageCard({
  message,
  thinkingSeconds,
  isDoneComplete,
}: {
  message: ChatMessage;
  thinkingSeconds?: number;
  isDoneComplete?: boolean;
}) {
  const isThinking = message.id === "thinking";
  const isDone = message.id === "complete";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`flex items-start gap-4 p-5 rounded-2xl border backdrop-blur-md ${
        isDone
          ? "bg-[rgba(34,197,94,0.06)] border-[rgba(34,197,94,0.2)] shadow-[0_0_20px_rgba(34,197,94,0.06)]"
          : "bg-[var(--glass-bg)] border-[var(--glass-border)]"
      }`}
    >
      <motion.span
        className="text-2xl flex-shrink-0 mt-0.5"
        initial={isDone ? { scale: 0 } : {}}
        animate={isDone ? { scale: 1 } : {}}
        transition={isDone ? { type: "spring", stiffness: 400, damping: 15 } : {}}
      >
        {message.emoji}
      </motion.span>

      <div className="flex-1 min-w-0">
        <p className="font-body text-sm text-[var(--text-primary)] leading-relaxed">
          {message.text}
        </p>
        {isThinking && thinkingSeconds !== undefined && (
          <div className="flex items-center gap-2 mt-1.5">
            <motion.span
              key={thinkingSeconds}
              className="font-mono text-xs font-bold text-[var(--accent-cyan)]"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.3 }}
            >
              {thinkingSeconds}s
            </motion.span>
            <span className="font-body text-xs text-[var(--text-muted)]">elapsed</span>
          </div>
        )}
      </div>

      {isDone && isDoneComplete && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
          className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--success)] flex items-center justify-center text-xs text-white font-bold"
        >
          ✓
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Error Modal ──────────────────────────────────────────────────────────────

function ErrorModal({
  errorType,
  customMessage,
  onCancel,
  onContinue,
}: {
  errorType: ErrorType;
  customMessage: string | null;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const content = ERROR_CONTENT[errorType];
  const showContinue = errorType !== "general";
  const bodyText = (errorType === "general" && customMessage) ? customMessage : content.body;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative z-10 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="text-4xl mb-4">{errorType === "general" ? "❌" : "⚠️"}</div>
        <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-3">
          {content.title}
        </h3>
        <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
          {bodyText}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 font-body text-sm font-semibold border border-[rgba(255,255,255,0.08)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition"
          >
            Cancel
          </button>
          {showContinue && (
            <button
              onClick={onContinue}
              className="flex-1 py-2.5 font-body text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl hover:scale-[1.02] active:scale-[0.98] transition transform"
            >
              Continue
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Preview Warning Modal ────────────────────────────────────────────────────

function PreviewWarningModal({ onConfirm }: { onConfirm: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative z-10 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="text-4xl mb-4">👂</div>
        <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-3">
          Review Before Downloading
        </h3>
        <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
          Please review all songs before continuing. The AI may have made incorrect cuts. Listen to
          each one, check the file names, and select only the files that are correct. The unselected
          files will be sent to the Audio Editor so you can fix them manually.
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-3 font-body text-sm font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl hover:shadow-[0_0_15px_rgba(0,212,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition transform"
        >
          Got it, show me
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GeneratorProcessingPage() {
  const router = useRouter();
  const { selectedFile, jobId, setJobId: setContextJobId } = useGeneratorContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [showTyping, setShowTyping] = useState(false);
  const [isWaking, setIsWaking] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [processingDone, setProcessingDone] = useState(false);
  const [showPreviewWarning, setShowPreviewWarning] = useState(false);

  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const thinkingAddedRef = useRef(false);
  const pipelineStartedRef = useRef(false);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleSseEvent = useCallback(
    (event: ProcessingEvent) => {
      setIsUploading(false);
      switch (event.step) {
        case "analyzing":
          setIsWaking(false);
          setShowTyping(false);
          addMessage({ id: "analyzing", emoji: "📊", text: "Analyzing your audio file..." });
          setShowTyping(true);
          break;
        case "thinking":
          setShowTyping(false);
          if (!thinkingAddedRef.current) {
            thinkingAddedRef.current = true;
            addMessage({ id: "thinking", emoji: "🧠", text: "Thinking..." });
          }
          setThinkingSeconds(event.elapsed ?? 0);
          break;
        case "saving":
          setShowTyping(false);
          addMessage({ id: "saving", emoji: "💾", text: "Saving individual files..." });
          setShowTyping(true);
          break;
        case "naming":
          setShowTyping(false);
          addMessage({ id: "naming", emoji: "🏷️", text: "Naming your songs..." });
          setShowTyping(true);
          break;
        case "complete":
          setShowTyping(false);
          addMessage({ id: "complete", emoji: "✅", text: "Done! Your songs are ready." });
          if (event.jobId) setContextJobId(event.jobId);
          setProcessingDone(true);
          break;
        case "error":
          setShowTyping(false);
          setIsWaking(false);
          setErrorType((event.error_type as ErrorType) ?? "general");
          setCustomErrorMsg(event.message ?? null);
          setShowErrorModal(true);
          break;
      }
    },
    [addMessage, setContextJobId]
  );

  // Guard: redirect back if no file was passed from upload page
  useEffect(() => {
    if (!selectedFile) router.push("/generator/upload");
  }, [selectedFile, router]);

  // Start pipeline once on mount
  useEffect(() => {
    if (!selectedFile || pipelineStartedRef.current) return;
    pipelineStartedRef.current = true;

    const run = async () => {
      try {
        await wakeupServer();
        setIsWaking(false);

        // 1. Run local audio analysis using client RAM and CPU
        const analysisResult = await analyzeAudioFile(selectedFile, (status) => {
          setAnalysisStatus(status);
        });
        setAnalysisStatus(null);

        // 2. Start file upload + streaming process
        setIsUploading(true);
        await streamProcess(selectedFile, analysisResult, handleSseEvent);
      } catch (err) {
        setAnalysisStatus(null);
        setIsWaking(false);
        setIsUploading(false);
        setShowTyping(false);
        setErrorType("general");
        setCustomErrorMsg(err instanceof Error ? err.message : "Something went wrong on the server.");
        setShowErrorModal(true);
      }
    };
    run();
  }, [selectedFile, handleSseEvent]);

  const handleErrorCancel = () => {
    setShowErrorModal(false);
    router.push("/generator/upload");
  };

  const handleErrorContinue = () => {
    setShowErrorModal(false);
    const anchor = errorType === "acr_limit_exceeded" ? "#acr-section" : "#openrouter-section";
    router.push(`/generator/setup${anchor}`);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center px-4 py-10 max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 w-full"
        >
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-wide bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent mb-2">
            AI Processing
          </h1>
          {selectedFile && (
            <p className="font-mono text-xs text-[var(--text-muted)] truncate max-w-xs mx-auto">
              {selectedFile.name}
            </p>
          )}
        </motion.div>

        {/* Chat feed */}
        <div className="w-full flex flex-col gap-3" aria-live="polite" aria-label="Processing status">

          {isWaking && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-start gap-4 p-5 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl backdrop-blur-md"
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">🔄</span>
              <div className="flex-1">
                <p className="font-body text-sm text-[var(--text-primary)]">
                  Waking up the server…{" "}
                  <span className="text-[var(--text-muted)]">(~30 seconds)</span>
                </p>
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {analysisStatus && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-start gap-4 p-5 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl backdrop-blur-md"
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">⚙️</span>
              <div className="flex-1">
                <p className="font-body text-sm text-[var(--text-primary)]">
                  {analysisStatus}{" "}
                  <span className="text-[var(--text-muted)]">(using your local PC RAM & CPU)</span>
                </p>
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {isUploading && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-start gap-4 p-5 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl backdrop-blur-md"
            >
              <span className="text-2xl flex-shrink-0 mt-0.5">📤</span>
              <div className="flex-1">
                <p className="font-body text-sm text-[var(--text-primary)]">
                  Uploading your audio file…{" "}
                  <span className="text-[var(--text-muted)]">(Please don&apos;t close this page)</span>
                </p>
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {messages.map((msg) => (
            <MessageCard
              key={msg.id}
              message={msg}
              thinkingSeconds={msg.id === "thinking" ? thinkingSeconds : undefined}
              isDoneComplete={msg.id === "complete" && processingDone}
            />
          ))}

          {showTyping && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <TypingIndicator />
            </motion.div>
          )}

          <AnimatePresence>
            {processingDone && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.4 }}
                onClick={() => setShowPreviewWarning(true)}
                className="mt-4 w-full py-4 font-body text-base font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl shadow-lg hover:shadow-[0_0_25px_rgba(0,212,255,0.35)] hover:scale-[1.02] active:scale-[0.98] transition transform duration-200 flex items-center justify-center gap-3"
              >
                <span className="text-xl">🎵</span>
                <span>Preview Songs</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {showErrorModal && errorType && (
          <ErrorModal
            errorType={errorType}
            customMessage={customErrorMsg}
            onCancel={handleErrorCancel}
            onContinue={handleErrorContinue}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreviewWarning && (
          <PreviewWarningModal onConfirm={() => router.push(`/generator/preview?jobId=${jobId || ""}`)} />
        )}
      </AnimatePresence>
    </div>
  );
}
