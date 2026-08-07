import test from "node:test";
import assert from "node:assert/strict";
import { sessionIdFromPhotoRef, selectOrphanPhotoRefs } from "../js/photoGc.js";

test("sessionIdFromPhotoRef extracts the session id from a well-formed ref", () => {
  assert.equal(sessionIdFromPhotoRef("session:s_20260807_01:c_mseb204wh8cs13"), "s_20260807_01");
});

test("sessionIdFromPhotoRef rejects roster refs and malformed input", () => {
  assert.equal(sessionIdFromPhotoRef("roster:c_mseb204wh8cs13"), null);
  assert.equal(sessionIdFromPhotoRef("session:"), null);
  assert.equal(sessionIdFromPhotoRef("session:s_20260807_01"), null);
  assert.equal(sessionIdFromPhotoRef("session:s_20260807_01:"), null);
  assert.equal(sessionIdFromPhotoRef("session:s_20260807_01:c1:extra"), null);
  assert.equal(sessionIdFromPhotoRef(""), null);
  assert.equal(sessionIdFromPhotoRef(null), null);
  assert.equal(sessionIdFromPhotoRef(undefined), null);
  assert.equal(sessionIdFromPhotoRef(42), null);
});

// The safety invariant this whole module exists to guarantee.
test("selectOrphanPhotoRefs never returns a roster photo", () => {
  const refs = [
    "roster:c_aaa",
    "roster:c_bbb",
    "session:s_20260101_01:c_aaa",
  ];
  const orphans = selectOrphanPhotoRefs(refs, { keepSessionIds: [] });
  assert.deepEqual(orphans, ["session:s_20260101_01:c_aaa"]);
  assert.ok(orphans.every((ref) => !ref.startsWith("roster:")));
});

test("selectOrphanPhotoRefs returns photos of sessions that have ended", () => {
  const refs = [
    "session:s_20260101_01:c_aaa",
    "session:s_20260102_01:c_bbb",
  ];
  assert.deepEqual(selectOrphanPhotoRefs(refs, { keepSessionIds: [] }), refs);
});

test("selectOrphanPhotoRefs keeps the active session's photos", () => {
  const refs = [
    "session:s_20260101_01:c_aaa",
    "session:s_20260807_03:c_bbb",
    "session:s_20260807_03:c_ccc",
  ];
  assert.deepEqual(selectOrphanPhotoRefs(refs, { keepSessionIds: ["s_20260807_03"] }), [
    "session:s_20260101_01:c_aaa",
  ]);
});

test("selectOrphanPhotoRefs ignores unknown prefixes and non-string entries", () => {
  const refs = ["thumb:c_aaa", "", "c_aaa", null, undefined, 7, {}, [], "session:s_1:c_1"];
  assert.deepEqual(selectOrphanPhotoRefs(refs, { keepSessionIds: [] }), ["session:s_1:c_1"]);
});

test("selectOrphanPhotoRefs tolerates a missing or non-array key list", () => {
  assert.deepEqual(selectOrphanPhotoRefs([]), []);
  assert.deepEqual(selectOrphanPhotoRefs(undefined), []);
  assert.deepEqual(selectOrphanPhotoRefs(null), []);
});
