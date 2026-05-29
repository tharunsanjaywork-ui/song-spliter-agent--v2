"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  setPersistence,
  browserLocalPersistence,
  ConfirmationResult,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import DOMPurify from "dompurify";
import { useAuth } from "@/hooks/useAuth";

interface Particle {
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

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // Tab states: 'login' | 'signup' | 'phone'
  const [activeTab, setActiveTab] = useState<"login" | "signup" | "phone">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Phone auth internal state
  const [phoneStep, setPhoneStep] = useState<"input" | "code">("input");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);

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

  // Auto-redirect if user already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.push("/welcome");
    }
  }, [user, authLoading, router]);

  // Clean error on tab switch
  useEffect(() => {
    setError(null);
    setSuccess(null);
    setPhoneStep("input");
  }, [activeTab]);

  // Shake animation trigger key on error
  const [isShaking, setIsShaking] = useState(false);
  useEffect(() => {
    if (error) {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 500);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Setup persistence helper
  const prepareAuth = async () => {
    const auth = getFirebaseAuth();
    await setPersistence(auth, browserLocalPersistence);
    return auth;
  };

  // Google Login Flow
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await prepareAuth();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setSuccess("Logged in successfully!");
      router.push("/welcome");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to sign in with Google.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Apple Login Flow
  const handleAppleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await prepareAuth();
      const provider = new OAuthProvider("apple.com");
      await signInWithPopup(auth, provider);
      setSuccess("Logged in successfully!");
      router.push("/welcome");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to sign in with Apple.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Email/Password Sign-In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const auth = await prepareAuth();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setSuccess("Logged in successfully!");
      router.push("/welcome");
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string };
      if (firebaseError.code === "auth/user-not-found" || firebaseError.code === "auth/wrong-password") {
        setError("Invalid email or password. Please try again.");
      } else if (firebaseError.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError(firebaseError.message || "Authentication failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Email/Password Sign-Up
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const auth = await prepareAuth();
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      setSuccess("Account created successfully!");
      router.push("/welcome");
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string };
      if (firebaseError.code === "auth/email-already-in-use") {
        setError("This email is already in use.");
      } else {
        setError(firebaseError.message || "Failed to create account.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Send SMS Code for Phone Auth
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) {
      setError("Please enter your phone number.");
      return;
    }
    setLoading(true);
    setError(null);
    
    try {
      const auth = await prepareAuth();
      
      // Initialize ReCaptcha Verifier if not already done
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
          callback: () => {
            // recaptcha resolved
          },
        });
      }

      const verifier = recaptchaVerifierRef.current;
      const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`; // Default to India country code if missing prefix
      
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setPhoneStep("code");
      setSuccess("Verification code sent to your phone.");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to send verification code.";
      setError(errMsg || "Failed to send verification code. Check format (e.g. +91XXXXXXXXXX)");
      // Reset reCAPTCHA on error so user can retry
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  };

  // Confirm SMS Verification Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode) {
      setError("Please enter the verification code.");
      return;
    }
    if (!confirmationResult) {
      setError("No active verification session found. Please request a new code.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await confirmationResult.confirm(verificationCode);
      setSuccess("Logged in successfully!");
      router.push("/welcome");
    } catch {
      setError("Invalid verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Display initial loading screen while checking auth status
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin mb-4"></div>
          <span className="font-body text-[var(--text-secondary)] animate-pulse">Loading AudioWave...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-on-surface min-h-screen w-screen relative overflow-hidden flex items-center justify-center p-margin bg-[#0f0f0f]">
      {/* Mesh Gradient Background */}
      <div className="mesh-bg"></div>

      {/* Particle Container */}
      <div className="absolute inset-0 z-0 overflow-hidden" id="particles">
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

      {/* Recaptcha Container */}
      <div id="recaptcha-container"></div>

      {/* Top Alert Banner */}
      <div
        className={`fixed top-0 left-0 w-full bg-error-container text-on-error-container font-technical-sm text-technical-sm p-sm text-center transform transition-transform duration-300 z-50 flex items-center justify-center gap-2 ${
          error ? "translate-y-0" : "-translate-y-full"
        }`}
        id="error-banner"
      >
        <span className="material-symbols-outlined text-[16px]">warning</span>
        <span>{error ? DOMPurify.sanitize(error, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) : ""}</span>
      </div>

      {/* Top Success Banner */}
      <div
        className={`fixed top-0 left-0 w-full bg-surface-tint/20 border-b border-surface-tint/30 text-primary-fixed font-technical-sm text-technical-sm p-sm text-center transform transition-transform duration-300 z-50 flex items-center justify-center gap-2 ${
          success ? "translate-y-0" : "-translate-y-full"
        }`}
        id="success-banner"
      >
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        <span>{success ? DOMPurify.sanitize(success, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) : ""}</span>
      </div>

      {/* Main Login Card */}
      <div
        className={`glass-panel w-full max-w-[420px] rounded-xl p-lg z-10 relative flex flex-col gap-lg border border-outline-variant/30 slide-up ${
          isShaking ? "shake" : ""
        }`}
      >
        {/* Header */}
        <div className="text-center flex flex-col gap-sm items-center">
          <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mb-2 border border-outline-variant hover-glow transition-all hover:scale-110 cursor-pointer">
            <span className="material-symbols-outlined text-[24px] text-primary">graphic_eq</span>
          </div>
          <h1 className="font-display-lg text-display-lg text-gradient tracking-tighter">AudioWave</h1>
          <div className="h-[20px] flex items-center justify-center">
            <p className="font-technical-sm text-technical-sm text-on-surface-variant typewriter">
              Edit audio. Split mixtapes. Powered by AI.
            </p>
          </div>
        </div>

        {/* Capsule Toggle */}
        <div className="bg-surface-container-low rounded-full p-1 flex relative text-technical-sm font-technical-sm">
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={`flex-1 py-2 text-center rounded-full transition-all duration-300 z-10 hover:scale-[1.02] ${
              activeTab === "login"
                ? "bg-surface-variant text-on-surface shadow-[0_0_10px_rgba(0,212,255,0.15)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("signup")}
            className={`flex-1 py-2 text-center rounded-full transition-all duration-300 z-10 hover:scale-[1.02] ${
              activeTab === "signup"
                ? "bg-surface-variant text-on-surface shadow-[0_0_10px_rgba(0,212,255,0.15)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50"
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("phone")}
            className={`flex-1 py-2 text-center rounded-full transition-all duration-300 z-10 hover:scale-[1.02] ${
              activeTab === "phone"
                ? "bg-surface-variant text-on-surface shadow-[0_0_10px_rgba(0,212,255,0.15)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50"
            }`}
          >
            Phone
          </button>
        </div>

        {/* Forms Container */}
        <AnimatePresence mode="wait">
          {activeTab === "login" && (
            <motion.form
              key="login"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleEmailSignIn}
              className="flex flex-col gap-md"
            >
              <div className="flex flex-col gap-base">
                <label className="font-technical-xs text-technical-xs text-on-surface-variant" htmlFor="email">
                  Email Address
                </label>
                <div className="relative flex items-center bg-[#0f0f0f]/80 border border-outline-variant rounded-lg p-2 input-glow transition-all duration-300 hover:border-outline">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">mail</span>
                  <input
                    className="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
                    id="email"
                    type="email"
                    placeholder="engineer@audiowave.ai"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-base">
                <div className="flex justify-between items-center">
                  <label className="font-technical-xs text-technical-xs text-on-surface-variant" htmlFor="password">
                    Password
                  </label>
                  <a
                    className="font-technical-xs text-technical-xs text-primary hover:text-primary-fixed-dim transition-colors hover:drop-shadow-[0_0_5px_rgba(0,212,255,0.5)]"
                    href="#"
                  >
                    Forgot?
                  </a>
                </div>
                <div className="relative flex items-center bg-[#0f0f0f]/80 border border-outline-variant rounded-lg p-2 input-glow transition-all duration-300 hover:border-outline">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">lock</span>
                  <input
                    className="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="text-on-surface-variant hover:text-on-surface hover:scale-110 transition-all ml-2 flex items-center"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              <button
                className="btn-gradient w-full py-3 rounded-full text-surface-container-lowest font-headline-lg-mobile text-headline-lg-mobile mt-2 flex justify-center items-center gap-2 disabled:opacity-50"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Access Workspace</span>
                    <span className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </motion.form>
          )}

          {activeTab === "signup" && (
            <motion.form
              key="signup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleEmailSignUp}
              className="flex flex-col gap-md"
            >
              <div className="flex flex-col gap-base">
                <label className="font-technical-xs text-technical-xs text-on-surface-variant" htmlFor="signup-email">
                  Email Address
                </label>
                <div className="relative flex items-center bg-[#0f0f0f]/80 border border-outline-variant rounded-lg p-2 input-glow transition-all duration-300 hover:border-outline">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">mail</span>
                  <input
                    className="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
                    id="signup-email"
                    type="email"
                    placeholder="engineer@audiowave.ai"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-base">
                <label className="font-technical-xs text-technical-xs text-on-surface-variant" htmlFor="signup-password">
                  Password
                </label>
                <div className="relative flex items-center bg-[#0f0f0f]/80 border border-outline-variant rounded-lg p-2 input-glow transition-all duration-300 hover:border-outline">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">lock</span>
                  <input
                    className="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 6 characters"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="text-on-surface-variant hover:text-on-surface hover:scale-110 transition-all ml-2 flex items-center"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-base">
                <label className="font-technical-xs text-technical-xs text-on-surface-variant" htmlFor="confirm-password">
                  Confirm Password
                </label>
                <div className="relative flex items-center bg-[#0f0f0f]/80 border border-outline-variant rounded-lg p-2 input-glow transition-all duration-300 hover:border-outline">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">lock</span>
                  <input
                    className="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                className="btn-gradient w-full py-3 rounded-full text-surface-container-lowest font-headline-lg-mobile text-headline-lg-mobile mt-2 flex justify-center items-center gap-2 disabled:opacity-50"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Create Account</span>
                    <span className="material-symbols-outlined text-[20px]">
                      person_add
                    </span>
                  </>
                )}
              </button>
            </motion.form>
          )}

          {activeTab === "phone" && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-md"
            >
              {phoneStep === "input" ? (
                <form onSubmit={handleSendCode} className="flex flex-col gap-md">
                  <div className="flex flex-col gap-base">
                    <label className="font-technical-xs text-technical-xs text-on-surface-variant" htmlFor="phone">
                      Phone Number
                    </label>
                    <div className="relative flex items-center bg-[#0f0f0f]/80 border border-outline-variant rounded-lg p-2 input-glow transition-all duration-300 hover:border-outline">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">phone</span>
                      <input
                        className="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
                        id="phone"
                        type="tel"
                        placeholder="e.g. +919876543210"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                      />
                    </div>
                    <span className="font-technical-xs text-[10px] text-on-surface-variant/70">
                      Include country code (e.g., +91 for India).
                    </span>
                  </div>

                  <button
                    className="btn-gradient w-full py-3 rounded-full text-surface-container-lowest font-headline-lg-mobile text-headline-lg-mobile mt-2 flex justify-center items-center gap-2 disabled:opacity-50"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Send Code</span>
                        <span className="material-symbols-outlined text-[20px]">send</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="flex flex-col gap-md">
                  <div className="flex flex-col gap-base">
                    <div className="flex justify-between items-center">
                      <label className="font-technical-xs text-technical-xs text-on-surface-variant" htmlFor="code">
                        Verification Code
                      </label>
                      <button
                        type="button"
                        onClick={() => setPhoneStep("input")}
                        className="font-technical-xs text-primary hover:underline"
                      >
                        Change Phone
                      </button>
                    </div>
                    <div className="relative flex items-center bg-[#0f0f0f]/80 border border-outline-variant rounded-lg p-2 input-glow transition-all duration-300 hover:border-outline">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">sms</span>
                      <input
                        className="bg-transparent border-none outline-none w-full font-mono text-center text-lg tracking-widest text-on-surface placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
                        id="code"
                        type="text"
                        placeholder="000000"
                        maxLength={6}
                        required
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    className="btn-gradient w-full py-3 rounded-full text-surface-container-lowest font-headline-lg-mobile text-headline-lg-mobile mt-2 flex justify-center items-center gap-2 disabled:opacity-50"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Verify & Sign In</span>
                        <span className="material-symbols-outlined text-[20px]">verified</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-[1px] bg-outline-variant/50"></div>
          <span className="font-technical-xs text-technical-xs text-on-surface-variant">OR CONTINUE WITH</span>
          <div className="flex-1 h-[1px] bg-outline-variant/50"></div>
        </div>

        {/* Social Auth */}
        <div className="grid grid-cols-2 gap-md">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="bg-[#0f0f0f]/80 border border-outline-variant hover:border-primary/50 hover-glow transition-all rounded-lg py-2 flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            <svg
              className="w-5 h-5 text-on-surface group-hover:scale-110 transition-transform"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"></path>
            </svg>
            <span className="font-technical-sm text-technical-sm">Google</span>
          </button>
          <button
            type="button"
            onClick={handleAppleLogin}
            disabled={loading}
            className="bg-[#0f0f0f]/80 border border-outline-variant hover:border-primary/50 hover-glow transition-all rounded-lg py-2 flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            <svg
              className="w-5 h-5 text-on-surface group-hover:scale-110 transition-transform"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.19 2.31-.88 3.5-.8 1.45.09 2.58.62 3.32 1.63-2.88 1.77-2.39 5.6.53 6.81-.72 1.84-1.74 3.55-2.43 4.53zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"></path>
            </svg>
            <span className="font-technical-sm text-technical-sm">Apple</span>
          </button>
        </div>
      </div>
    </div>
  );
}
