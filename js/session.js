import { generateId, generateSessionId } from "./utils/id.js";

export { generateSessionId };

const PRESET_LABELS = ["出発前", "到着時", "出発時", "帰園時"];

// Pure session domain logic operating directly on a Session object (mutating,
// see plan 9-1). No DOM/storage access — state.js owns persistence.

export function createSession(participants, { now = Date.now(), existingSessions = [] } = {}) {
  const sessionId = generateSessionId(new Date(now), existingSessions);
  return {
    sessionId,
    startedAt: new Date(now).toISOString(),
    endedAt: null,
    status: "in_progress",
    participants: participants.map((c) => ({
      childId: c.childId,
      nameSnapshot: c.name,
      photoSnapshot: null,
    })),
    checkpoints: PRESET_LABELS.map((label, order) => makeCheckpoint(label, "preset", order)),
    exitEvents: [],
  };
}

function makeCheckpoint(label, kind, order) {
  return {
    checkpointId: generateId("cp"),
    label,
    kind,
    order,
    recordedAt: null,
    confirmedChildIds: [],
    unconfirmedChildIds: [],
    recordedWithWarning: false,
  };
}

export function activeParticipantIds(session, checkpointId) {
  const allIds = session.participants.map((p) => p.childId);
  const checkpoint = session.checkpoints.find((cp) => cp.checkpointId === checkpointId);
  if (!checkpoint) return allIds;

  if (checkpoint.recordedAt) {
    const recordedAtMs = new Date(checkpoint.recordedAt).getTime();
    const excluded = new Set(
      session.exitEvents
        .filter((e) => new Date(e.occurredAt).getTime() <= recordedAtMs)
        .map((e) => e.childId)
    );
    return allIds.filter((id) => !excluded.has(id));
  }

  const excluded = new Set(session.exitEvents.map((e) => e.childId));
  return allIds.filter((id) => !excluded.has(id));
}

export function toggleConfirm(session, checkpointId, childId) {
  const checkpoint = session.checkpoints.find((cp) => cp.checkpointId === checkpointId);
  if (!checkpoint) return;
  const idx = checkpoint.confirmedChildIds.indexOf(childId);
  if (idx === -1) checkpoint.confirmedChildIds.push(childId);
  else checkpoint.confirmedChildIds.splice(idx, 1);
}

// Unconditional confirm (not a toggle) so a re-recognized name from voice
// input can't accidentally un-confirm a child already checked off.
export function confirmChild(session, checkpointId, childId) {
  const checkpoint = session.checkpoints.find((cp) => cp.checkpointId === checkpointId);
  if (!checkpoint) return;
  if (!checkpoint.confirmedChildIds.includes(childId)) checkpoint.confirmedChildIds.push(childId);
}

export function recordCheckpoint(session, checkpointId, opts = {}) {
  const { allowUnconfirmed = false, now = Date.now() } = opts;
  const checkpoint = session.checkpoints.find((cp) => cp.checkpointId === checkpointId);
  if (!checkpoint) return { ok: false };

  const active = activeParticipantIds(session, checkpointId);
  const unconfirmed = active.filter((id) => !checkpoint.confirmedChildIds.includes(id));

  if (unconfirmed.length > 0 && !allowUnconfirmed) {
    return { ok: false, unconfirmedChildIds: unconfirmed };
  }

  checkpoint.recordedAt = new Date(now).toISOString();
  checkpoint.recordedWithWarning = unconfirmed.length > 0;
  checkpoint.unconfirmedChildIds = unconfirmed;
  return { ok: true, unconfirmedChildIds: unconfirmed };
}

export function addAdhocCheckpoint(session, label) {
  const order = session.checkpoints.length
    ? Math.max(...session.checkpoints.map((c) => c.order)) + 1
    : 0;
  const checkpoint = makeCheckpoint(label, "adhoc", order);
  session.checkpoints.push(checkpoint);
  return checkpoint;
}

export function addExitEvent(session, { childIds, reason, reasonNote = null, occurredAt }, opts = {}) {
  const { now = Date.now() } = opts;
  const ts = occurredAt ?? new Date(now).toISOString();
  for (const childId of childIds) {
    session.exitEvents.push({ childId, reason, reasonNote, occurredAt: ts });
    for (const cp of session.checkpoints) {
      if (cp.recordedAt) continue;
      const idx = cp.confirmedChildIds.indexOf(childId);
      if (idx !== -1) cp.confirmedChildIds.splice(idx, 1);
    }
  }
}

export function revokeExitEvent(session, childId) {
  for (let i = session.exitEvents.length - 1; i >= 0; i -= 1) {
    if (session.exitEvents[i].childId === childId) {
      session.exitEvents.splice(i, 1);
      return { ok: true };
    }
  }
  return { ok: false };
}

// Children flagged unconfirmed at some recorded checkpoint and not confirmed
// at any later-recorded checkpoint since (plan 3-4 "捜索導線").
export function computeCarriedOverUnconfirmed(session) {
  const recorded = [...session.checkpoints].filter((cp) => cp.recordedAt).sort((a, b) => a.order - b.order);
  const lastFlaggedOrder = new Map();
  const lastConfirmedOrder = new Map();
  for (const cp of recorded) {
    for (const id of cp.unconfirmedChildIds) lastFlaggedOrder.set(id, cp.order);
    for (const id of cp.confirmedChildIds) lastConfirmedOrder.set(id, cp.order);
  }
  const result = [];
  for (const [childId, flaggedOrder] of lastFlaggedOrder) {
    const confirmedOrder = lastConfirmedOrder.get(childId);
    if (confirmedOrder === undefined || confirmedOrder < flaggedOrder) result.push(childId);
  }
  return result;
}

export function endSession(session, opts = {}) {
  const { now = Date.now() } = opts;
  session.status = "ended";
  session.endedAt = new Date(now).toISOString();
}
