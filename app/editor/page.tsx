"use client";

import React, { useEffect } from "react";
import { AudioEditor } from "@/components/AudioEditor";

export default function EditorPage() {
  useEffect(() => {
    localStorage.setItem("active_route", "/editor");
  }, []);

  return <AudioEditor />;
}
