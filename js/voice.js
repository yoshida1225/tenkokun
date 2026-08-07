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
//
// `substring: false` restricts it to tier 1, which is how matchFromResult asks
// "is this whole transcript exactly one name?" without tier 2 answering "well,
// one name is in there somewhere".
export function matchChildName(transcript, candidates, { substring = true } = {}) {
  const target = canon(transcript);
  if (!target) return null;

  const { names, aliases } = splitForms(candidates);

  // Tier 1: exact, over names AND aliases. Counted by DISTINCT childId rather
  // than entry count, because one child can have several forms that all
  // canonicalize to the target (name 「はなこ」 + alias 「ハナコ」).
  const exact = distinctIds([...names, ...aliases].filter((e) => e.norm === target));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  if (!substring) return null;

  // Tier 2: substring, over NAMES ONLY. Aliases are exact-only on purpose:
  // kanji aliases run 1-3 characters (「花子」「舞」) and in the substring tier
  // would fire inside 「立花」「花見に行こう」. Keeping them out yields the
  // invariant that no utterance which matched child X before aliases existed
  // can match child Y after — this feature is purely additive.
  const partial = distinctIds(names.filter((e) => target.includes(e.norm) || e.norm.includes(target)));
  return partial.length === 1 ? partial[0] : null;
}

// --- Several names in one breath ---
//
// Safari ends recognition after ONE utterance, so 「はなこ たろう けん」 called
// without pauses arrives as a single final result. Matched whole it is nobody
// — 「はなこたろうけん」 is not a name — so a caregiver rattling off a row of
// children got no response at all, which reads as the mic being broken.
//
// When the whole transcript fails, look for the candidate forms INSIDE it. The
// danger is the obvious one: hunting for 1-3 character kanji aliases inside a
// sentence is exactly how you confirm a child nobody mentioned. So every span
// found is handed back to matchChildName for the same ambiguity check a
// standalone utterance gets, and the whole reading is discarded unless it
// looks like a list of names and nothing else:
//   - at least TWO children, because a lone hit is the whole-transcript match
//     that just failed, wearing a disguise
//   - spans never overlap; the longest form claims the text first, so
//     「やまだはなこ」 beats a 「はなこ」 belonging to someone else
//   - a SHORT span (1-3 characters — the length a kanji alias runs, and the
//     only length that plausibly hides inside an unrelated word) must sit
//     right up against another name to count. 「舞」 and 「健」 are two children
//     in 「健太郎が舞い上がる」 and nowhere near each other; in
//     「山田花子鈴木健」 the 「鈴木健」 is flush against its neighbour.
//   - what remains after removing the names is at most two characters per
//     name, which is what separates 「はなこ<と>たろう」 from prose
//
// The leftover budget is per NAME rather than a flat cap on purpose. Called
// fast, a burst of four names usually comes back with three intact and one
// mangled into junk — and a flat cap meant that junk pushed the whole
// utterance over and confirmed NOBODY. Scaling the allowance keeps the three
// good names and just loses the fourth, which the caregiver can tap.
const SHORT_SPAN = 4;
const TIGHT_GAP = 2;
const SLACK_PER_NAME = 2;

export function matchNameSequence(transcript, candidates) {
  const target = canon(transcript);
  if (!target) return [];

  const { names, aliases } = splitForms(candidates);
  const spans = [];
  for (const form of [...names, ...aliases]) {
    // Overlapping occurrences are all collected; the claim loop below sorts
    // out which survive.
    for (let start = target.indexOf(form.norm); start >= 0; start = target.indexOf(form.norm, start + 1)) {
      spans.push({ childId: form.childId, start, end: start + form.norm.length });
    }
  }
  const width = (s) => s.end - s.start;
  spans.sort((a, b) => width(b) - width(a) || a.start - b.start);

  const claimed = [];
  for (const span of spans) {
    if (claimed.some((c) => span.start < c.end && c.start < span.end)) continue;
    // These characters have to stand on their own: if saying just them would
    // be ambiguous, they are no less ambiguous buried in a longer utterance.
    if (matchChildName(target.slice(span.start, span.end), candidates) !== span.childId) continue;
    claimed.push(span);
  }

  claimed.sort((a, b) => a.start - b.start);
  const kept = claimed.filter((span, i) => {
    if (width(span) >= SHORT_SPAN) return true;
    const prev = claimed[i - 1];
    const next = claimed[i + 1];
    return (prev && span.start - prev.end <= TIGHT_GAP) || (next && next.start - span.end <= TIGHT_GAP);
  });

  const ids = distinctIds(kept);
  if (ids.length < 2) return [];
  const covered = kept.reduce((sum, c) => sum + width(c), 0);
  if (target.length - covered > ids.length * SLACK_PER_NAME) return [];
  return ids;
}

// Three passes over the alternatives, in decreasing order of how much the
// evidence pins down.
//
// The ORDER is load-bearing. The obvious arrangement — take the first
// alternative that matches anything — is what made calling four or more names
// confirm only one of them. A four-name burst comes back as one long
// transcript with most of the names mangled; if a single name survives
// intact, matchChildName's substring tier finds it, reports that one child,
// and the list reading never runs. So the substring tier is demoted BELOW the
// list reading: it is the vaguest evidence here (a name is somewhere in
// there) and has no business outranking three names found in order.
//
//   1. exact whole transcript — the utterance IS one name, nothing beats it
//   2. list — the alternative finding the MOST children, because called fast
//      the top alternative often mangles a name a lower-ranked one heard
//   3. substring whole transcript — a name is in there somewhere
//
// Results are never combined across alternatives: they are competing readings
// of the SAME audio, so merging 「はなこ」 from one with 「はるこ」 from another
// would confirm two children for one spoken name. One reading wins whole.
export function matchFromResult(result, candidates) {
  const transcripts = [];
  for (let i = 0; i < result.length; i += 1) transcripts.push(result[i].transcript);

  for (const transcript of transcripts) {
    const childId = matchChildName(transcript, candidates, { substring: false });
    if (childId) return { childIds: [childId], transcript };
  }

  let best = null;
  for (const transcript of transcripts) {
    const sequence = matchNameSequence(transcript, candidates);
    if (sequence.length > (best?.childIds.length ?? 0)) best = { childIds: sequence, transcript };
  }
  if (best) return best;

  for (const transcript of transcripts) {
    const childId = matchChildName(transcript, candidates);
    if (childId) return { childIds: [childId], transcript };
  }

  return { childIds: [], transcript: transcripts[0] ?? "" };
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
