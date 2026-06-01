"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
import { saveApiKeys, getKeysStatus } from "@/lib/api";

type TabId = "general" | "credentials" | "about" | "privacy";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<TabId>("general");

  // API Key inputs & status
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [acoustidKey, setAcoustidKey] = useState("");
  const [keysConfigured, setKeysConfigured] = useState(false);
  const [checkingKeys, setCheckingKeys] = useState(true);

  // Form feedback states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Shake animation states for inputs
  const [shakeOpenRouter, setShakeOpenRouter] = useState(false);
  const [shakeAcoustId, setShakeAcoustId] = useState(false);

  // Authentication Guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  // Load current API key status
  useEffect(() => {
    if (!user) return;
    
    const fetchStatus = async () => {
      setCheckingKeys(true);
      try {
        const res = await getKeysStatus();
        if (res.success && res.setupComplete) {
          setKeysConfigured(true);
          // Set placeholder values since keys are encrypted on Firestore
          setOpenrouterKey("sk-or-keep-existing-key-placeholder");
          setAcoustidKey("keep-existing-acoustid-key-placeholder");
        } else {
          setKeysConfigured(false);
        }
      } catch (err) {
        console.error("Failed to load keys status:", err);
      } finally {
        setCheckingKeys(false);
      }
    };
    
    fetchStatus();
  }, [user]);

  // Key Saving Handler
  const handleSaveKeys = async () => {
    setSaveError(null);
    setSaveSuccess(null);

    const cleanedOpenRouter = openrouterKey.trim();
    const cleanedAcoustId = acoustidKey.trim();

    // 1. Validation for OpenRouter key
    const isOpenRouterPlaceholder = cleanedOpenRouter === "sk-or-keep-existing-key-placeholder";
    const isOpenRouterValid = isOpenRouterPlaceholder || (cleanedOpenRouter.startsWith("sk-or") && cleanedOpenRouter.length >= 20);

    if (!isOpenRouterValid) {
      setSaveError("Invalid OpenRouter Key. It must start with 'sk-or' and be at least 20 characters.");
      setShakeOpenRouter(true);
      return;
    }

    // 2. Validation for AcoustID client key
    const isAcoustIdPlaceholder = cleanedAcoustId === "keep-existing-acoustid-key-placeholder";
    const isAcoustIdValid = isAcoustIdPlaceholder || (cleanedAcoustId.length >= 10);

    if (!isAcoustIdValid) {
      setSaveError("Invalid AcoustID Client Key. It must be at least 10 characters.");
      setShakeAcoustId(true);
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveApiKeys(cleanedOpenRouter, cleanedAcoustId);
      if (res.success) {
        setSaveSuccess("API Credentials saved successfully!");
        setKeysConfigured(true);
        // Refresh placeholders
        setOpenrouterKey("sk-or-keep-existing-key-placeholder");
        setAcoustidKey("keep-existing-acoustid-key-placeholder");
      } else {
        setSaveError(res.error || "Failed to save keys to the database.");
      }
    } catch {
      setSaveError("Network error. Could not connect to the backend server.");
    } finally {
      setIsSaving(false);
    }
  };

  // Render Spinner if authenticating
  if (authLoading || (!user && authLoading)) {
    return (
      <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] relative overflow-hidden flex flex-col mesh-bg">
      {/* Background Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-[var(--accent-cyan)] rounded-full opacity-[0.02]"
            style={{
              width: `${Math.random() * 8 + 4}px`,
              height: `${Math.random() * 8 + 4}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `floatParticle ${Math.random() * 20 + 20}s infinite linear`,
              animationDelay: `${Math.random() * -10}s`,
            }}
          />
        ))}
      </div>

      <style jsx global>{`
        .mesh-bg {
          background: radial-gradient(circle at 10% 20%, rgba(0, 212, 255, 0.04) 0%, transparent 40%),
                      radial-gradient(circle at 90% 80%, rgba(123, 94, 167, 0.04) 0%, transparent 40%),
                      #131313;
          background-size: 200% 200%;
        }

        @keyframes floatParticle {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-60px) translateX(30px);
          }
        }
      `}</style>

      {/* Navbar */}
      <Navbar />

      {/* Main Settings Card */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 z-10 flex flex-col">
        {/* Title Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.15)] flex items-center justify-center text-[var(--accent-cyan)] text-2xl shadow-inner">
            <span className="material-symbols-outlined select-none text-2xl">settings</span>
          </div>
          <div>
            <h1 className="font-heading text-3xl font-extrabold tracking-wide bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent">
              Settings
            </h1>
            <p className="font-body text-xs text-[var(--text-secondary)] mt-0.5">
              Customize preferences, configure third-party APIs, and view system info.
            </p>
          </div>
        </div>

        {/* Double Column Settings Container */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 flex-1">
          {/* Sidebar Tab Navigation */}
          <div className="md:col-span-1 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-3 md:pb-0 border-b md:border-b-0 md:border-r border-[var(--glass-border)] pr-0 md:pr-6 h-fit shrink-0">
            {[
              { id: "general", label: "Profile & General", icon: "person" },
              { id: "credentials", label: "API Credentials", icon: "vpn_key" },
              { id: "about", label: "About AudioWave", icon: "info" },
              { id: "privacy", label: "Privacy Policy", icon: "security" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabId);
                    setSaveError(null);
                    setSaveSuccess(null);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-body text-xs font-semibold whitespace-nowrap md:w-full border ${
                    isActive
                      ? "bg-[rgba(0,212,255,0.06)] border-[rgba(0,212,255,0.2)] text-[var(--accent-cyan)] shadow-[0_0_15px_rgba(0,212,255,0.1)]"
                      : "bg-transparent border-transparent text-[var(--text-secondary)] hover:text-[#e5e2e1] hover:bg-[rgba(255,255,255,0.02)]"
                  }`}
                >
                  <span className="material-symbols-outlined select-none text-base">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Settings Content Panels */}
          <div className="md:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-xl flex flex-col h-full min-h-[400px]"
              >
                {/* 1. General Tab */}
                {activeTab === "general" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-[#e5e2e1]">User Profile</h3>
                      <p className="font-body text-xs text-[var(--text-secondary)] mt-1">
                        Details of the authenticated user session.
                      </p>
                    </div>

                    <div className="flex items-center gap-4 bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)] rounded-xl p-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[var(--accent-cyan)] to-[var(--accent-violet)] flex items-center justify-center text-lg border border-white/20 shadow-md">
                        🤖
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-heading text-sm font-semibold text-[#e5e2e1] truncate">
                          {user.displayName || "Roboshi"}
                        </p>
                        <p className="font-body text-xs text-[var(--text-secondary)] truncate">
                          {user.email}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-[var(--success)] text-[10px] font-heading font-bold uppercase tracking-wider">
                        Active
                      </span>
                    </div>

                    <div className="border-t border-[var(--glass-border)] pt-6 space-y-4">
                      <div>
                        <h4 className="font-heading text-xs font-bold text-[#e5e2e1] mb-2">SYSTEM PREFERENCES</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 bg-[rgba(255,255,255,0.01)] border border-[var(--glass-border)] rounded-xl">
                            <p className="font-body text-xs text-[var(--text-secondary)]">Interface Theme</p>
                            <p className="font-heading text-sm font-semibold text-[var(--accent-cyan)] mt-1">Tech-Noir Dark</p>
                          </div>
                          <div className="p-4 bg-[rgba(255,255,255,0.01)] border border-[var(--glass-border)] rounded-xl">
                            <p className="font-body text-xs text-[var(--text-secondary)]">Audio Storage Limit</p>
                            <p className="font-heading text-sm font-semibold text-[#e5e2e1] mt-1">500MB Upload Size</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-[var(--glass-border)]">
                      <button
                        onClick={logout}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] hover:bg-[rgba(239,68,68,0.15)] text-[var(--error)] rounded-xl font-body text-xs font-semibold transition"
                      >
                        <span className="material-symbols-outlined select-none text-base">logout</span>
                        <span>Sign Out of Account</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. API Credentials Tab */}
                {activeTab === "credentials" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-[#e5e2e1]">API Configurations</h3>
                      <p className="font-body text-xs text-[var(--text-secondary)] mt-1">
                        Enter your private keys to authorize backend transcription, segmentation, and song title recognition.
                      </p>
                    </div>

                    {/* Status Banners */}
                    {checkingKeys ? (
                      <div className="flex items-center gap-2.5 p-3.5 bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)] rounded-xl text-xs text-[var(--text-secondary)]">
                        <div className="w-3.5 h-3.5 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
                        <span>Verifying current credential configurations...</span>
                      </div>
                    ) : keysConfigured ? (
                      <div className="flex items-center gap-2.5 p-3.5 bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.25)] rounded-xl text-xs text-[#22c55e] font-semibold">
                        <span className="material-symbols-outlined select-none text-base">check_circle</span>
                        <span>All API Credentials Active & Configured on DB</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 p-3.5 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.25)] rounded-xl text-xs text-[#f59e0b] font-semibold animate-pulse">
                        <span className="material-symbols-outlined select-none text-base">warning</span>
                        <span>API Keys Required to Run Splitter Pipeline</span>
                      </div>
                    )}

                    {/* Form Notifications */}
                    {saveSuccess && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3.5 bg-[rgba(34,197,94,0.1)] border border-[#22c55e] rounded-xl text-xs text-[#22c55e] flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined select-none text-base">task_alt</span>
                        <span>{saveSuccess}</span>
                      </motion.div>
                    )}

                    {saveError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3.5 bg-[rgba(239,68,68,0.1)] border border-[var(--error)] rounded-xl text-xs text-[var(--error)] flex items-start gap-2"
                      >
                        <span className="material-symbols-outlined select-none text-base">error</span>
                        <span className="font-body">{saveError}</span>
                      </motion.div>
                    )}

                    {/* Inputs */}
                    <div className="space-y-4">
                      {/* OpenRouter Key */}
                      <div>
                        <label className="block text-[10px] font-semibold font-body uppercase text-[var(--text-secondary)] tracking-wider mb-1.5">
                          OpenRouter API Key
                        </label>
                        <motion.div
                          animate={shakeOpenRouter ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                          transition={{ duration: 0.4 }}
                          onAnimationComplete={() => setShakeOpenRouter(false)}
                        >
                          <input
                            type="password"
                            placeholder="sk-or-v1-..."
                            value={openrouterKey}
                            onChange={(e) => setOpenrouterKey(e.target.value)}
                            onFocus={() => {
                              if (openrouterKey === "sk-or-keep-existing-key-placeholder") {
                                setOpenrouterKey("");
                              }
                            }}
                            onBlur={() => {
                              if (openrouterKey === "") {
                                setOpenrouterKey("sk-or-keep-existing-key-placeholder");
                              }
                            }}
                            className="w-full bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)] focus:border-[var(--accent-cyan)] focus:ring-[3px] focus:ring-[rgba(0,212,255,0.15)] focus:outline-none rounded-xl py-3 px-4 text-xs font-mono tracking-wider transition"
                          />
                        </motion.div>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-normal">
                          Starts with <code className="font-mono text-[#e5e2e1]">sk-or-v1-...</code>. Used to determine song boundaries utilizing structural LLMs.
                        </p>
                      </div>

                      {/* AcoustID Key */}
                      <div>
                        <label className="block text-[10px] font-semibold font-body uppercase text-[var(--text-secondary)] tracking-wider mb-1.5">
                          AcoustID Client Key
                        </label>
                        <motion.div
                          animate={shakeAcoustId ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                          transition={{ duration: 0.4 }}
                          onAnimationComplete={() => setShakeAcoustId(false)}
                        >
                          <input
                            type="password"
                            placeholder="Enter your AcoustID Client API Key"
                            value={acoustidKey}
                            onChange={(e) => setAcoustidKey(e.target.value)}
                            onFocus={() => {
                              if (acoustidKey === "keep-existing-acoustid-key-placeholder") {
                                setAcoustidKey("");
                              }
                            }}
                            onBlur={() => {
                              if (acoustidKey === "") {
                                setAcoustidKey("keep-existing-acoustid-key-placeholder");
                              }
                            }}
                            className="w-full bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)] focus:border-[var(--accent-cyan)] focus:ring-[3px] focus:ring-[rgba(0,212,255,0.15)] focus:outline-none rounded-xl py-3 px-4 text-xs font-mono tracking-wider transition"
                          />
                        </motion.div>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-normal">
                          Client API application key (10+ characters) used to check fingerprint signatures and recognize track titles.
                        </p>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[var(--glass-border)]">
                      {/* Interactive Tutorial Link */}
                      <button
                        onClick={() => router.push("/generator/setup")}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] hover:text-[#e5e2e1] rounded-xl text-xs font-semibold transition"
                      >
                        <span className="material-symbols-outlined select-none text-base">help</span>
                        <span>Open Step-by-Step Guided Setup</span>
                      </button>

                      <button
                        onClick={handleSaveKeys}
                        disabled={isSaving}
                        className="w-full sm:w-auto min-w-[150px] flex items-center justify-center gap-2 py-2.5 px-6 font-semibold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(0,212,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition transform duration-200 disabled:opacity-50 disabled:pointer-events-none text-xs"
                      >
                        {isSaving ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          "Save API Credentials"
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. About Us Tab */}
                {activeTab === "about" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-[#e5e2e1]">About AudioWave</h3>
                      <p className="font-body text-xs text-[var(--text-secondary)] mt-1">
                        High-performance audio processing engineered directly inside the web ecosystem.
                      </p>
                    </div>

                    <div className="space-y-4 font-body text-xs leading-relaxed text-[var(--text-secondary)]">
                      <p>
                        <strong>AudioWave</strong> is a premium, AI-integrated browser utility designed to give musicians, sound designers, and content creators precision audio separation and manipulation capabilities directly in-browser.
                      </p>

                      <div className="grid grid-cols-1 gap-3.5 mt-2">
                        <div className="p-4 bg-[rgba(255,255,255,0.01)] border border-[var(--glass-border)] rounded-xl flex gap-3">
                          <span className="material-symbols-outlined select-none text-[var(--accent-cyan)] text-xl mt-0.5">music_note</span>
                          <div>
                            <h4 className="font-bold text-[#e5e2e1] mb-1">AI Audio Splitter</h4>
                            <p className="text-[11px] leading-relaxed">
                              Upload files to separate music tracks into multi-track vocal, drum, bass, and instrumental stems using cloud inference deep learning.
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-[rgba(255,255,255,0.01)] border border-[var(--glass-border)] rounded-xl flex gap-3">
                          <span className="material-symbols-outlined select-none text-[var(--accent-cyan)] text-xl mt-0.5">edit</span>
                          <div>
                            <h4 className="font-bold text-[#e5e2e1] mb-1">Waveform Audio Editor</h4>
                            <p className="text-[11px] leading-relaxed">
                              Precise cursor-based cutting, timeline selections, non-adjacent stem merging, and batch WAV exports with real-time waveform updates.
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-[rgba(255,255,255,0.01)] border border-[var(--glass-border)] rounded-xl flex gap-3">
                          <span className="material-symbols-outlined select-none text-[var(--accent-cyan)] text-xl mt-0.5">offline_bolt</span>
                          <div>
                            <h4 className="font-bold text-[#e5e2e1] mb-1">Local Browser Processing</h4>
                            <p className="text-[11px] leading-relaxed">
                              Timeline operations and file slicing occur 100% locally in your client. File metadata, buffer decoding, and waveform generation require no server upload.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-[var(--glass-border)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span>Application Version: 2.0.0 (Tech-Noir Edition)</span>
                        <span>Powered by Next.js & Web Audio API</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Privacy Policy Tab */}
                {activeTab === "privacy" && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-[#e5e2e1]">Privacy Policy</h3>
                      <p className="font-body text-xs text-[var(--text-secondary)] mt-1">
                        How your audio data and private keys are processed, encrypted, and protected.
                      </p>
                    </div>

                    <div className="space-y-4 font-body text-xs leading-relaxed text-[var(--text-secondary)]">
                      <div>
                        <h4 className="font-bold text-[var(--accent-cyan)] flex items-center gap-1.5 mb-1.5">
                          <span className="material-symbols-outlined select-none text-base">folder</span>
                          <span>Local Audio Security</span>
                        </h4>
                        <p>
                          Files loaded inside the Standalone Audio Editor are parsed using the HTML5 Web Audio API. They are decoded and sliced **entirely on-device**. None of your audio waves leave your PC or travel across public networks.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-bold text-[var(--accent-cyan)] flex items-center gap-1.5 mb-1.5">
                          <span className="material-symbols-outlined select-none text-base">cloud_upload</span>
                          <span>AI Inference Separation Pipeline</span>
                        </h4>
                        <p>
                          When executing the AI mixtape splitter generator, source media is securely transmitted to our backend inference queue via SSL encryption. Your uploaded file and separated stems are processed inside a secured isolated workspace, and are **completely deleted** immediately after downloading or discarding them.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-bold text-[var(--accent-cyan)] flex items-center gap-1.5 mb-1.5">
                          <span className="material-symbols-outlined select-none text-base">key</span>
                          <span>API Key Encryption</span>
                        </h4>
                        <p>
                          API credentials saved under your account profile are encrypted in Firestore using **cryptography.fernet** key structures. They are only decrypted on the server side on-the-fly during active separation requests.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-bold text-[var(--accent-cyan)] flex items-center gap-1.5 mb-1.5">
                          <span className="material-symbols-outlined select-none text-base">cookie</span>
                          <span>No Tracking & Analytics</span>
                        </h4>
                        <p>
                          AudioWave values digital freedom. We do not incorporate ad tracking, marketing pixels, cross-site telemetry, or profile share vectors.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
