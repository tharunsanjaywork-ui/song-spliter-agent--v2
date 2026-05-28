"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { saveApiKeys } from "@/lib/api";
import Navbar from "@/components/Navbar";

function GeneratorSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");

  // Active section state: openrouter or acrcloud
  const [section, setSection] = useState<"openrouter" | "acrcloud" | null>(null);

  // Read query params and scroll to section on mount
  useEffect(() => {
    if (sectionParam === "acr" || sectionParam === "acrcloud") {
      setSection("acrcloud");
      setTimeout(() => {
        sectionTopRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      setSection("openrouter");
    }
  }, [sectionParam]);

  // Input states
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [acrHost, setAcrHost] = useState("");
  const [acrAccessKey, setAcrAccessKey] = useState("");
  const [acrSecretKey, setAcrSecretKey] = useState("");

  // Validation/UI states
  const [errorMsg, setErrorMsg] = useState("");
  const [shakeOpenRouter, setShakeOpenRouter] = useState(false);
  const [shakeAcr, setShakeAcr] = useState(false);
  const [loading, setLoading] = useState(false);

  // Scroll tracking states
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(1);

  // Lightbox image state for full-screen viewing
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

  // Refs for scrolling
  const sectionTopRef = useRef<HTMLDivElement>(null);

  // Reset scroll progress when switching sections
  useEffect(() => {
    if (section) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setScrollProgress(0);
      setActiveStep(1);
      setErrorMsg("");
    }
  }, [section]);

  // Track page scroll progress and active step in viewport
  useEffect(() => {
    const handleScroll = () => {
      // 1. Calculate overall scroll percentage of the page
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const progress = (window.scrollY / totalHeight) * 100;
        setScrollProgress(progress);
      }

      // 2. Detect which step card is currently in view
      const stepElements = document.querySelectorAll("[data-step]");
      let currentStep = 1;
      stepElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        // If the top of the step card is in the top 60% of the screen, mark it active
        if (rect.top < window.innerHeight * 0.6) {
          const stepNum = parseInt(el.getAttribute("data-step") || "1", 10);
          currentStep = Math.max(currentStep, stepNum);
        }
      });
      setActiveStep(currentStep);
    };

    window.addEventListener("scroll", handleScroll);
    // Trigger on mount
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [section]);

  // Handlers for step switching/completing
  const handleNextSection = () => {
    const cleanedKey = openrouterKey.trim();
    const isValid = cleanedKey.startsWith("sk-or") && cleanedKey.length >= 20;

    if (!isValid) {
      setErrorMsg(
        "This key doesn't look right. Please copy it again from OpenRouter and try again."
      );
      setShakeOpenRouter(true);
      return;
    }

    setErrorMsg("");
    setSection("acrcloud");
  };

  const handleCompleteSetup = async () => {
    const cleanedHost = acrHost.trim();
    const cleanedAccess = acrAccessKey.trim();
    const cleanedSecret = acrSecretKey.trim();

    const isHostValid = cleanedHost.includes(".acrcloud.com") && cleanedHost.length >= 10;
    const isAccessValid = cleanedAccess.length >= 10;
    const isSecretValid = cleanedSecret.length >= 10;

    if (!isHostValid || !isAccessValid || !isSecretValid) {
      setErrorMsg(
        "This key doesn't look right. Please copy it again from ACRCloud and try again."
      );
      setShakeAcr(true);
      return;
    }

    setErrorMsg("");
    setLoading(true);

    const result = await saveApiKeys(
      openrouterKey.trim(),
      cleanedHost,
      cleanedAccess,
      cleanedSecret
    );

    if (result.success) {
      router.push("/generator/upload");
    } else {
      setErrorMsg(result.error || "Failed to save API credentials. Please try again.");
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (section === "acrcloud") {
      setSection("openrouter");
    } else {
      router.push("/welcome");
    }
  };

  // Steps configurations
  const openrouterSteps = [
    {
      id: 1,
      title: "Open OpenRouter Settings",
      desc: (
        <span>
          Click this link to open the OpenRouter keys page:{" "}
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-cyan)] underline hover:text-cyan-300 font-semibold"
          >
            https://openrouter.ai/settings/keys
          </a>
        </span>
      ),
      image: "openrouter_step1.png",
    },
    {
      id: 2,
      title: "Agree to Terms and Conditions",
      desc: "If prompted, read and agree to OpenRouter's terms and conditions to activate your account.",
      image: null,
    },
    {
      id: 3,
      title: "Create a New API Key",
      desc: 'Click on the "New Key" button located at the top right corner of the keys panel.',
      image: "openrouter_step3.png",
    },
    {
      id: 4,
      title: "Name Your Key",
      desc: 'Give your API key a recognizable name (e.g., "AudioWave-Splitter") and click "Generate".',
      image: "openrouter_step4.png",
    },
    {
      id: 5,
      title: "Copy the Key",
      desc: 'Click the "Copy" button inside the key generated modal. Save this key somewhere safe as you cannot view it again.',
      image: "openrouter_step5.png",
    },
    {
      id: 6,
      title: "Close Dialog",
      desc: "Close the OpenRouter modal and return to this page.",
      image: null,
    },
    {
      id: 7,
      title: "Paste Your API Key Below",
      desc: "Paste your generated API key into the input field below to complete the OpenRouter step.",
      image: null,
    },
  ];

  const acrcloudSteps = [
    {
      id: 1,
      title: "Open ACRCloud Console",
      desc: (
        <span>
          Click this link to open the ACRCloud console:{" "}
          <a
            href="https://console.acrcloud.com/signup#/register"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-cyan)] underline hover:text-cyan-300 font-semibold"
          >
            https://console.acrcloud.com/signup#/register
          </a>{" "}
          and sign in or create an account.
        </span>
      ),
      image: "acr_step1.png",
    },
    {
      id: 2,
      title: "Login / Register",
      desc: "Sign in with your preferred option (e.g., Google or Email) to access the console.",
      image: "acr_step2.png",
    },
    {
      id: 3,
      title: "Submit Profile Details",
      desc: "Provide the requested configuration details and click Submit to complete account registration.",
      image: "acr_step3.png",
    },
    {
      id: 4,
      title: "Select Audio & Video Recognition",
      desc: "Choose the first option 'Audio and Video Recognition' to access music signature search services.",
      image: "acr_step4.png",
    },
    {
      id: 5,
      title: "Open Projects Side Menu",
      desc: "Click on 'Projects' under the Audio & Video Recognition section in the left sidebar menu.",
      image: "acr_step5.png",
    },
    {
      id: 6,
      title: "Select Audio & Video Recognition Sub-section",
      desc: "Inside Projects, click on the 'Audio and Video Recognition' card to proceed.",
      image: "acr_step6.png",
    },
    {
      id: 7,
      title: "Click Create Project",
      desc: "Click the blue 'Create Project' button on the top right side of the project panel.",
      image: "acr_step7.png",
    },
    {
      id: 8,
      title: "Configure Project",
      desc: "Enter a project name (e.g., 'AudioWave'), verify that you use the default settings, and click 'Confirm'.",
      image: "acr_step8.png",
    },
    {
      id: 9,
      title: "Copy Credentials",
      desc: "Locate Host, Access Key, and Secret Key inside your new project panel. Paste them individually below.",
      image: "acr_step9.png",
    },
  ];

  if (!section) return null;

  const currentSteps = section === "openrouter" ? openrouterSteps : acrcloudSteps;
  const totalSteps = currentSteps.length;

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] relative overflow-hidden flex flex-col">
      {/* Background Shift/Drifting Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-[var(--accent-violet)] rounded-full opacity-[0.02]"
            style={{
              width: `${Math.random() * 15 + 5}px`,
              height: `${Math.random() * 15 + 5}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animation: `floatParticle ${Math.random() * 30 + 20}s infinite linear`,
              animationDelay: `${Math.random() * -10}s`,
            }}
          />
        ))}
      </div>

      <style jsx global>{`
        @keyframes floatParticle {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-80px) translateX(40px);
          }
        }
      `}</style>

      {/* Global Top Navbar */}
      <Navbar />

      {/* Sticky Progress Bar & Header Panel */}
      <div className="sticky top-[64px] z-40 bg-[rgba(8,12,20,0.8)] backdrop-blur-md border-b border-[var(--glass-border)] py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-xs font-semibold font-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition py-1.5 px-3 rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.02)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>{section === "acrcloud" ? "Back to OpenRouter" : "Back to Welcome"}</span>
          </button>

          {/* Floating Progress Pill */}
          <div className="px-3.5 py-1.5 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs font-heading font-bold text-[var(--accent-cyan)] shadow-[0_0_15px_rgba(0,212,255,0.05)]">
            {section === "openrouter"
              ? `OpenRouter: Step ${activeStep} of ${totalSteps}`
              : `ACRCloud: Step ${activeStep} of ${totalSteps}`}
          </div>
        </div>

        {/* Progress Bar Line */}
        <div className="max-w-3xl mx-auto px-4 mt-3">
          <div className="w-full h-1 bg-[var(--bg-surface)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)]"
              animate={{ width: `${scrollProgress}%` }}
              transition={{ ease: "easeOut", duration: 0.2 }}
            />
          </div>
        </div>
      </div>

      {/* Main Guide Content */}
      <main ref={sectionTopRef} className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 z-10">
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-wide bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent mb-3">
            {section === "openrouter" ? "OpenRouter Credentials" : "ACRCloud Credentials"}
          </h1>
          <p className="font-body text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
            {section === "openrouter"
              ? "Follow these steps to obtain a free OpenRouter API key so the AI can split your mixtapes."
              : "Follow these steps to configure a free ACRCloud project and retrieve keys to identify Tamil song titles."}
          </p>
        </div>

        {/* List of Steps */}
        <div className="space-y-12">
          {currentSteps.map((step) => (
            <motion.div
              key={step.id}
              data-step={step.id}
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl p-6 sm:p-8 backdrop-blur-md hover:border-[rgba(0,212,255,0.15)] transition shadow-[0_0_30px_rgba(0,212,255,0.02)]"
            >
              {/* Step Title Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-violet)] flex items-center justify-center font-heading text-base font-bold text-white shadow-lg">
                  {step.id}
                </div>
                <div className="flex-1">
                  <h3 className="font-heading text-lg font-bold text-[var(--text-primary)]">
                    {step.title}
                  </h3>
                  <p className="font-body text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>

              {/* Step Screenshot Reveal Animation */}
              {step.image && (
                <div 
                  onClick={() => setActiveLightboxImage(`/setup-images/${step.image}`)}
                  className="relative mt-6 overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--bg-surface)] max-w-xl mx-auto shadow-xl aspect-[3/2] cursor-zoom-in group"
                >
                  {/* Mask Reveal overlay */}
                  <motion.div
                    initial={{ x: "0%" }}
                    whileInView={{ x: "100%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                    className="absolute inset-0 bg-[var(--bg-surface)] z-10"
                  />
                  <Image
                    src={`/setup-images/${step.image}`}
                    alt={step.title}
                    fill
                    className="object-contain opacity-90 hover:opacity-100 group-hover:scale-[1.03] transition duration-300 p-2"
                    sizes="(max-width: 768px) 100vw, 600px"
                    priority
                  />
                  {/* Glassmorphic hover overlay */}
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center pointer-events-none">
                    <div className="py-2 px-4 rounded-full bg-black/60 border border-[rgba(255,255,255,0.2)] text-white text-xs font-semibold backdrop-blur-md shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition duration-300">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      <span>Click to View Full Size</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Input & Form Section */}
        <div className="mt-16 border-t border-[var(--glass-border)] pt-12 pb-24">
          <AnPresenceError error={errorMsg} />

          {section === "openrouter" ? (
            <motion.div
              key="openrouter-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl mx-auto text-center"
            >
              <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] mb-4">
                Enter OpenRouter API Key
              </h3>
              <motion.div
                animate={shakeOpenRouter ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                transition={{ duration: 0.4 }}
                onAnimationComplete={() => setShakeOpenRouter(false)}
                className="w-full mb-6"
              >
                <input
                  type="text"
                  placeholder="sk-or-v1-..."
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl py-3 px-4 text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-[3px] focus:ring-[rgba(0,212,255,0.15)] transition"
                />
              </motion.div>
              <button
                onClick={handleNextSection}
                className="w-full sm:w-auto font-body font-semibold text-sm py-3 px-8 bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(0,212,255,0.25)] hover:scale-[1.03] active:scale-[0.97] transition transform duration-200"
              >
                Next: ACRCloud Setup
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="acrcloud-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl mx-auto"
            >
              <h3 className="font-heading text-xl font-bold text-[var(--text-primary)] text-center mb-6">
                Enter ACRCloud Credentials
              </h3>
              <motion.div
                animate={shakeAcr ? { x: [0, -8, 8, -8, 8, 0] } : {}}
                transition={{ duration: 0.4 }}
                onAnimationComplete={() => setShakeAcr(false)}
                className="space-y-4 mb-8"
              >
                <div>
                  <label className="block text-xs font-semibold font-body text-[var(--text-secondary)] mb-2">
                    ACR Host (e.g., identify-ap-southeast-1.acrcloud.com)
                  </label>
                  <input
                    type="text"
                    placeholder="identify-your-region.acrcloud.com"
                    value={acrHost}
                    onChange={(e) => setAcrHost(e.target.value)}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl py-3 px-4 text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-[3px] focus:ring-[rgba(0,212,255,0.15)] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold font-body text-[var(--text-secondary)] mb-2">
                    ACR Access Key
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your Access Key"
                    value={acrAccessKey}
                    onChange={(e) => setAcrAccessKey(e.target.value)}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl py-3 px-4 text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-[3px] focus:ring-[rgba(0,212,255,0.15)] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold font-body text-[var(--text-secondary)] mb-2">
                    ACR Secret Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your Secret Key"
                    value={acrSecretKey}
                    onChange={(e) => setAcrSecretKey(e.target.value)}
                    className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-xl py-3 px-4 text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-[3px] focus:ring-[rgba(0,212,255,0.15)] transition"
                  />
                </div>
              </motion.div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => setSection("openrouter")}
                  className="w-full sm:w-auto font-body font-semibold text-sm py-3 px-8 border border-[rgba(0,212,255,0.3)] text-[var(--accent-cyan)] hover:bg-[rgba(0,212,255,0.08)] rounded-xl transition"
                >
                  Back to OpenRouter
                </button>
                <button
                  onClick={handleCompleteSetup}
                  disabled={loading}
                  className="w-full sm:w-auto font-body font-semibold text-sm py-3 px-8 bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] text-white rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(0,212,255,0.25)] hover:scale-[1.03] active:scale-[0.97] transition transform duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving keys...</span>
                    </>
                  ) : (
                    "Complete Setup"
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Lightbox Portal Overlay */}
      <AnimatePresence>
        {activeLightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveLightboxImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,12,20,0.95)] backdrop-blur-md p-4 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative max-w-5xl w-full h-[80vh] flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setActiveLightboxImage(null)}
                className="absolute -top-12 right-0 sm:right-4 z-10 p-2.5 rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-white hover:bg-[rgba(255,255,255,0.1)] transition flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Lightbox Image Container */}
              <div className="relative w-full h-full bg-[rgba(255,255,255,0.01)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-4 overflow-hidden flex items-center justify-center shadow-2xl">
                <img
                  src={activeLightboxImage}
                  alt="Expanded setup step"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--bg-deep)]"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Inline Animation helper for error message display
function AnPresenceError({ error }: { error: string }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="max-w-xl mx-auto mb-6 bg-[rgba(239,68,68,0.15)] border border-[var(--error)] rounded-xl p-4 flex items-start gap-3 shadow-lg"
        >
          <svg className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="font-body text-sm text-[var(--text-primary)]">
            {error}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function SetupPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <GeneratorSetupPage />
    </Suspense>
  );
}
