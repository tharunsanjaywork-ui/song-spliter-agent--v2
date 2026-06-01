"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";


export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(getFirebaseAuth());
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const clearActiveRoute = () => {
    // No-op since route recovery is removed
  };

  const navLinks = [
    { name: "Dashboard", href: "/welcome" },
    { name: "Audio Editor", href: "/editor" },
    { name: "Generator", href: "/generator" },
  ];

  return (
    <nav className="w-full bg-[rgba(15,15,15,0.75)] border-b border-[var(--glass-border)] sticky top-0 z-50 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
      <style>{`
        @keyframes navWave {
          0%, 100% { height: 25%; }
          50% { height: 100%; }
        }
        .animate-nav-wave-1 { animation: navWave 1.2s ease-in-out infinite; }
        .animate-nav-wave-2 { animation: navWave 1.2s ease-in-out infinite 0.15s; }
        .animate-nav-wave-3 { animation: navWave 1.2s ease-in-out infinite 0.3s; }
        .animate-nav-wave-4 { animation: navWave 1.2s ease-in-out infinite 0.45s; }
        .animate-nav-wave-5 { animation: navWave 1.2s ease-in-out infinite 0.6s; }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Nav Links (Left - Desktop) */}
          <div className="flex items-center space-x-10">
            {/* Logo (Left) */}
            <div className="flex-shrink-0 flex items-center">
              <Link
                href="/welcome"
                onClick={clearActiveRoute}
                className="flex items-center gap-2.5 group transition duration-300 hover:scale-[1.02]"
              >
                {/* Animated Premium Glass Waveform Logo */}
                <div className="flex gap-0.5 items-end justify-center h-6 w-7 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.08)] px-1.5 py-1 rounded-md shadow-inner backdrop-blur-sm">
                  <span className="w-0.5 bg-gradient-to-t from-[var(--accent-cyan)] to-[var(--accent-violet)] rounded-full animate-nav-wave-1" style={{ height: "40%" }} />
                  <span className="w-0.5 bg-gradient-to-t from-[var(--accent-cyan)] to-[var(--accent-violet)] rounded-full animate-nav-wave-2" style={{ height: "70%" }} />
                  <span className="w-0.5 bg-gradient-to-t from-[var(--accent-cyan)] to-[var(--accent-violet)] rounded-full animate-nav-wave-3" style={{ height: "100%" }} />
                  <span className="w-0.5 bg-gradient-to-t from-[var(--accent-cyan)] to-[var(--accent-violet)] rounded-full animate-nav-wave-4" style={{ height: "60%" }} />
                  <span className="w-0.5 bg-gradient-to-t from-[var(--accent-cyan)] to-[var(--accent-violet)] rounded-full animate-nav-wave-5" style={{ height: "30%" }} />
                </div>
                <span className="font-heading text-xl font-black bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent tracking-wider">
                  AudioWave
                </span>
              </Link>
            </div>

            {/* Links (Desktop) */}
            <div className="hidden md:flex items-center space-x-2">
              {navLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={clearActiveRoute}
                    className={`font-body text-xs font-semibold tracking-wider uppercase px-3 py-1.5 rounded-xl transition-all duration-300 border ${
                      isActive
                        ? "bg-[rgba(0,212,255,0.06)] border-[rgba(0,212,255,0.25)] text-[var(--accent-cyan)] shadow-[0_0_15px_rgba(0,212,255,0.15)]"
                        : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.08)]"
                    }`}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* User Profile & Dropdown (Right - Desktop) */}
          <div className="hidden md:flex items-center space-x-4 relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] px-3 py-1.5 rounded-full border border-[var(--glass-border)] transition duration-200"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[var(--accent-cyan)] to-[var(--accent-violet)] flex items-center justify-center text-xs shadow-[0_0_8px_rgba(0,212,255,0.3)] border border-white/20 animate-pulse">
                🤖
              </div>
              <span className="font-body text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Roboshi
              </span>
              <span className="text-[10px] opacity-60">▼</span>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-xl shadow-2xl p-1.5 z-50 backdrop-blur-lg flex flex-col gap-0.5">
                  <div className="px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] tracking-wider border-b border-[var(--glass-border)] mb-1">
                    ACCOUNT
                  </div>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      clearActiveRoute();
                      router.push("/settings");
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] text-left transition"
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      clearActiveRoute();
                      handleLogout();
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-body text-[var(--error)] hover:bg-[rgba(239,68,68,0.08)] text-left transition"
                  >
                    🚪 Log Out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Hamburger Menu Toggle (Mobile) */}
          <div className="flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent-cyan)] transition"
              aria-expanded={isOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isOpen ? (
                // Close Icon
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                // Hamburger Menu Icon
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Panel */}
      {isOpen && (
        <div className="md:hidden bg-[var(--bg-surface)] border-t border-[var(--glass-border)] py-3 px-4 space-y-3">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => {
                  setIsOpen(false);
                  clearActiveRoute();
                }}
                className={`block font-body text-sm font-medium py-2 px-3 rounded-lg transition ${
                  isActive
                    ? "bg-[rgba(0,212,255,0.08)] text-[var(--accent-cyan)]"
                    : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
                }`}
              >
                {link.name}
              </Link>
            );
          })}

          <div className="border-t border-[var(--glass-border)] pt-3 flex flex-col space-y-3">
            {user && (
              <div className="flex items-center space-x-3 px-3 py-1.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[var(--accent-cyan)] to-[var(--accent-violet)] flex items-center justify-center text-sm shadow-[0_0_8px_rgba(0,212,255,0.3)] border border-white/20">
                  🤖
                </div>
                <div className="flex flex-col">
                  <span className="font-body text-xs font-semibold text-[var(--text-primary)]">
                    Roboshi
                  </span>
                  <span className="font-body text-[10px] text-[var(--text-secondary)] truncate max-w-[200px]">
                    {user.email}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setIsOpen(false);
                clearActiveRoute();
                router.push("/settings");
              }}
              className="w-full font-body text-xs py-2 px-3 text-center border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)] rounded-lg font-medium transition"
            >
              ⚙️ Settings
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                handleLogout();
              }}
              className="w-full font-body text-xs py-2 px-3 text-center border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] hover:bg-[rgba(239,68,68,0.15)] text-[var(--error)] rounded-lg font-medium transition"
            >
              Logout
            </button>
          </div>
        </div>
      )}

    </nav>
  );
}
