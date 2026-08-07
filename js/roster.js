import { generateId } from "./utils/id.js";
import { GROUP_PRESETS, MAX_ALIASES_PER_CHILD } from "./constants.js";
import { canon } from "./utils/kana.js";

// Pure roster domain logic. No DOM/storage access here (see plan 9-1) —
// photo I/O and persistence are orchestrated by state.js so this module
// stays testable with plain arrays (plan 14-1).

export function createChild({ name, tags = [], voiceAliases = [] }, { now = Date.now() } = {}) {
  return {
    childId: generateId("c"),
    name: name.trim(),
    tags: [...tags],
    voiceAliases: [...voiceAliases],
    photoRef: null,
    createdAt: new Date(now).toISOString(),
  };
}

// --- Voice aliases ---
//
// What the speech recognizer actually returns for this child, e.g. 「山田花子」
// for a roster entry of 「やまだ はなこ」. Stored RAW so the chips stay legible
// and so improvements to canon() apply retroactively; compared by canon.
// Children created before this feature have no key, hence the ?? [] here.

export function getVoiceAliases(child) {
  return child?.voiceAliases ?? [];
}

export function addVoiceAlias(child, alias) {
  const raw = (alias ?? "").trim();
  const target = canon(raw);
  const current = getVoiceAliases(child);
  if (!target) return { ...child, voiceAliases: [...current] };
  if (current.some((a) => canon(a) === target)) return { ...child, voiceAliases: [...current] };
  if (current.length >= MAX_ALIASES_PER_CHILD) return { ...child, voiceAliases: [...current] };
  return { ...child, voiceAliases: [...current, raw] };
}

export function removeVoiceAlias(child, alias) {
  const target = canon(alias);
  return { ...child, voiceAliases: getVoiceAliases(child).filter((a) => canon(a) !== target) };
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
