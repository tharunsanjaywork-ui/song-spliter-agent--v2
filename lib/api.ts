import { getIdToken } from "@/lib/auth";
import { AnalysisResult } from "@/lib/audioAnalyzer";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface ProcessingEvent {
  step: string;
  message?: string;
  elapsed?: number;
  jobId?: string;
  error_type?: string;
  error?: string;
}

export interface JobFile {
  index: number;
  displayName: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  duration: number;
  recognized: boolean;
}

export interface JobData {
  jobId: string;
  status: string;
  fileCount: number;
  files: JobFile[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<HeadersInit> {
  const token = await getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// ─── API: Save keys ───────────────────────────────────────────────────────────

export async function saveApiKeys(
  openrouterKey: string,
  acoustidKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await authHeaders();
    const response = await fetch(`${BACKEND_URL}/api/keys/save`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        openrouter_key: openrouterKey,
        acoustid_key: acoustidKey,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      return { success: false, error: data.error || "Failed to save API keys." };
    }
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Network error.";
    return { success: false, error: msg };
  }
}

// ─── API: Keys status ─────────────────────────────────────────────────────────

export async function getKeysStatus(): Promise<{
  success: boolean;
  setupComplete: boolean;
  error?: string;
}> {
  try {
    const headers = await authHeaders();
    const response = await fetch(`${BACKEND_URL}/api/keys/status`, { headers });
    const responseData = await response.json();
    if (!response.ok || !responseData.success) {
      return { success: false, setupComplete: false, error: responseData.error || "Failed to check status." };
    }
    return { success: true, setupComplete: responseData.data.setupComplete };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Network error.";
    return { success: false, setupComplete: false, error: msg };
  }
}

// ─── API: Get job data ────────────────────────────────────────────────────────

export async function getJob(
  jobId: string
): Promise<{ success: boolean; data?: JobData; error?: string }> {
  try {
    const headers = await authHeaders();
    const response = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`, { headers });
    const responseData = await response.json();
    if (!response.ok || !responseData.success) {
      return { success: false, error: responseData.error || "Failed to load job data." };
    }
    return { success: true, data: responseData.data as JobData };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Network error.";
    return { success: false, error: msg };
  }
}

// ─── API: Rename file ─────────────────────────────────────────────────────────

export async function renameFile(
  jobId: string,
  fileIndex: number,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await authHeaders();
    const response = await fetch(`${BACKEND_URL}/api/files/rename`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fileIndex, newName }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      return { success: false, error: data.error || "Failed to rename file." };
    }
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Network error.";
    return { success: false, error: msg };
  }
}

// ─── API: Wakeup server ───────────────────────────────────────────────────────

export async function wakeupServer(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/wakeup`, { signal: AbortSignal.timeout(60_000) });
  } catch {
    // Intentionally ignored — processing will surface its own errors
  }
}

// ─── API: Stream process (SSE) ────────────────────────────────────────────────

function parseSseBuffer(
  buffer: string,
  onEvent: (event: ProcessingEvent) => void
): string {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const event: ProcessingEvent = JSON.parse(line.slice(6));
        onEvent(event);
      } catch {
        // skip malformed SSE line
      }
    }
  }
  return remainder;
}

export async function streamProcess(
  file: File,
  analysis: AnalysisResult,
  onEvent: (event: ProcessingEvent) => void
): Promise<void> {
  const headers = await authHeaders();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("analysis", JSON.stringify(analysis));

  const response = await fetch(`${BACKEND_URL}/api/process`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    let errorMsg = "Failed to connect to the processing server.";
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.error) {
        errorMsg = errorJson.error;
      }
    } catch {
      // not JSON
    }
    throw new Error(errorMsg);
  }

  if (!response.body) {
    throw new Error("Failed to connect to the processing server.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedEndEvent = false;

  const handleEventWrapped = (event: ProcessingEvent) => {
    if (event.step === "complete" || event.step === "error") {
      receivedEndEvent = true;
    }
    onEvent(event);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseBuffer(buffer, handleEventWrapped);
  }

  if (!receivedEndEvent) {
    throw new Error("Connection lost. The server might be busy or crashed. Please try again later.");
  }
}
