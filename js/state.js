import * as storage from "./storage.js";
import * as roster from "./roster.js";
import * as session from "./session.js";

const state = {
  roster: [],
  sessions: [],
  activeSession: null,
  settings: {},
  currentScreen: "home",
  screenParams: {},
  saveError: false,
};

const listeners = new Map();

export function getState() {
  return state;
}

export function subscribe(eventName, handler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

function notify(eventName, payload) {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const fn of [...set]) fn(payload);
}

function validateSessionShape(s) {
  return !!(s && typeof s.sessionId === "string" && Array.isArray(s.participants) && Array.isArray(s.checkpoints));
}

export async function init() {
  state.roster = storage.getRosterRaw();
  const rawActive = storage.getActiveSessionRaw();
  state.activeSession = validateSessionShape(rawActive) ? rawActive : null;
  state.sessions = storage.getSessionHistoryRaw();
  state.settings = storage.getSettingsRaw();
  await storage.requestPersistence();
}

// --- Roster ---

export async function saveChild({ childId, name, tags, photoBlob, removePhoto = false }) {
  const existing = childId ? roster.getChildById(state.roster, childId) : null;
  const child = existing
    ? { ...existing, name: name.trim(), tags: [...tags] }
    : roster.createChild({ name, tags });

  let photoError = false;
  if (removePhoto && existing?.photoRef) {
    await storage.deletePhoto(existing.photoRef);
    child.photoRef = null;
  }
  if (photoBlob) {
    const photoRef = `roster:${child.childId}`;
    const result = await storage.savePhoto(photoRef, photoBlob);
    if (result.ok) {
      child.photoRef = photoRef;
    } else {
      photoError = true;
    }
  }

  state.roster = roster.upsertChild(state.roster, child);
  const writeResult = storage.setRosterRaw(state.roster);
  notify("roster:changed");
  return { ok: writeResult.ok, child, photoError };
}

export function deleteChild(childId) {
  state.roster = roster.removeChild(state.roster, childId);
  const writeResult = storage.setRosterRaw(state.roster);
  storage.deletePhoto(`roster:${childId}`);
  notify("roster:changed");
  return { ok: writeResult.ok };
}

// --- Session ---

export async function startSession(participantIds) {
  const participants = participantIds
    .map((id) => roster.getChildById(state.roster, id))
    .filter(Boolean);

  const newSession = session.createSession(participants, { existingSessions: state.sessions });

  const photoFailedChildIds = [];
  await Promise.all(
    newSession.participants.map(async (p) => {
      const child = roster.getChildById(state.roster, p.childId);
      if (!child || !child.photoRef) return;
      const destRef = `session:${newSession.sessionId}:${p.childId}`;
      const result = await storage.copyPhoto(child.photoRef, destRef);
      if (result.ok) {
        p.photoSnapshot = destRef;
      } else {
        photoFailedChildIds.push(p.childId);
      }
    })
  );

  storage.setActiveSessionRaw(newSession);
  state.activeSession = newSession;
  notify("session:started", { photoFailedChildIds });
  return { ok: true, session: newSession, photoFailedChildIds };
}

let consecutiveSaveFailures = 0;

function persistActiveSession() {
  let result = storage.setActiveSessionRaw(state.activeSession);
  if (!result.ok) {
    result = storage.setActiveSessionRaw(state.activeSession); // immediate retry, plan 9-4
  }
  if (result.ok) {
    consecutiveSaveFailures = 0;
    if (state.saveError) {
      state.saveError = false;
      notify("saveError:changed", false);
    }
  } else {
    consecutiveSaveFailures += 1;
    if (consecutiveSaveFailures >= 2 && !state.saveError) {
      state.saveError = true;
      notify("saveError:changed", true);
    }
  }
  return result;
}

export function toggleConfirm(checkpointId, childId) {
  if (!state.activeSession) return;
  session.toggleConfirm(state.activeSession, checkpointId, childId);
  persistActiveSession();
  notify("session:changed");
}

export function confirmChild(checkpointId, childId) {
  if (!state.activeSession) return;
  session.confirmChild(state.activeSession, checkpointId, childId);
  persistActiveSession();
  notify("session:changed");
}

export function recordCheckpoint(checkpointId, opts) {
  if (!state.activeSession) return { ok: false };
  const result = session.recordCheckpoint(state.activeSession, checkpointId, opts);
  if (result.ok) {
    persistActiveSession();
    notify("session:changed");
  }
  return result;
}

export function addAdhocCheckpoint(label) {
  if (!state.activeSession) return null;
  const checkpoint = session.addAdhocCheckpoint(state.activeSession, label);
  persistActiveSession();
  notify("session:changed");
  return checkpoint;
}

export function addExitEvent(payload) {
  if (!state.activeSession) return;
  session.addExitEvent(state.activeSession, payload);
  persistActiveSession();
  notify("session:changed");
}

export function revokeExitEvent(childId) {
  if (!state.activeSession) return { ok: false };
  const result = session.revokeExitEvent(state.activeSession, childId);
  if (result.ok) {
    persistActiveSession();
    notify("session:changed");
  }
  return result;
}

export function endSession() {
  const activeSession = state.activeSession;
  if (!activeSession) return { ok: false };

  session.endSession(activeSession);
  const appendResult = storage.appendSessionHistoryRaw(activeSession);
  if (!appendResult.ok) {
    activeSession.status = "in_progress";
    activeSession.endedAt = null;
    return { ok: false, error: appendResult.error };
  }

  storage.setActiveSessionRaw(null);
  state.sessions = [activeSession, ...state.sessions];
  state.activeSession = null;
  consecutiveSaveFailures = 0;
  state.saveError = false;
  notify("session:ended");
  return { ok: true };
}

export function discardSession() {
  return endSession();
}

// --- Settings / screen ---

export function setCurrentScreen(screenId, params = {}) {
  state.currentScreen = screenId;
  state.screenParams = params;
  notify("screen:changed");
}

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  storage.setSettingsRaw(state.settings);
  notify("settings:changed");
}

export async function resetAll() {
  await storage.clearAll();
  state.roster = [];
  state.sessions = [];
  state.activeSession = null;
  state.settings = {};
  notify("roster:changed");
  notify("session:ended");
  notify("settings:changed");
}
