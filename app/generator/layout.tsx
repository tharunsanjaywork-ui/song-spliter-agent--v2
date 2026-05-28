"use client";

import React from "react";
import ProtectedGuard from "@/components/auth/ProtectedGuard";
import { GeneratorProvider } from "@/context/GeneratorContext";

export default function GeneratorLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedGuard>
      <GeneratorProvider>{children}</GeneratorProvider>
    </ProtectedGuard>
  );
}
