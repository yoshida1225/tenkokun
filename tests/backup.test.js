import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../js/utils/csv.js";
import {
  validateBackupShape,
  buildSessionCsvRows,
  buildHistoryCsvRows,
  normalizeBackupChild,
} from "../js/backup.js";
import { createSession, toggleConfirm, recordCheckpoint, addExitEvent } from "../js/session.js";
import { MAX_ALIASES_PER_CHILD } from "../js/constants.js";

test("toCsv escapes quotes and joins with CRLF", () => {
  const csv = toCsv([
    ["名前", "備考"],
    ['田中"太郎"', "ok"],
  ]);
  assert.equal(csv, '"名前","備考"\r\n"田中""太郎""","ok"');
});

test("validateBackupShape rejects malformed or foreign JSON", () => {
  assert.equal(validateBackupShape({ schemaVersion: 1, roster: [] }), true);
  assert.equal(validateBackupShape({ roster: [] }), false);
  assert.equal(validateBackupShape({ schemaVersion: 1 }), false);
  assert.equal(validateBackupShape(null), false);
  assert.equal(validateBackupShape("not an object"), false);
});

// Export spreads the whole child, so the round-trip only breaks on import.
test("normalizeBackupChild preserves voiceAliases", () => {
  const child = normalizeBackupChild({
    childId: "c1",
    name: "やまだ はなこ",
    tags: ["くるみ"],
    voiceAliases: ["山田花子"],
  });
  assert.deepEqual(child.voiceAliases, ["山田花子"]);
  assert.deepEqual(child.tags, ["くるみ"]);
  assert.equal(child.photoRef, null);
});

test("normalizeBackupChild defaults voiceAliases for older backups", () => {
  assert.deepEqual(normalizeBackupChild({ childId: "c1", name: "はなこ" }).voiceAliases, []);
  assert.deepEqual(
    normalizeBackupChild({ childId: "c1", name: "はなこ", voiceAliases: "nope" }).voiceAliases,
    []
  );
  assert.deepEqual(
    normalizeBackupChild({ childId: "c1", name: "はなこ", voiceAliases: 42 }).voiceAliases,
    []
  );
});

test("normalizeBackupChild filters junk entries and caps the alias list", () => {
  const messy = normalizeBackupChild({
    childId: "c1",
    name: "はなこ",
    voiceAliases: [1, "", "   ", null, "山田花子", { a: 1 }],
  });
  assert.deepEqual(messy.voiceAliases, ["山田花子"]);

  const overflowing = normalizeBackupChild({
    childId: "c1",
    name: "はなこ",
    voiceAliases: Array.from({ length: MAX_ALIASES_PER_CHILD + 2 }, (_, i) => `別名${i}`),
  });
  assert.equal(overflowing.voiceAliases.length, MAX_ALIASES_PER_CHILD);
});

test("normalizeBackupChild rejects rows without an id or name", () => {
  assert.equal(normalizeBackupChild({ name: "はなこ" }), null);
  assert.equal(normalizeBackupChild({ childId: "c1" }), null);
  assert.equal(normalizeBackupChild(null), null);
});

test("buildSessionCsvRows includes recorded checkpoints and exit events", () => {
  const now = new Date("2026-08-04T09:00:00+09:00").getTime();
  const session = createSession([{ childId: "c1", name: "たろう" }, { childId: "c2", name: "はなこ" }], { now });
  const cp1 = session.checkpoints[0];
  toggleConfirm(session, cp1.checkpointId, "c1");
  toggleConfirm(session, cp1.checkpointId, "c2");
  recordCheckpoint(session, cp1.checkpointId, { now });
  addExitEvent(session, { childIds: ["c2"], reason: "pickup" }, { now: now + 1000 });

  const rows = buildSessionCsvRows(session);
  assert.equal(rows[0][0], "チェックポイント");
  const recordedRow = rows.find((r) => r[0] === "出発前");
  assert.ok(recordedRow);
  assert.equal(recordedRow[2], "2/2");
  const exitRow = rows.find((r) => r[0] === "はなこ");
  assert.ok(exitRow);
  assert.equal(exitRow[2], "お迎え");
});

test("buildSessionCsvRows skips unrecorded checkpoints", () => {
  const now = Date.now();
  const session = createSession([{ childId: "c1", name: "A" }], { now });
  const rows = buildSessionCsvRows(session);
  assert.equal(rows.length, 3); // header + blank + exit header only, no checkpoint rows recorded
});

test("buildHistoryCsvRows aggregates recorded checkpoints across sessions", () => {
  const now = Date.now();
  const s1 = createSession([{ childId: "c1", name: "A" }], { now });
  toggleConfirm(s1, s1.checkpoints[0].checkpointId, "c1");
  recordCheckpoint(s1, s1.checkpoints[0].checkpointId, { now });

  const rows = buildHistoryCsvRows([s1]);
  assert.equal(rows.length, 2); // header + 1 recorded checkpoint row
});
