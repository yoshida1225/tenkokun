import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  activeParticipantIds,
  toggleConfirm,
  recordCheckpoint,
  addAdhocCheckpoint,
  addExitEvent,
  revokeExitEvent,
  endSession,
  generateSessionId,
  computeCarriedOverUnconfirmed,
} from "../js/session.js";

const NOW = new Date("2026-08-04T09:00:00+09:00").getTime();

function makeChildren() {
  return [
    { childId: "c1", name: "たろう" },
    { childId: "c2", name: "はなこ" },
    { childId: "c3", name: "けん" },
  ];
}

test("createSession builds 4 preset checkpoints and participant snapshots", () => {
  const session = createSession(makeChildren(), { now: NOW });
  assert.equal(session.checkpoints.length, 4);
  assert.deepEqual(
    session.checkpoints.map((c) => c.label),
    ["出発前", "到着時", "出発時", "帰園時"]
  );
  assert.equal(session.participants.length, 3);
  assert.equal(session.status, "in_progress");
});

test("generateSessionId assigns sequential numbers within the same day", () => {
  const date = new Date("2026-08-04T09:00:00+09:00");
  const first = generateSessionId(date, []);
  assert.equal(first, "s_20260804_01");
  const second = generateSessionId(date, [{ sessionId: first }]);
  assert.equal(second, "s_20260804_02");
});

test("recordCheckpoint blocks when someone is unconfirmed unless allowUnconfirmed", () => {
  const session = createSession(makeChildren(), { now: NOW });
  const cpId = session.checkpoints[0].checkpointId;
  toggleConfirm(session, cpId, "c1");

  const blocked = recordCheckpoint(session, cpId, { now: NOW });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.unconfirmedChildIds.sort(), ["c2", "c3"]);
  assert.equal(session.checkpoints[0].recordedAt, null);

  const forced = recordCheckpoint(session, cpId, { allowUnconfirmed: true, now: NOW });
  assert.equal(forced.ok, true);
  assert.equal(session.checkpoints[0].recordedWithWarning, true);
  assert.deepEqual(session.checkpoints[0].unconfirmedChildIds.sort(), ["c2", "c3"]);
});

test("途中退出した子は未記録チェックポイントの母数から除外される", () => {
  const session = createSession(makeChildren(), { now: NOW });
  const [cp1, cp2] = session.checkpoints;

  addExitEvent(session, { childIds: ["c2"], reason: "pickup" }, { now: NOW + 1000 });

  assert.deepEqual(activeParticipantIds(session, cp2.checkpointId).sort(), ["c1", "c3"]);
  // cp1 not yet recorded, so exit also excludes c2 from it (still-open checkpoint)
  assert.deepEqual(activeParticipantIds(session, cp1.checkpointId).sort(), ["c1", "c3"]);
});

test("退出前に記録済みのチェックポイントは分母を遡って変更しない", () => {
  const session = createSession(makeChildren(), { now: NOW });
  const [cp1, cp2] = session.checkpoints;

  toggleConfirm(session, cp1.checkpointId, "c1");
  toggleConfirm(session, cp1.checkpointId, "c2");
  toggleConfirm(session, cp1.checkpointId, "c3");
  recordCheckpoint(session, cp1.checkpointId, { now: NOW });

  addExitEvent(session, { childIds: ["c2"] , reason: "pickup" }, { now: NOW + 60000 });

  // cp1 was recorded before the exit event -> its snapshot of 3 participants stays intact
  assert.deepEqual(activeParticipantIds(session, cp1.checkpointId).sort(), ["c1", "c2", "c3"]);
  // cp2 has not been recorded yet -> reflects the exit
  assert.deepEqual(activeParticipantIds(session, cp2.checkpointId).sort(), ["c1", "c3"]);
});

test("revokeExitEvent restores the child to future checkpoints", () => {
  const session = createSession(makeChildren(), { now: NOW });
  const cp2 = session.checkpoints[1];
  addExitEvent(session, { childIds: ["c3"], reason: "other", reasonNote: "test" }, { now: NOW });

  assert.deepEqual(activeParticipantIds(session, cp2.checkpointId).sort(), ["c1", "c2"]);

  const result = revokeExitEvent(session, "c3");
  assert.equal(result.ok, true);
  assert.deepEqual(activeParticipantIds(session, cp2.checkpointId).sort(), ["c1", "c2", "c3"]);
  assert.equal(revokeExitEvent(session, "c3").ok, false);
});

test("addAdhocCheckpoint appends a checkpoint after existing ones", () => {
  const session = createSession(makeChildren(), { now: NOW });
  const cp = addAdhocCheckpoint(session, "公園にて");
  assert.equal(session.checkpoints.length, 5);
  assert.equal(cp.kind, "adhoc");
  assert.equal(cp.order, 4);
});

test("endSession sets status and endedAt", () => {
  const session = createSession(makeChildren(), { now: NOW });
  endSession(session, { now: NOW + 5000 });
  assert.equal(session.status, "ended");
  assert.ok(session.endedAt);
});

test("computeCarriedOverUnconfirmed tracks unresolved unconfirmed children across checkpoints", () => {
  const session = createSession(makeChildren(), { now: NOW });
  const [cp1, cp2] = session.checkpoints;

  toggleConfirm(session, cp1.checkpointId, "c1");
  recordCheckpoint(session, cp1.checkpointId, { allowUnconfirmed: true, now: NOW });
  assert.deepEqual(computeCarriedOverUnconfirmed(session).sort(), ["c2", "c3"]);

  toggleConfirm(session, cp2.checkpointId, "c2");
  toggleConfirm(session, cp2.checkpointId, "c1");
  toggleConfirm(session, cp2.checkpointId, "c3");
  recordCheckpoint(session, cp2.checkpointId, { now: NOW + 1000 });

  assert.deepEqual(computeCarriedOverUnconfirmed(session), []);
});
