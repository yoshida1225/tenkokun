import test from "node:test";
import assert from "node:assert/strict";
import { createChild, upsertChild, removeChild, getChildById, searchRoster, listTags } from "../js/roster.js";

test("createChild trims name and copies tags", () => {
  const child = createChild({ name: "  たろう  ", tags: ["ひまわり組"] }, { now: 0 });
  assert.equal(child.name, "たろう");
  assert.deepEqual(child.tags, ["ひまわり組"]);
  assert.equal(child.photoRef, null);
  assert.ok(child.childId.startsWith("c_"));
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
