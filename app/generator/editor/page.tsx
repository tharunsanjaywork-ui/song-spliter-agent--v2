"use client";

import React, { useEffect } from "react";
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

  // Set active route on mount
  useEffect(() => {
    localStorage.setItem("active_route", "/generator/editor");
    localStorage.setItem("active_generator_route", "/generator/editor");
  }, []);

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

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] flex flex-col">
      {/* Generator Editor Header with Discard Queue button */}
      <div className="bg-[var(--bg-surface)] border-b border-[var(--glass-border)] px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 overflow-x-auto py-0.5">
          <span className="font-body text-xs text-[var(--text-muted)] flex-shrink-0">
            Fix queue:
          </span>
          {editorFiles.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg font-body text-xs border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"
            >
              {i + 1}. {f.displayName || `Track ${i + 1}`}
            </motion.div>
          ))}
        </div>

        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              sessionStorage.removeItem("editorFiles");
            }
            setEditorFiles([]);
            localStorage.removeItem("active_split_job");
            localStorage.removeItem("active_route");
            localStorage.removeItem("active_generator_route");
            router.push("/generator/upload");
          }}
          className="px-3.5 py-1.5 rounded-lg border border-red-800/40 text-red-200 bg-red-950/70 hover:bg-red-900/90 shadow-[0_0_10px_rgba(239,68,68,0.1)] transition flex items-center gap-1.5"
        >
          ✕ Cancel &amp; Discard Queue
        </button>
      </div>

      {/* Reuse the full AudioEditor component, pre-loaded with all queue files */}
      <AudioEditor
        initialFileUrls={editorFiles.map((f) => f.cloudinaryUrl)}
        initialFileNames={editorFiles.map((f, i) => f.displayName || `track_${i + 1}.mp3`)}
      />
    </div>
  );
}
