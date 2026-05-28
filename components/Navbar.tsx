"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const navLinks = [
    { name: "Audio Editor", href: "/editor" },
    { name: "Generator", href: "/generator" },
  ];

  return (
    <nav className="w-full bg-[var(--bg-surface)] border-b border-[var(--glass-border)] sticky top-0 z-50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo (Left) */}
          <div className="flex-shrink-0 flex items-center">
            <Link
              href="/welcome"
              className="font-heading text-2xl font-extrabold bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-violet)] bg-clip-text text-transparent transition duration-300 hover:scale-[1.03]"
            >
              AudioWave
            </Link>
          </div>

          {/* Links (Center - Desktop) */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`font-body text-sm font-medium transition duration-200 ${
                    isActive
                      ? "text-[var(--accent-cyan)] drop-shadow-[0_0_8px_rgba(0,212,255,0.4)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>

          {/* User Profile & Logout (Right - Desktop) */}
          <div className="hidden md:flex items-center space-x-4">
            {user && (
              <div className="flex items-center space-x-3 bg-[rgba(255,255,255,0.03)] px-3 py-1.5 rounded-lg border border-[var(--glass-border)]">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    className="w-6 h-6 rounded-full border border-[var(--accent-cyan)]"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-violet)] flex items-center justify-center text-xs font-semibold text-white">
                    {user.displayName?.charAt(0) || user.email?.charAt(0) || "U"}
                  </div>
                )}
                <span className="font-body text-xs font-medium text-[var(--text-secondary)] max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="font-body text-xs py-1.5 px-3 border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] hover:bg-[rgba(239,68,68,0.15)] text-[var(--error)] rounded-lg font-medium transition duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Logout
            </button>
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
                onClick={() => setIsOpen(false)}
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
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    className="w-8 h-8 rounded-full border border-[var(--accent-cyan)]"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-violet)] flex items-center justify-center text-sm font-semibold text-white">
                    {user.displayName?.charAt(0) || user.email?.charAt(0) || "U"}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-body text-xs font-semibold text-[var(--text-primary)]">
                    {user.displayName || "AudioWave User"}
                  </span>
                  <span className="font-body text-[10px] text-[var(--text-secondary)] truncate max-w-[200px]">
                    {user.email}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={handleLogout}
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
