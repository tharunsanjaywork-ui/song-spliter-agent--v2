const DB_NAME = "AudioWaveEditorDB";
const STORE_NAME = "project_session";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in browser environments."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface EditorSegment {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
}

export async function saveEditorSession(file: File | Blob, fileName: string, segments: EditorSegment[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(file, "audio_file");
    store.put(fileName, "file_name");
    store.put(segments, "segments");
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Failed to save editor session to IndexedDB:", err);
  }
}

export async function saveEditorSegments(segments: EditorSegment[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(segments, "segments");
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Failed to save editor segments to IndexedDB:", err);
  }
}

export async function loadEditorSession(): Promise<{ file: File | Blob; fileName: string; segments: EditorSegment[] } | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    const fileReq = store.get("audio_file");
    const fileNameReq = store.get("file_name");
    const segmentsReq = store.get("segments");
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (fileReq.result && fileNameReq.result && segmentsReq.result) {
      return {
        file: fileReq.result,
        fileName: fileNameReq.result,
        segments: segmentsReq.result,
      };
    }
  } catch (err) {
    console.error("Failed to load editor session from IndexedDB:", err);
  }
  return null;
}

export async function clearEditorSession(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Failed to clear editor session from IndexedDB:", err);
  }
}
