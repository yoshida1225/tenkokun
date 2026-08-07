// Voice matching for roll call confirmation. An assist alongside tap, never a
// replacement for it.
//
// The roster stores hiragana names, but iOS speech recognition rewrites them:
// KANJI for a name it knows (「やまだ はなこ」 vs 「山田花子」) and bare KATAKANA
// for one it does not (「ゆうと」 vs 「ユート」). Neither can be relied on to
// match as text — hence "some children work, some never do". A reading
// is far too heavy for an offline PWA, so instead the caregiver teaches the
// app what the recognizer actually says: per-child `voiceAliases`, matched
// exactly. See canAddAlias/resolveAliasConflicts for the safety rules.

import { canon, containsKanji, isKatakanaOnly } from "./utils/kana.js";
import { MAX_ALIASES_PER_CHILD, MAX_ALIAS_LENGTH } from "./constants.js";

export { canon, containsKanji, isKatakanaOnly, MAX_ALIASES_PER_CHILD, MAX_ALIAS_LENGTH };

const RecognitionCtor =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function isSupported() {
  return !!RecognitionCtor;
}

// A short environment fingerprint appended to terminal failure messages.
// There is no devtools on an iPhone, so without this a caregiver reporting
// "it doesn't work" gives us nothing to act on. Kept terse enough to read off
// a toast: e.g. "webkit/standalone/secure".
export function diagnostics() {
  const ctor = window.SpeechRecognition ? "standard" : window.webkitSpeechRecognition ? "webkit" : "none";
  const display = window.navigator?.standalone ? "standalone" : "browser";
  const secure = window.isSecureContext ? "secure" : "insecure";
  return `${ctor}/${display}/${secure}`;
}

// continuous:true asks for one final result per utterance instead of stopping
// after the first. Safari does NOT honour it — it ends after a single
// utterance regardless — so the caller must restart on `end` to keep listening.
// See startRecognitionCycle/scheduleRestart in ui/screenSession.js.
export function createRecognition() {
  const recognition = new RecognitionCtor();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 5;
  return recognition;
}

// --- Matching ---
//
// Candidates are { childId, nameSnapshot, aliases?: string[] }. Names come
// from the session snapshot (evidence, frozen per walk); aliases come from the
// live roster (configuration, not evidence) — see screenSession.js.

const overlaps = (a, b) => a === b || a.includes(b) || b.includes(a);

const distinctIds = (entries) => [...new Set(entries.map((e) => e.childId))];

function splitForms(candidates) {
  const names = [];
  const aliases = [];
  for (const c of candidates ?? []) {
    const n = canon(c.nameSnapshot);
    if (n) names.push({ childId: c.childId, norm: n });
    for (const a of c.aliases ?? []) {
      const an = canon(a);
      if (an) aliases.push({ childId: c.childId, norm: an });
    }
  }
  return { names, aliases };
}

// Returns a childId only on an unambiguous hit — ties resolve to "no match" so
// a mishearing never confirms the wrong child.
export function matchChildName(transcript, candidates) {
  const target = canon(transcript);
  if (!target) return null;

  const { names, aliases } = splitForms(candidates);

  // Tier 1: exact, over names AND aliases. Counted by DISTINCT childId rather
  // than entry count, because one child can have several forms that all
  // canonicalize to the target (name 「はなこ」 + alias 「ハナコ」).
  const exact = distinctIds([...names, ...aliases].filter((e) => e.norm === target));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  // Tier 2: substring, over NAMES ONLY. Aliases are exact-only on purpose:
  // kanji aliases run 1-3 characters (「花子」「舞」) and in the substring tier
  // would fire inside 「立花」「花見に行こう」. Keeping them out yields the
  // invariant that no utterance which matched child X before aliases existed
  // can match child Y after — this feature is purely additive.
  const partial = distinctIds(names.filter((e) => target.includes(e.norm) || e.norm.includes(target)));
  return partial.length === 1 ? partial[0] : null;
}

// Tries each speech-recognition alternative in confidence order until one
// uniquely matches a participant.
export function matchFromResult(result, candidates) {
  for (let i = 0; i < result.length; i += 1) {
    const transcript = result[i].transcript;
    const childId = matchChildName(transcript, candidates);
    if (childId) return { childId, transcript };
  }
  return { childId: null, transcript: result[0]?.transcript ?? "" };
}

