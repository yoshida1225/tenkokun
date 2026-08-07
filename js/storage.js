const LS_KEYS = {
  roster: "tenkokun:roster",
  activeSession: "tenkokun:activeSession",
  sessionHistory: "tenkokun:sessionHistory",
  settings: "tenkokun:settings",
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error("readJSON failed", key, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    console.error("writeJSON failed", key, err);
    return { ok: false, error: err };
  }
}

export function getRosterRaw() {
  return readJSON(LS_KEYS.roster, []);
}

export function setRosterRaw(children) {
  return writeJSON(LS_KEYS.roster, children);
}

export function getActiveSessionRaw() {
  return readJSON(LS_KEYS.activeSession, null);
}

export function setActiveSessionRaw(session) {
  return writeJSON(LS_KEYS.activeSession, session);
}

export function getSessionHistoryRaw() {
  return readJSON(LS_KEYS.sessionHistory, []);
}

export function appendSessionHistoryRaw(session) {
  const history = getSessionHistoryRaw();
  history.push(session);
  return writeJSON(LS_KEYS.sessionHistory, history);
}

export function getSettingsRaw() {
  return readJSON(LS_KEYS.settings, {});
}

export function setSettingsRaw(settings) {
  return writeJSON(LS_KEYS.settings, settings);
}

// --- IndexedDB (photos) ---
const DB_NAME = "tenkokun-db";
const DB_VERSION = 1;
const STORE_PHOTOS = "photos";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 1) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: "photoRef" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function savePhoto(photoRef, blob) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, "readwrite");
      tx.objectStore(STORE_PHOTOS).put({ photoRef, blob });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return { ok: true };
  } catch (err) {
    console.error("savePhoto failed", photoRef, err);
    return { ok: false, error: err };
  }
}

export async function getPhoto(photoRef) {
  try {
    const db = await openDB();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, "readonly");
      const req = tx.objectStore(STORE_PHOTOS).get(photoRef);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return record ? record.blob : null;
  } catch (err) {
    console.error("getPhoto failed", photoRef, err);
    return null;
  }
}

export async function deletePhoto(photoRef) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, "readwrite");
      tx.objectStore(STORE_PHOTOS).delete(photoRef);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("deletePhoto failed", photoRef, err);
  }
}

// Every photo key currently stored. Returns [] rather than throwing so a
// failure here can only skip a cleanup pass, never break startup.
export async function getAllPhotoRefs() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, "readonly");
      const req = tx.objectStore(STORE_PHOTOS).getAllKeys();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("getAllPhotoRefs failed", err);
    return [];
  }
}

// Chunked because a single readwrite transaction over hundreds of keys can
// hold the IDB connection long enough to stall tile photo loads on an iPhone.
export async function deletePhotos(photoRefs) {
  if (!photoRefs?.length) return { ok: true, deleted: 0 };
  const CHUNK = 100;
  let deleted = 0;
  try {
    const db = await openDB();
    for (let i = 0; i < photoRefs.length; i += CHUNK) {
      const chunk = photoRefs.slice(i, i + CHUNK);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PHOTOS, "readwrite");
        const store = tx.objectStore(STORE_PHOTOS);
        for (const ref of chunk) store.delete(ref);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      deleted += chunk.length;
    }
    return { ok: true, deleted };
  } catch (err) {
    console.error("deletePhotos failed", err);
    return { ok: false, deleted, error: err };
  }
}

export async function copyPhoto(srcRef, destRef) {
  const blob = await getPhoto(srcRef);
  if (!blob) return { ok: false };
  return savePhoto(destRef, blob);
}

export async function getPhotoObjectURL(photoRef) {
  const blob = await getPhoto(photoRef);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function estimateStorageUsage() {
  if (!navigator.storage || !navigator.storage.estimate) return { usageBytes: 0, quotaBytes: 0 };
  const { usage, quota } = await navigator.storage.estimate();
  return { usageBytes: usage ?? 0, quotaBytes: quota ?? 0 };
}

export async function clearAll() {
  localStorage.removeItem(LS_KEYS.roster);
  localStorage.removeItem(LS_KEYS.activeSession);
  localStorage.removeItem(LS_KEYS.sessionHistory);
  localStorage.removeItem(LS_KEYS.settings);
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTOS, "readwrite");
      tx.objectStore(STORE_PHOTOS).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("clearAll photos failed", err);
  }
}

export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
