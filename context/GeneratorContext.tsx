"use client";

import React, { createContext, useContext, useState } from "react";
import { JobFile } from "@/lib/api";

interface GeneratorContextValue {
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  jobId: string | null;
  setJobId: (id: string | null) => void;
  editorFiles: JobFile[];
  setEditorFiles: (files: JobFile[]) => void;
}

const GeneratorContext = createContext<GeneratorContextValue | null>(null);

export function GeneratorProvider({ children }: { children: React.ReactNode }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [editorFiles, setEditorFiles] = useState<JobFile[]>([]);

  return (
    <GeneratorContext.Provider
      value={{ selectedFile, setSelectedFile, jobId, setJobId, editorFiles, setEditorFiles }}
    >
      {children}
    </GeneratorContext.Provider>
  );
}

export function useGeneratorContext(): GeneratorContextValue {
  const ctx = useContext(GeneratorContext);
  if (!ctx) throw new Error("useGeneratorContext must be inside GeneratorProvider");
  return ctx;
}
