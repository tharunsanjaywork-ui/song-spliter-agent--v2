"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
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
    title: "AcoustID Key Error or Limit Exceeded",
    body: "Your AcoustID Client API key might be invalid or rate limits have been exceeded. Please check your key in the Setup Guide. Getting an AcoustID API key is always free.",
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
    <div className="glass-panel flex items-center gap-1.5 py-3 px-5 border border-outline-variant/30 bg-surface-container/30 rounded-full w-fit">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-primary rounded-full"
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
      className={`glass-panel flex items-start gap-4 p-5 rounded-xl border backdrop-blur-md transition-all hover-glow ${
        isDone
          ? "border-primary/30 bg-surface-container/50 shadow-[0_0_15px_rgba(168,232,255,0.05)]"
          : "border-outline-variant/30 bg-surface-container/30"
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant flex-shrink-0">
        <span className="text-lg">{message.emoji}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-body text-sm text-on-surface leading-relaxed font-medium">
          {message.text}
        </p>
        {isThinking && thinkingSeconds !== undefined && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 animate-pulse">
              {thinkingSeconds}s
            </span>
            <span className="font-technical-xs text-[10px] text-on-surface-variant">elapsed</span>
          </div>
        )}
      </div>

      {isDone && isDoneComplete && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
          className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-xs text-primary font-bold shadow-[0_0_10px_rgba(0,212,255,0.3)]"
        >
          <span className="material-symbols-outlined text-[14px]">check</span>
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
        className="relative z-10 glass-panel border border-outline-variant/30 rounded-xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="w-12 h-12 rounded-full bg-error-container/20 flex items-center justify-center border border-error mb-4">
          <span className="material-symbols-outlined text-[24px] text-error">warning</span>
        </div>
        <h3 className="font-display-lg text-headline-lg-mobile text-gradient mb-3">
          {content.title}
        </h3>
        <p className="font-body-md text-technical-sm text-on-surface-variant leading-relaxed mb-6">
          {bodyText}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="bg-[#0f0f0f]/80 border border-outline-variant hover:border-primary/50 hover-glow transition-all rounded-full py-2.5 flex-1 font-technical-sm text-technical-sm text-center"
          >
            Cancel
          </button>
          {showContinue && (
            <button
              onClick={onContinue}
              className="btn-gradient py-2.5 rounded-full text-surface-container-lowest font-technical-sm flex-1 font-bold text-center"
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
        className="relative z-10 glass-panel border border-outline-variant/30 rounded-xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mb-4 border border-outline-variant">
          <span className="material-symbols-outlined text-[24px] text-primary">headphones</span>
        </div>
        <h3 className="font-display-lg text-headline-lg-mobile text-gradient mb-3">
          Review Before Downloading
        </h3>
        <p className="font-body-md text-technical-sm text-on-surface-variant leading-relaxed mb-6">
          Please review all songs before continuing. The AI may have made incorrect cuts. Listen to
          each one, check the file names, and select only the files that are correct. The unselected
          files will be sent to the Audio Editor so you can fix them manually.
        </p>
        <button
          onClick={onConfirm}
          className="btn-gradient w-full py-3 rounded-full text-surface-container-lowest font-bold flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(168,232,255,0.3)]"
        >
          <span>Got it, show me</span>
          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
        </button>
      </motion.div>
    </motion.div>
  );
}

interface ProcessingParticle {
  id: number;
  size: number;
  startX: number;
  startY: number;
  tx: number;
  ty: number;
  duration: number;
  delay: number;
  color: string;
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
  const allowThinkingRef = useRef(false);
  const pendingThinkingEventRef = useRef<ProcessingEvent | null>(null);
  const [triggerThinkingRender, setTriggerThinkingRender] = useState(false);

  const [particles, setParticles] = useState<ProcessingParticle[]>([]);

  useEffect(() => {
    const count = 25;
    const colors = ["#00d4ff", "#b8afff"];
    const newParticles = Array.from({ length: count }).map((_, i) => {
      const size = Math.random() * 6 + 2;
      const startX = Math.random() * 100;
      const startY = Math.random() * 100;
      const tx = Math.random() * 200 - 100;
      const ty = Math.random() * 200 - 100;
      const duration = Math.random() * 15 + 15;
      const delay = Math.random() * -30;
      const color = colors[Math.floor(Math.random() * colors.length)];
      return { id: i, size, startX, startY, tx, ty, duration, delay, color };
    });
    setParticles(newParticles);
  }, []);

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
          addMessage({
            id: "analyzing",
            emoji: "🤖",
            text: "AI is currently checking your processed file to analyze and generate a report"
          });
          setShowTyping(true);
          setTimeout(() => {
            allowThinkingRef.current = true;
            setTriggerThinkingRender(true);
          }, 4000);
          break;
        case "thinking":
          if (!allowThinkingRef.current) {
            pendingThinkingEventRef.current = event;
            setShowTyping(true);
            break;
          }
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

  // Trigger queued thinking event when 4 seconds expire
  useEffect(() => {
    if (triggerThinkingRender && pendingThinkingEventRef.current) {
      handleSseEvent(pendingThinkingEventRef.current);
      pendingThinkingEventRef.current = null;
    }
  }, [triggerThinkingRender, handleSseEvent]);

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
    const section = errorType === "acr_limit_exceeded" ? "section=acrcloud" : "section=openrouter";
    router.push(`/generator/setup?${section}`);
  };

  return (
    <div className="min-h-screen text-on-surface flex flex-col relative overflow-hidden bg-[#0f0f0f]">
      {/* Mesh Gradient Background */}
      <div className="mesh-bg"></div>

      {/* Particle Container */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" id="particles">
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              left: `${p.startX}vw`,
              top: `${p.startY}vh`,
              background: p.color,
              boxShadow: `0 0 ${Math.random() * 10 + 5}px ${p.color}`,
              "--tx": `${p.tx}px`,
              "--ty": `${p.ty}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />

        <main className="flex-1 flex flex-col items-center px-4 py-10 max-w-2xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8 w-full"
          >
            <h1 className="font-display-lg text-display-lg text-gradient tracking-tighter mb-2">
              AI Processing
            </h1>
            {selectedFile && (
              <p className="font-technical-sm text-technical-sm text-on-surface-variant truncate max-w-xs mx-auto">
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
                className="glass-panel flex items-start gap-4 p-5 rounded-xl border border-outline-variant/30 backdrop-blur-md bg-surface-container/30 hover-glow"
              >
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px] text-primary animate-spin">sync</span>
                </div>
                <div className="flex-1">
                  <p className="font-body-md text-sm text-on-surface">
                    Waking up the server…{" "}
                    <span className="text-on-surface-variant/70 text-xs">(~30 seconds)</span>
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 bg-primary rounded-full"
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
                className="glass-panel flex items-start gap-4 p-5 rounded-xl border border-outline-variant/30 backdrop-blur-md bg-surface-container/30 hover-glow"
              >
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px] text-primary animate-pulse">settings_suggest</span>
                </div>
                <div className="flex-1">
                  <p className="font-body-md text-sm text-on-surface">
                    {analysisStatus}{" "}
                    <span className="text-on-surface-variant/70 text-xs">(using local RAM & CPU)</span>
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 bg-primary rounded-full"
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
                className="glass-panel flex items-start gap-4 p-5 rounded-xl border border-outline-variant/30 backdrop-blur-md bg-surface-container/30 hover-glow"
              >
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px] text-primary animate-bounce">upload</span>
                </div>
                <div className="flex-1">
                  <p className="font-body-md text-sm text-on-surface">
                    Uploading the analyzed file to the AI…{" "}
                    <span className="text-on-surface-variant/70 text-xs">(Please don&apos;t close this page)</span>
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 bg-primary rounded-full"
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

            <div className="mt-6 flex flex-col gap-3 w-full">
              <AnimatePresence mode="wait">
                {processingDone ? (
                  <motion.button
                    key="preview-btn"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    onClick={() => setShowPreviewWarning(true)}
                    className="btn-gradient w-full py-3.5 rounded-full text-surface-container-lowest font-bold flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(168,232,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition transform duration-200"
                  >
                    <span className="material-symbols-outlined text-[20px]">headphones</span>
                    <span>Preview Songs</span>
                  </motion.button>
                ) : null}
              </AnimatePresence>

              <button
                onClick={() => router.push("/generator/upload")}
                className="bg-[#0f0f0f]/80 border border-outline-variant hover:border-primary/50 hover-glow transition-all rounded-full py-3 w-full font-technical-sm text-technical-sm flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
                <span>Cancel &amp; Exit</span>
              </button>
            </div>
          </div>

          {/* Feel Free to Take a Break Info Card */}
          {!processingDone && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="glass-panel mt-8 p-6 border border-outline-variant/30 rounded-xl backdrop-blur-md text-center max-w-xl mx-auto flex flex-col items-center shadow-lg w-full"
            >
              <div className="relative w-48 h-32 mb-4 overflow-hidden rounded-xl border border-outline-variant/30">
                <Image
                  src="/take_a_break.png"
                  alt="Take a break illustration"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <h3 className="font-display-lg text-sm text-gradient mb-2 flex items-center gap-2 justify-center font-bold">
                ☕ Feel Free to Take a Break
              </h3>
              <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                Splitting and naming Tamil songs can take around <strong className="text-on-surface">5 to 10 minutes</strong>. 
                Since this task is linked to your account, you can bookmark this page or close the tab. 
                The backend will continue processing in the background, and you can see your completed jobs on the welcome page / preview history later.
              </p>
            </motion.div>
          )}
        </main>
      </div>

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
