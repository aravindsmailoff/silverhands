// Clientside IndexedDB cache for video studio progress and video files.
// Helps persist video files and creation state across page refreshes.

const DB_NAME = 'SilverHandsVideoStudio';
const STORE_NAME = 'studio_state';
const STATE_KEY = 'current_session';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is only available in the browser'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
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

export interface VideoCacheState {
  stage: string;
  sourceBlob?: Blob | null;
  uploadFileName?: string;
  sessionId?: string | null;
  suggestions?: string[];
  subject?: string;
  selectedMode?: string;
  focusTopic?: string;
  jobId?: string | null;
  clips?: any[];
  activeClip?: number;
  saved?: boolean;
}

export async function saveVideoState(state: VideoCacheState): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state, STATE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to save video state to IndexedDB cache:', err);
  }
}

export async function loadVideoState(): Promise<VideoCacheState | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to load video state from IndexedDB cache:', err);
    return null;
  }
}

export async function clearVideoState(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(STATE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to clear video state from IndexedDB cache:', err);
  }
}
