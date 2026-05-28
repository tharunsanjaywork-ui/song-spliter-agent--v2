"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { AudioEditor } from "@/components/AudioEditor";
import { useGeneratorContext } from "@/context/GeneratorContext";

/**
 * Correction editor — pre-loads the first unchecked file from the preview page.
 * Remaining files are shown as a queue so the user can fix each one.
 */
export default function GeneratorEditorPage() {
  const router = useRouter();
  const { editorFiles, setEditorFiles } = useGeneratorContext();

  const [activeIndex, setActiveIndex] = useState(0);

  // Guard: if no files were passed from preview, go back to upload
  useEffect(() => {
    if (editorFiles.length === 0) {
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem("editorFiles");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.length > 0) {
              setEditorFiles(parsed);
              return;
            }
          } catch {}
        }
      }
      router.push("/generator/upload");
    }
  }, [editorFiles, router, setEditorFiles]);

  if (editorFiles.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const active = editorFiles[activeIndex];

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
      {/* File queue banner — shown only if there are multiple files to fix */}
      {editorFiles.length > 1 && (
        <div className="bg-[var(--bg-surface)] border-b border-[var(--glass-border)] px-4 py-2 flex items-center gap-3 overflow-x-auto">
          <span className="font-body text-xs text-[var(--text-muted)] flex-shrink-0">
            Fix queue:
          </span>
          {editorFiles.map((f, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setActiveIndex(i)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-body text-xs border transition ${
                i === activeIndex
                  ? "bg-[rgba(0,212,255,0.1)] border-[rgba(0,212,255,0.3)] text-[var(--accent-cyan)]"
                  : "border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {i + 1}. {f.displayName || `Track ${i + 1}`}
            </motion.button>
          ))}
        </div>
      )}

      {/* Reuse the full AudioEditor component, pre-loaded with the active file's URL */}
      <AudioEditor
        key={activeIndex}
        initialFileUrl={active.cloudinaryUrl}
        initialFileName={active.displayName || `track_${activeIndex + 1}.mp3`}
      />
    </div>
  );
}
