import test from "node:test";
import assert from "node:assert/strict";
import {
  createChild,
  upsertChild,
  removeChild,
  getChildById,
  searchRoster,
  listTags,
  addVoiceAlias,
  removeVoiceAlias,
  getVoiceAliases,
} from "../js/roster.js";
import { MAX_ALIASES_PER_CHILD } from "../js/constants.js";

test("createChild trims name and copies tags", () => {
  const child = createChild({ name: "  たろう  ", tags: ["ひまわり組"] }, { now: 0 });
  assert.equal(child.name, "たろう");
  assert.deepEqual(child.tags, ["ひまわり組"]);
  assert.equal(child.photoRef, null);
  assert.ok(child.childId.startsWith("c_"));
});

test("createChild starts with an empty voiceAliases list", () => {
  assert.deepEqual(createChild({ name: "たろう" }, { now: 0 }).voiceAliases, []);
});

test("addVoiceAlias returns a new object and leaves the original alone", () => {
  const child = createChild({ name: "やまだ はなこ" }, { now: 0 });
  const next = addVoiceAlias(child, "山田花子");
  assert.deepEqual(next.voiceAliases, ["山田花子"]);
  assert.deepEqual(child.voiceAliases, []);
});

test("addVoiceAlias dedupes by canon and keeps the first raw form", () => {
  let child = createChild({ name: "やまだ はなこ" }, { now: 0 });
  child = addVoiceAlias(child, "山田花子");
  child = addVoiceAlias(child, "山田 花子さん"); // same after canon
  assert.deepEqual(child.voiceAliases, ["山田花子"]);
});

test("addVoiceAlias ignores blank input and respects the cap", () => {
  let child = createChild({ name: "やまだ はなこ" }, { now: 0 });
  child = addVoiceAlias(child, "   ");
  assert.deepEqual(child.voiceAliases, []);

  // One more than the cap, derived from it so raising the cap keeps testing
  // the overflow rather than falling short of it.
  for (const a of Array.from({ length: MAX_ALIASES_PER_CHILD + 1 }, (_, i) => `山田花子${i}`)) {
    child = addVoiceAlias(child, a);
  }
  assert.equal(child.voiceAliases.length, MAX_ALIASES_PER_CHILD);
});

test("removeVoiceAlias matches by canon, so a raw variant also removes", () => {
  let child = addVoiceAlias(createChild({ name: "はなこ" }, { now: 0 }), "山田花子");
  child = removeVoiceAlias(child, "山田 花子ちゃん");
  assert.deepEqual(child.voiceAliases, []);
});

// Children saved before this feature have no voiceAliases key at all.
test("alias helpers tolerate a legacy child with no voiceAliases key", () => {
  const legacy = { childId: "c1", name: "はなこ", tags: [], photoRef: null };
  assert.deepEqual(getVoiceAliases(legacy), []);
  assert.deepEqual(addVoiceAlias(legacy, "山田花子").voiceAliases, ["山田花子"]);
  assert.deepEqual(removeVoiceAlias(legacy, "山田花子").voiceAliases, []);
});

test("upsertChild inserts new and updates existing", () => {
  const child = createChild({ name: "たろう", tags: [] }, { now: 0 });
  let roster = upsertChild([], child);
  assert.equal(roster.length, 1);

  const updated = { ...child, name: "たろう2" };
  roster = upsertChild(roster, updated);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].name, "たろう2");
});

test("removeChild and getChildById", () => {
  const a = createChild({ name: "A", tags: [] }, { now: 0 });
  const b = createChild({ name: "B", tags: [] }, { now: 1 });
  const roster = [a, b];
  assert.equal(getChildById(roster, b.childId).name, "B");
  const removed = removeChild(roster, a.childId);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].childId, b.childId);
});

test("searchRoster filters by name/tag substring and tag filter", () => {
  const roster = [
    createChild({ name: "たなか たろう", tags: ["ひまわり組"] }, { now: 0 }),
    createChild({ name: "やまだ はなこ", tags: ["うさぎ組"] }, { now: 1 }),
  ];
  assert.equal(searchRoster(roster, "たろう", null).length, 1);
  assert.equal(searchRoster(roster, "", "うさぎ組").length, 1);
  assert.equal(searchRoster(roster, "ひまわり", null).length, 1); // matches via tag substring
  assert.equal(searchRoster(roster, "", null).length, 2);
});

test("listTags dedupes and sorts", () => {
  const roster = [
    createChild({ name: "A", tags: ["b組", "a組"] }, { now: 0 }),
    createChild({ name: "B", tags: ["a組"] }, { now: 1 }),
  ];
  assert.deepEqual(listTags(roster), ["a組", "b組"]);
});
