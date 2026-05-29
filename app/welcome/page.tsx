"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export default function WelcomePage() {
  const router = useRouter();
  const { user } = useAuth();
  
  // States
  const [showPopup, setShowPopup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
