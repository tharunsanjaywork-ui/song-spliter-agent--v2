"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { getJob } from "@/lib/api";

const features = [
  {
    id: "waveform",
    title: "Zero-Latency Waveform Editor",
    description: "Slice, trim, and combine tracks directly inside your browser. By utilizing the Web Audio API and local processing, your audio never uploads to any server—providing absolute data privacy and instant feedback.",
    icon: (
      <svg className="w-6 h-6 text-[var(--accent-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
    badge: "Browser Native",
    color: "rgba(0, 212, 255, 0.15)",
    borderColor: "var(--accent-cyan)"
  },
  {
    id: "ai-split",
    title: "AI Boundary Detection",
    description: "Upload an hour-long mixtape or YouTube audio. The intelligence system reads the video metadata, description, comments, and tracklists, then runs an LLM-guided pipeline using DeepSeek to locate exact timestamps and transition coordinates.",
    icon: (
      <svg className="w-6 h-6 text-[var(--accent-violet)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.364l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    badge: "AI Powered",
    color: "rgba(123, 94, 167, 0.15)",
    borderColor: "var(--accent-violet)"
  },
  {
    id: "recognition",
    title: "Acoustic Fingerprinting",
    description: "Never worry about track names again. AudioWave automatically computes acoustic fingerprints for each split segment and matches them against ACRCloud's international database of 100+ million tracks to fetch official artists and song names.",
    icon: (
      <svg className="w-6 h-6 text-[var(--accent-orange)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
      </svg>
    ),
    badge: "ACRCloud Integration",
    color: "rgba(255, 107, 53, 0.15)",
    borderColor: "var(--accent-orange)"
  },
  {
    id: "export",
    title: "Smart Packaging & Download",
    description: "Export your mixtape in bulk. Review, rename, adjust, and tag tracks in our custom correction screen. Once you're ready, download them bundled in a standard high-quality ZIP file or access them via cloud storage backups.",
    icon: (
      <svg className="w-6 h-6 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    badge: "Batch Export",
    color: "rgba(34, 197, 94, 0.15)",
    borderColor: "var(--success)"
  }
];

export default function WelcomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // States
  const [showPopup, setShowPopup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState("waveform");
  
  // Recovery states
  const [recoveryToast, setRecoveryToast] = useState<string | null>(null);

  // Background recovery & route persistence restore on mount
  useEffect(() => {
    if (authLoading || !user) return;

    const restoreState = async () => {
      // 1. Check for background AI splitting jobs
      const activeJobId = localStorage.getItem("active_split_job");
      if (activeJobId) {
        setRecoveryToast("Checking active background split job...");
        try {
          const res = await getJob(activeJobId);
          if (res.success && res.data) {
            const status = res.data.status;
            if (status === "complete") {
              setRecoveryToast("AI Split Job complete! Opening preview...");
              setTimeout(() => {
                router.push(`/generator/preview?jobId=${activeJobId}`);
              }, 1500);
              return;
            } else if (status === "processing") {
              setRecoveryToast("AI Split Job still processing. Opening progress screen...");
              setTimeout(() => {
                router.push(`/generator/processing?jobId=${activeJobId}`);
              }, 1500);
              return;
            }
          }
          // If not processing/complete, clear it
          localStorage.removeItem("active_split_job");
          setRecoveryToast(null);
        } catch {
          localStorage.removeItem("active_split_job");
          setRecoveryToast(null);
        }
      }

      // 2. If no active split job, check for persistent route restore
      const activeRoute = localStorage.getItem("active_route");
      if (activeRoute && activeRoute !== "/welcome") {
        setRecoveryToast(`Restoring your active session: ${activeRoute}...`);
        setTimeout(() => {
          router.push(activeRoute);
        }, 1200);
      }
    };

    restoreState();
  }, [user, authLoading, router]);

  // Staggered hero text words
  const titleWords = "Welcome to AudioWave".split(" ");

  // Handle click on YouTube Generator Card
  const handleGeneratorClick = async () => {
    if (!user) return;
    setCheckingSetup(true);
    setError(null);
    try {
      // Client-side Firestore check — no backend cold start needed
      const userDocRef = doc(getFirebaseDb(), "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const setupComplete = userDocSnap.exists() ? userDocSnap.data()?.setupComplete : false;
      
      if (setupComplete) {
        // Redirect directly to upload page
        router.push("/generator/upload");
      } else {
        // First-time user: reveal the setup guide popup modal
        setShowPopup(true);
      }
    } catch (err) {
      console.error("Failed to check setup status:", err);
      setError("Failed to verify credentials setup. Please try again.");
    } finally {
      setCheckingSetup(false);
    }
  };

  const renderMockup = () => {
    switch (activeFeature) {
      case "waveform":
        return (
          <div className="relative w-full h-64 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl flex flex-col items-center justify-center overflow-hidden p-6 glass-edge">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.08),transparent_70%)]" />
            <div className="w-full flex items-center justify-between mb-4 z-10">
              <span className="text-xs font-mono text-[var(--accent-cyan)]">standalone_editor.wav</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                <span className="text-[10px] text-[var(--text-secondary)] font-mono">READY</span>
              </div>
            </div>
            {/* Waveform bars */}
            <div className="w-full h-24 flex items-end justify-center gap-1 mb-4 z-10 px-2">
              {Array.from({ length: 32 }).map((_, i) => {
                const h = Math.abs(Math.sin(i * 0.2)) * 100;
                return (
                  <motion.div
                    key={i}
                    initial={{ height: "4px" }}
                    animate={{ height: `${Math.max(4, h)}%` }}
                    transition={{
                      repeat: Infinity,
                      repeatType: "reverse",
                      duration: 0.8 + Math.random() * 0.4,
                      delay: i * 0.03
                    }}
                    className={`w-full max-w-[6px] rounded-full ${i % 2 === 0 ? 'bg-[var(--accent-cyan)]' : 'bg-[rgba(0,212,255,0.3)]'}`}
                  />
                );
              })}
            </div>
            {/* Zoom controls */}
            <div className="flex gap-4 z-10">
              <div className="px-3 py-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg text-[10px] font-semibold text-[var(--text-secondary)]">
                ZOOM IN
              </div>
              <div className="px-3 py-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-lg text-[10px] font-semibold text-[var(--text-secondary)]">
                PLAY/PAUSE
              </div>
            </div>
          </div>
        );
      case "ai-split":
        return (
          <div className="relative w-full h-64 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl flex flex-col justify-center overflow-hidden p-6 glass-edge">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(123,94,167,0.08),transparent_70%)]" />
            <div className="w-full flex items-center justify-between mb-4 z-10">
              <span className="text-xs font-mono text-[var(--accent-violet)]">ai_boundary_engine</span>
              <span className="text-[10px] text-[var(--accent-violet)] font-mono">STEP 02/04</span>
            </div>
            <div className="space-y-3 z-10">
              {[
                { label: "Parse Description Timestamps", status: "complete" },
                { label: "Analyze Mixture Spectrogram", status: "processing" },
                { label: "Detect Track Transitions", status: "pending" }
              ].map((step, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] rounded-xl">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{step.label}</span>
                  <div className="flex items-center gap-2">
                    {step.status === "complete" && (
                      <span className="text-[10px] text-[var(--success)] font-semibold flex items-center gap-1">
                        <span>✓</span> COMPLETE
                      </span>
                    )}
                    {step.status === "processing" && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-2 border-[var(--accent-violet)] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] text-[var(--accent-violet)] font-semibold">PROCESSING</span>
                      </div>
                    )}
                    {step.status === "pending" && (
                      <span className="text-[10px] text-[var(--text-muted)] font-semibold">QUEUED</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case "recognition":
        return (
          <div className="relative w-full h-64 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl flex flex-col items-center justify-center overflow-hidden p-6 glass-edge">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,107,53,0.08),transparent_70%)]" />
            
            <div className="flex items-center gap-6 z-10 w-full">
              {/* Spinning CD */}
              <div className="relative w-28 h-28 rounded-full border border-dashed border-[var(--accent-orange)] flex items-center justify-center shrink-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                  className="w-24 h-24 rounded-full bg-gradient-to-tr from-[rgba(255,107,53,0.2)] to-[rgba(0,0,0,0.8)] border border-[rgba(255,107,53,0.3)] flex items-center justify-center shadow-2xl relative"
                >
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-deep)] border border-[rgba(255,107,53,0.4)] flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-orange)]" />
                  </div>
                </motion.div>
              </div>

              {/* Info popups */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="text-[10px] font-mono text-[var(--accent-orange)] uppercase tracking-widest">ACR MATCH FOUND</div>
                <h4 className="text-sm font-heading font-bold text-[var(--text-primary)] truncate">Get Lucky (feat. Pharrell)</h4>
                <p className="text-xs text-[var(--text-secondary)] truncate">Daft Punk</p>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(34,197,94,0.1)] text-[10px] font-semibold text-[var(--success)]">
                  <span>99% MATCH</span>
                </div>
              </div>
            </div>
          </div>
        );
      case "export":
        return (
          <div className="relative w-full h-64 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl flex flex-col items-center justify-center overflow-hidden p-6 glass-edge">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.08),transparent_70%)]" />
            
            <div className="z-10 flex flex-col items-center text-center max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-[rgba(34,197,94,0.1)] flex items-center justify-center border border-[rgba(34,197,94,0.25)] text-[var(--success)] mb-4 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              
              <h4 className="text-sm font-heading font-bold text-[var(--text-primary)] mb-1">Packaging Mixtape</h4>
              <p className="text-xs text-[var(--text-secondary)] mb-4">Bundling 14 tracks into audiowave_export.zip</p>
              
              {/* Progress bar */}
              <div className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] rounded-full h-2.5 overflow-hidden">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{
                    repeat: Infinity,
                    duration: 3,
                    ease: "easeInOut"
                  }}
                  className="bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--success)] h-full"
                />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] relative overflow-hidden flex flex-col mesh-bg">
      {/* 20-30 Floating background particles as specified in PRD & UI_UX.md */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-[var(--accent-cyan)] rounded-full opacity-[0.03]"
            style={{
              width: `${Math.random() * 10 + 4}px`,
              height: `${Math.random() * 10 + 4}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `float ${Math.random() * 25 + 20}s infinite linear`,
              animationDelay: `${Math.random() * -12}s`,
            }}
          />
        ))}
      </div>

      <style jsx global>{`
        .mesh-bg {
          background: radial-gradient(circle at 20% 30%, rgba(0, 212, 255, 0.05) 0%, transparent 50%),
                      radial-gradient(circle at 80% 70%, rgba(123, 94, 167, 0.05) 0%, transparent 50%),
                      var(--bg-deep);
          background-size: 200% 200%;
          animation: meshShift 25s ease infinite;
        }

        @keyframes meshShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        @keyframes float {
          0% {
            transform: translateY(0) translateX(0) scale(1);
          }
          50% {
            transform: translateY(-100px) translateX(50px) scale(1.15);
          }
          100% {
            transform: translateY(0) translateX(0) scale(1);
          }
        }

        @keyframes cardFloat {
          0%, 100% {
            transform: translateY(4px);
          }
          50% {
            transform: translateY(-4px);
          }
        }
      `}</style>

      {/* Top Navbar */}
      <Navbar />

      {/* Main Hero & Cards Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-6xl mx-auto w-full z-10">
        
        {/* Animated Hero Typography Section */}
        <div className="text-center mb-16">
          <h1 className="font-heading text-5xl sm:text-6xl font-extrabold tracking-wide mb-4 select-none flex flex-wrap justify-center gap-x-3 gap-y-1">
            {titleWords.map((word, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.6,
                  delay: i * 0.06,
                  ease: [0.2, 0.65, 0.3, 0.9],
                }}
                className="bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent"
              >
                {word}
              </motion.span>
            ))}
          </h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="font-body text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto"
          >
            Futuristic audio toolkit. Slice, edit, and package your tracks entirely in the browser, or harness AI to split mixtapes in seconds.
          </motion.p>
        </div>

        {/* Dynamic Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full max-w-md mb-8 p-3.5 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] text-[var(--error)] text-xs rounded-xl flex items-center justify-between gap-2 mx-auto"
            >
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="font-body">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-2">
          
          {/* Card 1: Audio Editor Wrapper (Continuous Float) */}
          <div
            style={{
              animation: "cardFloat 4s ease-in-out infinite",
              animationDelay: "0s",
            }}
            className="h-full"
          >
            {/* Card Content (Entry Fade-in and Hover Scale) */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.04 }}
              transition={{
                type: "spring",
                stiffness: 100,
                damping: 15,
                delay: 0.4,
              }}
              className="group cursor-pointer bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-8 backdrop-blur-[20px] relative overflow-hidden transition-all duration-300 hover:border-[var(--accent-cyan)] hover:shadow-[0_0_30px_rgba(0,212,255,0.15)] flex flex-col justify-between h-full"
              onClick={() => router.push("/editor")}
            >
              {/* Ambient Background Accent Glow */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,212,255,0.06),transparent_60%)] pointer-events-none" />

              <div>
                {/* Card Icon Header with 3D Rotate Effect on Card Hover */}
                <div className="w-14 h-14 rounded-xl bg-[rgba(0,212,255,0.1)] flex items-center justify-center border border-[rgba(0,212,255,0.25)] text-[var(--accent-cyan)] mb-6 transition-transform duration-300 group-hover:rotate-[5deg] group-hover:scale-110 shadow-[0_0_15px_rgba(0,212,255,0.15)]">
                  {/* Waveform Equalizer SVG Icon */}
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>

                <h2 className="font-heading text-2xl font-bold tracking-wide text-[var(--text-primary)] mb-3 select-none">
                  Audio Editor
                </h2>
                <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                  Cut, merge, and slice tracks instantly in your browser. Handles files locally using the Web Audio API with zero latency and absolute offline privacy.
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-cyan)] font-body group-hover:underline">
                <span>Open Standalone Editor</span>
                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </motion.div>
          </div>

          {/* Card 2: YouTube MP3 Generator Wrapper (Continuous Float offset by 2s) */}
          <div
            style={{
              animation: "cardFloat 4s ease-in-out infinite",
              animationDelay: "2s",
            }}
            className="h-full"
          >
            {/* Card Content (Entry Fade-in and Hover Scale) */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.04 }}
              transition={{
                type: "spring",
                stiffness: 100,
                damping: 15,
                delay: 0.5,
              }}
              className="group cursor-pointer bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-8 backdrop-blur-[20px] relative overflow-hidden transition-all duration-300 hover:border-[var(--accent-violet)] hover:shadow-[0_0_30px_rgba(123,94,167,0.15)] flex flex-col justify-between h-full"
              onClick={handleGeneratorClick}
            >
              {/* Ambient Background Accent Glow */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(123,94,167,0.06),transparent_60%)] pointer-events-none" />

              <div>
                {/* Card Icon Header with 3D Rotate Effect on Card Hover */}
                <div className="w-14 h-14 rounded-xl bg-[rgba(123,94,167,0.1)] flex items-center justify-center border border-[rgba(123,94,167,0.25)] text-[var(--accent-violet)] mb-6 transition-transform duration-300 group-hover:rotate-[5deg] group-hover:scale-110 shadow-[0_0_15px_rgba(123,94,167,0.15)]">
                  {/* AI Chip CPU SVG Icon */}
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2zM9 9h6v6H9V9z" />
                  </svg>
                </div>

                <h2 className="font-heading text-2xl font-bold tracking-wide text-[var(--text-primary)] mb-3 select-none">
                  YouTube MP3 Generator
                </h2>
                <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                  Split hour-long YouTube mixtape MP3s into individual tracks. Harness AI to detect song boundaries, identify song names via ACRCloud recognition, and package them into named files automatically.
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-violet)] font-body group-hover:underline">
                {checkingSetup ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[var(--accent-violet)] border-t-transparent rounded-full animate-spin"></div>
                    <span>Checking status...</span>
                  </div>
                ) : (
                  <>
                    <span>Launch Splitter Generator</span>
                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </div>
            </motion.div>
          </div>

        </div>
      </main>

      {/* Scroll-Reactive About / Capabilities Section */}
      <section className="w-full py-24 px-4 bg-[rgba(13,20,33,0.3)] border-t border-[var(--glass-border)] z-10 relative backdrop-blur-[5px]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-wide mb-4">
              What Can <span className="bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent">AudioWave</span> Perform?
            </h2>
            <p className="font-body text-sm text-[var(--text-secondary)] max-w-xl mx-auto">
              Explore the advanced browser-native capabilities and AI integrations that power our audio processing toolkit.
            </p>
          </div>

          {/* Split screen content */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start relative">
            {/* Left Column: Sticky Mockup Screen */}
            <div className="lg:col-span-5 lg:sticky lg:top-24 hidden lg:block">
              <div className="p-1 rounded-2xl bg-gradient-to-r from-[rgba(0,212,255,0.15)] to-[rgba(123,94,167,0.15)] border border-[rgba(255,255,255,0.05)] shadow-2xl">
                {renderMockup()}
              </div>
              <p className="text-center text-[11px] text-[var(--text-muted)] mt-4 font-mono">
                INTERACTIVE DEMO SCREEN • UPDATES ON SCROLL
              </p>
            </div>

            {/* Right Column: Scrollable cards */}
            <div className="lg:col-span-7 space-y-12">
              {features.map((feature, idx) => (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  onViewportEnter={() => setActiveFeature(feature.id)}
                  transition={{ duration: 0.5, delay: idx * 0.05 }}
                  className={`p-8 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.02)] relative overflow-hidden group`}
                >
                  {/* Hover overlay border */}
                  <div
                    className="absolute inset-0 border border-transparent group-hover:border-[var(--glass-border)] rounded-2xl pointer-events-none transition-all duration-300"
                    style={{
                      borderColor: activeFeature === feature.id ? feature.borderColor : 'transparent'
                    }}
                  />
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center animate-pulse-border"
                        style={{ backgroundColor: feature.color }}
                      >
                        {feature.icon}
                      </div>
                      <h3 className="font-heading text-lg sm:text-xl font-bold text-[var(--text-primary)]">
                        {feature.title}
                      </h3>
                    </div>
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]"
                      style={{
                        color: activeFeature === feature.id ? feature.borderColor : 'var(--text-secondary)'
                      }}
                    >
                      {feature.badge}
                    </span>
                  </div>

                  <p className="font-body text-sm text-[var(--text-secondary)] leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Mobile mockup viewable directly within card */}
                  <div className="lg:hidden mt-6 rounded-xl border border-[var(--glass-border)] overflow-hidden">
                    {activeFeature === feature.id && renderMockup()}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Floating Modal Setup Guide Popup Modal */}
      <AnimatePresence>
        {showPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Frosted overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPopup(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Card content with Spring scaling */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl p-8 max-w-md w-full relative z-10 shadow-2xl"
            >
              <h3 className="font-heading text-2xl font-bold mb-4 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)]">
                One-Time API Setup Required
              </h3>
              
              <div className="space-y-4 font-body text-sm text-[var(--text-secondary)] mb-8 leading-relaxed">
                <p>
                  AudioWave is **free and open source**. To run the AI Mixtape Splitter, you will need two free API keys:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li><strong className="text-[var(--text-primary)]">OpenRouter API Key:</strong> To identify track boundaries using DeepSeek V4.</li>
                  <li><strong className="text-[var(--text-primary)]">ACRCloud Credentials:</strong> To query international song metadata and recognize track names by audio signature.</li>
                </ul>
                <p className="text-xs">
                  This setup takes about 10 minutes. We will provide detailed screenshots guiding you through every single step.
                </p>
              </div>

              <div className="flex justify-end gap-3 font-body">
                <button
                  onClick={() => setShowPopup(false)}
                  className="px-4 py-2 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPopup(false);
                    router.push("/generator/setup");
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] hover:shadow-[0_0_15px_rgba(0,212,255,0.25)] rounded-lg text-xs font-semibold text-white transition transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recovery Redirect Toast */}
      <AnimatePresence>
        {recoveryToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 p-4 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-2xl shadow-2xl flex items-center gap-3 max-w-sm backdrop-blur-xl"
          >
            <div className="w-8 h-8 rounded-full bg-[rgba(0,212,255,0.08)] flex items-center justify-center text-[var(--accent-cyan)] shrink-0">
              <div className="w-4 h-4 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading text-xs font-bold text-[var(--text-primary)]">Restoring Session</p>
              <p className="font-body text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">{recoveryToast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
