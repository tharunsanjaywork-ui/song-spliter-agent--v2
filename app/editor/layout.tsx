"use client";

import React from "react";
import ProtectedGuard from "@/components/auth/ProtectedGuard";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedGuard>{children}</ProtectedGuard>;
}
