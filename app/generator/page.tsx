"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

export default function GeneratorHubPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/");
      return;
    }

    const checkSetup = async () => {
      try {
        const db = getFirebaseDb();
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        const setupComplete = userDocSnap.exists()
          ? userDocSnap.data().setupComplete
          : false;

        if (setupComplete) {
          router.push("/generator/upload");
        } else {
          router.push("/generator/setup");
        }
      } catch (error) {
        console.error("Failed to check setupComplete in GeneratorHub:", error);
        // Fallback to setup if firestore fails
        router.push("/generator/setup");
      }
    };

    checkSetup();
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="flex flex-col items-center gap-4 text-center z-10">
        {/* Futuristic Glassmorphism spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-[var(--glass-border)]" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent-cyan)] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
        <h2 className="font-heading text-lg font-bold tracking-wide mt-4">
          Accessing Generator...
        </h2>
        <p className="font-body text-xs text-[var(--text-secondary)]">
          Configuring workspace parameters
        </p>
      </div>
    </div>
  );
}
