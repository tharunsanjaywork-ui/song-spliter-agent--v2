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
  const [shakeKey, setShakeKey] = useState(0);
  useEffect(() => {
    if (error) {
      setShakeKey((prev) => prev + 1);
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
      <div className="min-h-screen bg-background text-on-surface flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <span className="font-body-md text-on-surface-variant animate-pulse">Loading AudioWave...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface relative overflow-hidden flex items-center justify-center p-4">
      {/* Ambient background blur orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/10 blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-secondary-container/20 blur-[120px]" />
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      </div>

      {/* Recaptcha Container */}
      <div id="recaptcha-container"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        {/* Main Card */}
        <motion.div
          key={shakeKey}
          animate={error ? { x: [0, -8, 8, -8, 8, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="relative bg-surface-container/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl overflow-hidden"
        >
          {/* Inner edge lighting border */}
          <div className="absolute inset-0 border border-white/5 rounded-2xl pointer-events-none z-20" />

          {/* App Brand Header */}
          <div className="text-center mb-6">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="font-display-lg text-display-lg text-on-surface tracking-tight mb-2"
            >
              AudioWave
            </motion.h1>
            <p className="font-body-md text-body-md text-on-surface-variant select-none">
              {"Edit audio. Split mixtapes. Powered by AI.".split("").map((char, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 + index * 0.02, duration: 0.1 }}
                >
                  {char}
                </motion.span>
              ))}
            </p>
          </div>

          {/* Form Selector Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.4 }}
            className="flex bg-surface-container-high/50 rounded-xl p-1 mb-6 border border-white/5"
          >
            <button
              onClick={() => setActiveTab("login")}
              className={`flex-1 font-body-md text-technical-sm py-2 px-3 rounded-lg font-medium transition duration-200 ${
                activeTab === "login"
                  ? "bg-surface-variant text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setActiveTab("signup")}
              className={`flex-1 font-body-md text-technical-sm py-2 px-3 rounded-lg font-medium transition duration-200 ${
                activeTab === "signup"
                  ? "bg-surface-variant text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Sign Up
            </button>
            <button
              onClick={() => setActiveTab("phone")}
              className={`flex-1 font-body-md text-technical-sm py-2 px-3 rounded-lg font-medium transition duration-200 ${
                activeTab === "phone"
                  ? "bg-surface-variant text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Phone Login
            </button>
          </motion.div>

          {/* Dynamic Feedbacks */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3 bg-error-container/20 border border-error/30 text-error text-xs rounded-xl flex items-start gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span className="font-body-md">{DOMPurify.sanitize(error, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3 bg-tertiary/10 border border-tertiary/30 text-tertiary text-xs rounded-xl flex items-start gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span className="font-body-md">{DOMPurify.sanitize(success, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Authentication Forms */}
          <AnimatePresence mode="wait">
            {activeTab === "login" && (
              <motion.form
                key="login-form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleEmailSignIn}
                className="space-y-4"
              >
                <div className="space-y-1.5 animate-stagger-item" style={{ animationDelay: "1.9s" }}>
                  <label className="font-technical-sm text-technical-sm text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    required
                    className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-3 px-4 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline-variant transition"
                  />
                </div>

                <div className="space-y-1.5 animate-stagger-item" style={{ animationDelay: "2.0s" }}>
                  <label className="font-technical-sm text-technical-sm text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-3 px-4 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline-variant transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-secondary-container hover:bg-[#5235e8] text-on-surface font-headline-lg-mobile text-[16px] font-semibold rounded-full py-3 ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-on-surface border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>login</span>
                      Sign In with Email
                    </>
                  )}
                </button>
              </motion.form>
            )}

            {activeTab === "signup" && (
              <motion.form
                key="signup-form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleEmailSignUp}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="font-technical-sm text-technical-sm text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">mail</span>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    required
                    className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-3 px-4 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline-variant transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-technical-sm text-technical-sm text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                    Create Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-3 px-4 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline-variant transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-technical-sm text-technical-sm text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-3 px-4 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline-variant transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-secondary-container hover:bg-[#5235e8] text-on-surface font-headline-lg-mobile text-[16px] font-semibold rounded-full py-3 ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-on-surface border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>person_add</span>
                      Register & Sign Up
                    </>
                  )}
                </button>
              </motion.form>
            )}

            {activeTab === "phone" && (
              <motion.div
                key="phone-form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                {phoneStep === "input" ? (
                  <form onSubmit={handleSendCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="font-technical-sm text-technical-sm text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">phone</span>
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. +919876543210"
                        required
                        className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-3 px-4 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline-variant transition"
                      />
                      <span className="font-technical-xs text-technical-xs text-on-surface-variant">
                        Include country code prefix (e.g. +91 for India).
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-secondary-container hover:bg-[#5235e8] text-on-surface font-headline-lg-mobile text-[16px] font-semibold rounded-full py-3 ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-on-surface border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>sms</span>
                          Send Verification Code
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="font-technical-sm text-technical-sm text-on-surface-variant flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px]">pin</span>
                          Verification Code
                        </label>
                        <button
                          type="button"
                          onClick={() => setPhoneStep("input")}
                          className="font-technical-sm text-technical-sm text-primary hover:underline font-semibold"
                        >
                          Change Number
                        </button>
                      </div>
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="Enter 6-digit SMS code"
                        maxLength={6}
                        required
                        className="w-full bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant rounded-lg py-3 px-4 font-technical-sm text-[20px] text-center tracking-widest text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline-variant transition"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-secondary-container hover:bg-[#5235e8] text-on-surface font-headline-lg-mobile text-[16px] font-semibold rounded-full py-3 ai-glow border border-white/10 shadow-[0_4px_15px_rgba(68,43,189,0.3)] transition duration-200 transform hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-on-surface border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings: "'FILL' 1"}}>verified</span>
                          Verify & Sign In
                        </>
                      )}
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Social Sign-In Separator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.2 }}
            transition={{ delay: 2.1, duration: 0.5 }}
            className="relative my-6 flex items-center justify-center"
          >
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant"></div>
            </div>
            <span className="relative font-body-md text-technical-xs text-on-surface-variant bg-surface px-3 py-1 rounded-full border border-outline-variant/50 backdrop-blur-md">
              or continue with
            </span>
          </motion.div>

          {/* Social Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.2, duration: 0.4 }}
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex items-center justify-center gap-2 border border-outline-variant bg-surface-container-lowest/50 hover:bg-surface-container-low rounded-xl py-3 font-body-md text-on-surface font-semibold transition hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
            >
              {/* Google SVG Icon */}
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.184 4.114-3.478 0-6.3-2.823-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.63 0 3.107.62 4.228 1.626l3.207-3.208C18.82 2.128 15.683 1 12.24 1 5.922 1 1 5.922 1 12.24s4.922 11.24 11.24 11.24c6.305 0 10.98-4.426 10.98-11.24 0-.693-.06-1.37-.18-1.955H12.24z" />
              </svg>
              Google
            </motion.button>
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.3, duration: 0.4 }}
              onClick={handleAppleLogin}
              disabled={loading}
              className="flex items-center justify-center gap-2 border border-outline-variant bg-surface-container-lowest/50 hover:bg-surface-container-low rounded-xl py-3 font-body-md text-on-surface font-semibold transition hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
            >
              {/* Apple SVG Icon */}
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.52-.62.71-1.16 1.85-1.01 2.96 1.12.09 2.27-.58 2.96-1.42z" />
              </svg>
              Apple
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