// --- Alias safety ---

// Whether a failed transcript is worth offering to remember. Two shapes
// qualify, both confirmed failure modes of a hiragana roster:
//   kanji         — the recognizer knows the name and writes it 「山田花子」
//   all katakana  — it does not know the name and spells the sound 「ユート」,
//                   which misses whenever the reading is not letter-for-letter
//                   the roster spelling
// A miss written in HIRAGANA is still refused: hiragana matches the roster
// natively, so a hiragana miss is playground chatter or a genuine mishearing,
// and neither belongs in permanent config. Those can still be added by hand
// from the child edit screen.
export function isLearnableTranscript(transcript) {
  const raw = (transcript ?? "").trim();
  if (!raw || raw.length > MAX_ALIAS_LENGTH) return false;
  if (!containsKanji(raw) && !isKatakanaOnly(raw)) return false;
  return canon(raw).length > 0;
}

// Can `alias` be attached to `childId` without creating an ambiguity?
//
// Failing to learn costs one tap. Learning a wrong alias silently mis-routes
// every future utterance of that name, permanently, and nobody thinks to go
// look at the alias list. So this rejects on any doubt.
//
// The rule is asymmetric because the two form types live in different tiers:
//   vs other children's NAMES   — reject on overlap in EITHER direction,
//                                 because names are in the substring tier. An
//                                 alias 「けん」 would otherwise steal every
//                                 utterance from a child named 「すずき けん」.
//   vs other children's ALIASES — reject on exact match only, since aliases
//                                 are exact-only. 「花子」→A and 「山田花子」→B
//                                 coexist safely.
export function canAddAlias(alias, childId, candidates) {
  const list = candidates ?? [];
  const self = list.find((c) => c.childId === childId);
  if (!self) return { ok: false, reason: "unknownChild" };

  const raw = (alias ?? "").trim();
  if (raw.length > MAX_ALIAS_LENGTH) return { ok: false, reason: "tooLong" };

  const a = canon(raw);
  if (!a) return { ok: false, reason: "empty" };
  // One character is fine for a kanji given name (「舞」「蓮」「葵」) but a bare
  // kana is noise.
  if (a.length < 2 && !containsKanji(a)) return { ok: false, reason: "tooShort" };

  const ownAliases = self.aliases ?? [];
  if (a === canon(self.nameSnapshot) || ownAliases.some((x) => canon(x) === a)) {
    return { ok: false, reason: "duplicate" };
  }
  if (ownAliases.length >= MAX_ALIASES_PER_CHILD) return { ok: false, reason: "tooMany" };

  for (const c of list) {
    if (c.childId === childId) continue;
    const n = canon(c.nameSnapshot);
    if (n && overlaps(a, n)) return { ok: false, reason: "conflict", conflictChildId: c.childId };
    if ((c.aliases ?? []).some((x) => canon(x) === a)) {
      return { ok: false, reason: "conflict", conflictChildId: c.childId };
    }
  }

  return { ok: true, value: raw, canon: a };
}

// Drops any alias that would be ambiguous against the CURRENT candidate set.
// canAddAlias guards the moment of teaching; this guards everything after — a
// child added to the roster later, or aliases restored from a backup taken
// with a different roster, can reintroduce a collision that was impossible
// when the alias was first saved.
export function resolveAliasConflicts(candidates) {
  const list = candidates ?? [];
  const names = list
    .map((c) => ({ childId: c.childId, norm: canon(c.nameSnapshot) }))
    .filter((e) => e.norm);

  const owners = new Map(); // canon alias -> Set<childId>
  for (const c of list) {
    for (const a of c.aliases ?? []) {
      const an = canon(a);
      if (!an) continue;
      if (!owners.has(an)) owners.set(an, new Set());
      owners.get(an).add(c.childId);
    }
  }

  return list.map((c) => ({
    ...c,
    aliases: (c.aliases ?? []).filter((a) => {
      const an = canon(a);
      if (!an) return false;
      if (owners.get(an).size > 1) return false; // two children claim it
      return !names.some((n) => n.childId !== c.childId && overlaps(an, n.norm));
    }),
  }));
}
