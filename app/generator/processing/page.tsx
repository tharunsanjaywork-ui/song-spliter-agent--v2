"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useGeneratorContext } from "@/context/GeneratorContext";
import { wakeupServer, streamProcess, ProcessingEvent, getJob } from "@/lib/api";
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
  const bodyText = customMessage || content.body;

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
        className="relative z-10 bg-surface-container-high border border-outline-variant rounded-2xl p-8 max-w-md w-full shadow-2xl backdrop-blur-xl"
      >
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
        <div className="w-12 h-12 rounded-xl bg-error-container/20 border border-error/30 flex items-center justify-center text-error mb-4">
          <span className="material-symbols-outlined text-[28px]">{errorType === "general" ? "error" : "warning"}</span>
        </div>
        <h3 className="font-display-lg text-[20px] font-bold text-on-surface mb-3">
          {content.title}
        </h3>
        <p className="font-body-md text-sm text-on-surface-variant leading-relaxed mb-6">
          {bodyText}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 font-body-md text-sm font-semibold border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 rounded-full transition"
          >
            Cancel
          </button>
          {showContinue && (
            <button
              onClick={onContinue}
              className="flex-1 py-3 font-body-md text-sm font-semibold bg-secondary-container hover:bg-[#5235e8] text-on-surface rounded-full border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
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
        className="relative z-10 bg-surface-container-high border border-outline-variant rounded-2xl p-8 max-w-md w-full shadow-2xl backdrop-blur-xl"
      >
        <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
          <span className="material-symbols-outlined text-[28px]">hearing</span>
        </div>
        <h3 className="font-display-lg text-[20px] font-bold text-on-surface mb-3">
          Review Before Downloading
        </h3>
        <p className="font-body-md text-sm text-on-surface-variant leading-relaxed mb-6">
          Please review all songs before continuing. The AI may have made incorrect cuts. Listen to
          each one, check the file names, and select only the files that are correct. The unselected
          files will be sent to the Audio Editor so you can fix them manually.
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-3 font-body-md text-sm font-semibold bg-secondary-container hover:bg-[#5235e8] text-on-surface rounded-full border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
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

  useEffect(() => {
    localStorage.setItem("active_route", "/generator/processing");
    localStorage.setItem("active_generator_route", "/generator/processing");
  }, []);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
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
  
  // Reload recovery state
  const [reconnectJobId, setReconnectJobId] = useState<string | null>(null);

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
        case "init":
          if (event.jobId) {
            setContextJobId(event.jobId);
            localStorage.setItem("active_split_job", event.jobId);
            localStorage.setItem("active_route", "/generator/processing");
            localStorage.setItem("active_generator_route", "/generator/processing");
          }
          break;
        case "analyzing":
          setIsWaking(false);
          addMessage({
            id: "analyzing",
            emoji: "🤖",
            text: "AI is currently checking your processed file to analyze and generate a report"
          });
          setTimeout(() => {
            allowThinkingRef.current = true;
            setTriggerThinkingRender(true);
          }, 4000);
          break;
        case "thinking":
          if (!allowThinkingRef.current) {
            pendingThinkingEventRef.current = event;
            break;
          }
          if (!thinkingAddedRef.current) {
            thinkingAddedRef.current = true;
            addMessage({ id: "thinking", emoji: "🧠", text: "Thinking..." });
          }
          setThinkingSeconds(event.elapsed ?? 0);
          break;
        case "saving":
          addMessage({ id: "saving", emoji: "💾", text: "Saving individual files..." });
          break;
        case "naming":
          addMessage({ id: "naming", emoji: "🏷️", text: "Naming your songs..." });
          break;
        case "complete":
          addMessage({ id: "complete", emoji: "✅", text: "Done! Your songs are ready." });
          if (event.jobId) setContextJobId(event.jobId);
          setProcessingDone(true);
          // Keep active_split_job persisted so that preview page reload works seamlessly!
          break;
        case "error":
          setIsWaking(false);
          setErrorType((event.error_type as ErrorType) ?? "general");
          setCustomErrorMsg(event.message ?? null);
          setShowErrorModal(true);
          localStorage.removeItem("active_split_job");
          localStorage.removeItem("active_route");
          localStorage.removeItem("active_generator_route");
          break;
      }
    },
    [addMessage, setContextJobId]
  );

  // Screen Wake Lock API to prevent phone screen from turning off during processing
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
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

  // Check if we are reconnecting to a background job on page load/reload
  useEffect(() => {
    const activeJob = localStorage.getItem("active_split_job");
    if (!selectedFile && activeJob) {
      setReconnectJobId(activeJob);
    }
  }, [selectedFile]);

  // Guard: redirect back to upload if no file is present and there is no active background job to reconnect to
  useEffect(() => {
    const activeJob = localStorage.getItem("active_split_job");
    if (!selectedFile && !activeJob) {
      router.push("/generator/upload");
    }
  }, [selectedFile, router]);

  // Background Job Recovery Polling Effect
  useEffect(() => {
    if (!reconnectJobId) return;

    let isSubscribed = true;
    const pollInterval = setInterval(async () => {
      try {
        const res = await getJob(reconnectJobId);
        if (!isSubscribed) return;
        if (res.success && res.data) {
          const status = res.data.status;
          if (status === "complete") {
            setContextJobId(reconnectJobId);
            router.push(`/generator/preview?jobId=${reconnectJobId}`);
            clearInterval(pollInterval);
          } else if (status === "failed") {
            const errType = (res.data.errorType as ErrorType) ?? "general";
            setErrorType(errType);
            setCustomErrorMsg(
              res.data.errorMessage || (errType === "general"
                ? "The background split job failed to complete on the server."
                : null)
            );
            setShowErrorModal(true);
            localStorage.removeItem("active_split_job");
            localStorage.removeItem("active_route");
            localStorage.removeItem("active_generator_route");
            clearInterval(pollInterval);
          }
        }
      } catch {
        // Ignore network errors during polling
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [reconnectJobId, router, setContextJobId]);

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
        setErrorType("general");
        setCustomErrorMsg(err instanceof Error ? err.message : "Something went wrong on the server.");
        setShowErrorModal(true);
        localStorage.removeItem("active_split_job");
        localStorage.removeItem("active_route");
      }
    };
    run();
  }, [selectedFile, handleSseEvent]);

  const handleErrorCancel = () => {
    setShowErrorModal(false);
    localStorage.removeItem("active_split_job");
    localStorage.removeItem("active_route");
    localStorage.removeItem("active_generator_route");
    router.push("/generator/upload");
  };

  const handleErrorContinue = () => {
    setShowErrorModal(false);
    localStorage.removeItem("active_split_job");
    localStorage.removeItem("active_route");
    localStorage.removeItem("active_generator_route");
    const section = errorType === "acr_limit_exceeded" ? "section=acrcloud" : "section=openrouter";
    router.push(`/generator/setup?${section}`);
  };

  // Derive current step and percentage
  const activeStepId = (() => {
    if (processingDone) return "complete";
    if (messages.some((m) => m.id === "complete")) return "complete";
    if (messages.some((m) => m.id === "naming")) return "naming";
    if (messages.some((m) => m.id === "saving")) return "saving";
    if (messages.some((m) => m.id === "thinking")) return "thinking";
    if (messages.some((m) => m.id === "analyzing")) return "analyzing";
    if (isUploading) return "uploading";
    if (analysisStatus) return "local_analyzing";
    if (reconnectJobId) return "reconnecting";
    if (isWaking) return "wakeup";
    return "idle";
  })();

  const percentage = (() => {
    switch (activeStepId) {
      case "wakeup": return 10;
      case "local_analyzing": return 25;
      case "uploading": return 40;
      case "reconnecting": return 50;
      case "analyzing": return 55;
      case "thinking": return 70;
      case "saving": return 85;
      case "naming": return 95;
      case "complete": return 100;
      default: return 0;
    }
  })();

  const getStepState = (stepIndex: number) => {
    const currentStepIndex = (() => {
      if (processingDone || activeStepId === "complete") return 5;
      if (activeStepId === "naming") return 4;
      if (activeStepId === "saving") return 3;
      if (activeStepId === "thinking") return 2;
      if (activeStepId === "reconnecting") return 2;
      if (activeStepId === "analyzing") return 1;
      if (["wakeup", "local_analyzing", "uploading"].includes(activeStepId)) return 0;
      return -1;
    })();

    if (currentStepIndex > stepIndex) return "done";
    if (currentStepIndex === stepIndex) return "active";
    return "pending";
  };

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col overflow-hidden">
      <Navbar />

      <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 relative z-10 pt-24 max-w-4xl mx-auto w-full">
        {/* Background glow orbs */}
        <div className="absolute inset-0 z-0 flex justify-center items-center opacity-20 pointer-events-none">
          <div className="w-[60vw] h-[60vw] rounded-full bg-secondary-container blur-[100px]" />
        </div>

        {/* Circular Progress Spinner */}
        <div className="relative w-48 h-48 flex items-center justify-center mb-8 z-10">
          <div className="absolute inset-0 rounded-full bg-gradient-spinner animate-spin-slow opacity-80" />
          <div className="absolute inset-2 rounded-full bg-surface-container-highest/90 backdrop-blur-md z-10 flex flex-col items-center justify-center">
            <span className="font-display-lg text-display-lg text-primary tracking-tight">
              {percentage}%
            </span>
            <span className="font-technical-xs text-[10px] text-secondary tracking-widest uppercase mt-1">
              Processing
            </span>
          </div>
        </div>

        {/* Step Pipeline Card */}
        <div className="w-full max-w-md bg-surface-container-low/80 backdrop-blur-xl rounded-xl border border-white/5 border-t-white/10 border-l-white/10 p-6 relative overflow-hidden z-10 shadow-2xl mb-6">
          {/* Internal lighting border */}
          <div className="absolute inset-0 border border-white/5 rounded-xl pointer-events-none" />

          <h2 className="font-headline-lg-mobile text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">data_object</span>
            AI Classifier Pipeline
          </h2>

          <div className="space-y-6">
            {/* Step 1: Wakeup & Local Analysis */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                {getStepState(0) === "done" && (
                  <div className="w-6 h-6 rounded-full bg-tertiary-container/20 border border-tertiary-container text-tertiary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                  </div>
                )}
                {getStepState(0) === "active" && (
                  <div className="w-6 h-6 rounded-full bg-secondary-container animate-pulse-glow text-on-secondary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  </div>
                )}
                {getStepState(0) === "pending" && (
                  <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant opacity-40 flex items-center justify-center font-technical-sm text-xs">
                    1
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <p className={`font-body-md text-sm font-semibold ${getStepState(0) === "pending" ? "text-on-surface-variant opacity-40" : "text-on-surface"}`}>
                  Wakeup & Local Analysis
                </p>
                {getStepState(0) === "active" && (
                  <>
                    <p className="font-technical-xs text-xs text-primary mt-0.5">
                      {activeStepId === "wakeup" && "Waking up the server…"}
                      {activeStepId === "local_analyzing" && (analysisStatus || "Analyzing audio fingerprints...")}
                      {activeStepId === "uploading" && "Uploading files..."}
                    </p>
                    <div className="w-full mt-2">
                      <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-secondary rounded-full w-2/3 animate-pulse" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Step 2: AI Analyzing */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                {getStepState(1) === "done" && (
                  <div className="w-6 h-6 rounded-full bg-tertiary-container/20 border border-tertiary-container text-tertiary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                  </div>
                )}
                {getStepState(1) === "active" && (
                  <div className="w-6 h-6 rounded-full bg-secondary-container animate-pulse-glow text-on-secondary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  </div>
                )}
                {getStepState(1) === "pending" && (
                  <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant opacity-40 flex items-center justify-center font-technical-sm text-xs">
                    2
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <p className={`font-body-md text-sm font-semibold ${getStepState(1) === "pending" ? "text-on-surface-variant opacity-40" : "text-on-surface"}`}>
                  AI Identifying & Searching
                </p>
                {getStepState(1) === "active" && (
                  <>
                    <p className="font-technical-xs text-xs text-primary mt-0.5">
                      Checking audio matches against databases...
                    </p>
                    <div className="w-full mt-2">
                      <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-secondary rounded-full w-1/2 animate-pulse" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Step 3: AI Thinking */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                {getStepState(2) === "done" && (
                  <div className="w-6 h-6 rounded-full bg-tertiary-container/20 border border-tertiary-container text-tertiary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                  </div>
                )}
                {getStepState(2) === "active" && (
                  <div className="w-6 h-6 rounded-full bg-secondary-container animate-pulse-glow text-on-secondary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  </div>
                )}
                {getStepState(2) === "pending" && (
                  <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant opacity-40 flex items-center justify-center font-technical-sm text-xs">
                    3
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <p className={`font-body-md text-sm font-semibold ${getStepState(2) === "pending" ? "text-on-surface-variant opacity-40" : "text-on-surface"}`}>
                  AI Thinking & Reconstructing
                </p>
                {getStepState(2) === "active" && (
                  <>
                    <p className="font-technical-xs text-xs text-primary mt-0.5">
                      {activeStepId === "reconnecting"
                        ? "Running split pipeline on backend..."
                        : `Calculating splits and song names (${thinkingSeconds}s elapsed)`}
                    </p>
                    <div className="w-full mt-2">
                      <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-secondary rounded-full w-[80%] animate-pulse" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Step 4: Saving Stems */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                {getStepState(3) === "done" && (
                  <div className="w-6 h-6 rounded-full bg-tertiary-container/20 border border-tertiary-container text-tertiary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                  </div>
                )}
                {getStepState(3) === "active" && (
                  <div className="w-6 h-6 rounded-full bg-secondary-container animate-pulse-glow text-on-secondary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  </div>
                )}
                {getStepState(3) === "pending" && (
                  <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant opacity-40 flex items-center justify-center font-technical-sm text-xs">
                    4
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <p className={`font-body-md text-sm font-semibold ${getStepState(3) === "pending" ? "text-on-surface-variant opacity-40" : "text-on-surface"}`}>
                  Saving Individual Stems
                </p>
                {getStepState(3) === "active" && (
                  <>
                    <p className="font-technical-xs text-xs text-primary mt-0.5">
                      Slicing audio and storing segments...
                    </p>
                    <div className="w-full mt-2">
                      <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-secondary rounded-full w-2/3 animate-pulse" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Step 5: Naming Songs */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                {getStepState(4) === "done" && (
                  <div className="w-6 h-6 rounded-full bg-tertiary-container/20 border border-tertiary-container text-tertiary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                  </div>
                )}
                {getStepState(4) === "active" && (
                  <div className="w-6 h-6 rounded-full bg-secondary-container animate-pulse-glow text-on-secondary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  </div>
                )}
                {getStepState(4) === "pending" && (
                  <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant opacity-40 flex items-center justify-center font-technical-sm text-xs">
                    5
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <p className={`font-body-md text-sm font-semibold ${getStepState(4) === "pending" ? "text-on-surface-variant opacity-40" : "text-on-surface"}`}>
                  Naming Songs & ID3 Tagging
                </p>
                {getStepState(4) === "active" && (
                  <>
                    <p className="font-technical-xs text-xs text-primary mt-0.5">
                      Resolving title names and writing metadata...
                    </p>
                    <div className="w-full mt-2">
                      <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-secondary rounded-full w-[90%] animate-pulse" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Step 6: Complete */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                {getStepState(5) === "done" ? (
                  <div className="w-6 h-6 rounded-full bg-tertiary-container/20 border border-tertiary-container text-tertiary-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface-variant opacity-40 flex items-center justify-center font-technical-sm text-xs">
                    6
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <p className={`font-body-md text-sm font-semibold ${getStepState(5) !== "done" ? "text-on-surface-variant opacity-40" : "text-on-surface"}`}>
                  Pipeline Complete
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Buttons Section */}
        <div className="w-full max-w-md flex flex-col gap-3 z-10 relative">
          <AnimatePresence mode="wait">
            {processingDone && (
              <motion.button
                key="preview-btn"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                onClick={() => setShowPreviewWarning(true)}
                className="w-full py-4 rounded-full bg-secondary-container hover:bg-[#5235e8] text-on-surface font-headline-lg-mobile text-[16px] font-semibold ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] flex items-center justify-center gap-3 transition transform duration-200"
              >
                <span className="material-symbols-outlined text-[22px]">queue_music</span>
                <span>Preview Songs</span>
              </motion.button>
            )}
          </AnimatePresence>

          <button
            onClick={() => router.push("/generator/upload")}
            className="w-full py-3 rounded-full bg-surface-container-highest/50 hover:bg-surface-container-highest/80 backdrop-blur-md border border-white/5 text-error font-body-md flex items-center justify-center gap-2 transition duration-200 max-w-xs mx-auto"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
            Cancel & Exit
          </button>
        </div>

        {/* Feel Free to Take a Break Info Card */}
        {!processingDone && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-8 p-6 bg-surface-container/40 border border-outline-variant rounded-2xl backdrop-blur-md text-center max-w-xl mx-auto flex flex-col items-center shadow-lg w-full relative z-10"
          >
            <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none" />
            <div className="relative w-48 h-32 mb-4 overflow-hidden rounded-xl">
              <Image
                src="/take_a_break.png"
                alt="Take a break illustration"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <h3 className="font-display-lg text-base font-bold text-primary mb-2 flex items-center gap-2 justify-center">
              <span className="material-symbols-outlined text-[20px]">coffee</span>
              Feel Free to Take a Break
            </h3>
            <p className="font-body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Splitting and naming Tamil songs can take around <strong className="text-on-surface font-semibold">5 to 10 minutes</strong>. 
              Since this task is linked to your account, you can bookmark this page or close the tab. 
              The backend will continue processing in the background, and you can see your completed jobs on the welcome page / preview history later.
            </p>
          </motion.div>
        )}
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
