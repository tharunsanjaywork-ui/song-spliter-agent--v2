"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedGuardProps {
  children: React.ReactNode;
}

export default function ProtectedGuard({ children }: ProtectedGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // Unauthenticated user attempting to access a protected route
      // Redirect to landing/login page (/)
      router.push("/");
    }
  }, [user, loading, router]);

  // Show a premium dark skeleton / spinner while loading or resolving auth
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin mb-4"></div>
          <span className="font-body text-xs text-[var(--text-secondary)] animate-pulse">
            Verifying your session...
          </span>
        </div>
      </div>
    );
  }

  // If user is authenticated, render the children protected content
  if (user) {
    return <>{children}</>;
  }

  // Fallback to empty during redirect transitions
  return null;
}
