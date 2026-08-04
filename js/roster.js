import { generateId } from "./utils/id.js";
import { GROUP_PRESETS } from "./constants.js";

// Pure roster domain logic. No DOM/storage access here (see plan 9-1) —
// photo I/O and persistence are orchestrated by state.js so this module
// stays testable with plain arrays (plan 14-1).

export function createChild({ name, tags = [] }, { now = Date.now() } = {}) {
  return {
    childId: generateId("c"),
    name: name.trim(),
    tags: [...tags],
    photoRef: null,
    createdAt: new Date(now).toISOString(),
  };
}

export function upsertChild(children, child) {
  const idx = children.findIndex((c) => c.childId === child.childId);
  if (idx === -1) return [...children, child];
  const next = children.slice();
  next[idx] = child;
  return next;
}

export function removeChild(children, childId) {
  return children.filter((c) => c.childId !== childId);
}

export function getChildById(children, childId) {
  return children.find((c) => c.childId === childId);
}

export function searchRoster(children, query, tag) {
  const q = (query ?? "").trim().toLowerCase();
  return children.filter((c) => {
    const matchesTag = !tag || c.tags.includes(tag);
    if (!matchesTag) return false;
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q));
  });
}

export function listTags(children) {
  const set = new Set();
  for (const c of children) for (const t of c.tags) set.add(t);
  const presetOrder = GROUP_PRESETS.filter((g) => set.has(g));
  const others = [...set].filter((t) => !GROUP_PRESETS.includes(t)).sort((a, b) => a.localeCompare(b, "ja"));
  return [...presetOrder, ...others];
}
