"use client";

import { useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let auth;
    try {
      auth = getFirebaseAuth();
    } catch (error) {
      console.error("Firebase auth is not configured:", error);
      setUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, []);

  async function logout(): Promise<void> {
    await signOut(getFirebaseAuth());
  }

  return { user, loading, logout };
}
