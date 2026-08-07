import test from "node:test";
import assert from "node:assert/strict";
import {
  matchChildName,
  matchFromResult,
  matchNameSequence,
  canAddAlias,
  resolveAliasConflicts,
  isLearnableTranscript,
  isPlausibleVoiceAlias,
  canon,
  MAX_ALIASES_PER_CHILD,
} from "../js/voice.js";

// The roster is hiragana full names (confirmed with the user). iOS speech
// recognition returns kanji for common names, which is why aliases exist.
function roster() {
  return [
    { childId: "c1", nameSnapshot: "やまだ はなこ" },
    { childId: "c2", nameSnapshot: "たなか たろう" },
    { childId: "c3", nameSnapshot: "すずき けん" },
  ];
}

test("matchChildName matches a full hiragana name", () => {
  assert.equal(matchChildName("やまだはなこ", roster()), "c1");
  assert.equal(matchChildName("やまだ はなこ", roster()), "c1");
});

test("matchChildName folds katakana transcripts to hiragana", () => {
  assert.equal(matchChildName("ヤマダハナコ", roster()), "c1");
  assert.equal(matchChildName("タナカ タロウ", roster()), "c2");
});

test("matchChildName strips honorifics", () => {
  assert.equal(matchChildName("はなこちゃん", roster()), "c1");
  assert.equal(matchChildName("たろうくん", roster()), "c2");
  assert.equal(matchChildName("やまだはなこさん", roster()), "c1");
  assert.equal(matchChildName("すずきけん君", roster()), "c3");
});

test("matchChildName strips punctuation and normalizes full-width", () => {
  assert.equal(matchChildName("やまだ、はなこ。", roster()), "c1");
  assert.equal(matchChildName("たなか・たろう!", roster()), "c2");
});

test("matchChildName matches on the given name alone", () => {
  assert.equal(matchChildName("はなこ", roster()), "c1");
  assert.equal(matchChildName("けん", roster()), "c3");
});

test("matchChildName returns null when the transcript is ambiguous", () => {
  const twins = [
    { childId: "c1", nameSnapshot: "やまだ はなこ" },
    { childId: "c2", nameSnapshot: "すずき はなこ" },
  ];
  assert.equal(matchChildName("はなこ", twins), null);

  const duplicates = [
    { childId: "c1", nameSnapshot: "やまだ はなこ" },
    { childId: "c2", nameSnapshot: "やまだ はなこ" },
  ];
  assert.equal(matchChildName("やまだはなこ", duplicates), null);
});

test("matchChildName returns null for an unknown or empty transcript", () => {
  assert.equal(matchChildName("さとう じろう", roster()), null);
  assert.equal(matchChildName("", roster()), null);
  assert.equal(matchChildName("   ", roster()), null);
  assert.equal(matchChildName(null, roster()), null);
});

test("matchChildName ignores participants with a blank name", () => {
  const withBlank = [{ childId: "c1", nameSnapshot: "" }, { childId: "c2", nameSnapshot: "たろう" }];
  assert.equal(matchChildName("たろう", withBlank), "c2");
});

// CHARACTERIZATION, not endorsement. The substring fallback means a short
// roster name matches inside a longer utterance, so a child registered as
// 「あや」is confirmed when someone says 「あやか」. Confirming the WRONG child
// is the worst failure this app can produce, so this is pinned deliberately:
// hardening it (e.g. requiring norm.length >= 3 for the target.includes
// direction) must break this test rather than ship unnoticed.
// Real risk is low today because the roster holds full names (やまだはなこ = 6
// chars), but it grows with roster size.
test("KNOWN RISK: a short roster name matches inside a longer utterance", () => {
  const short = [{ childId: "c1", nameSnapshot: "あや" }];
  assert.equal(matchChildName("あやか", short), "c1");
});

// SpeechRecognitionResult is array-like: { length, [i]: { transcript } }.
function fakeResult(...transcripts) {
  const result = { length: transcripts.length };
  transcripts.forEach((transcript, i) => {
    result[i] = { transcript };
  });
  return result;
}

test("matchFromResult walks alternatives until one matches uniquely", () => {
  const { childIds, transcript } = matchFromResult(fakeResult("さとうじろう", "やまだはなこ"), roster());
  assert.deepEqual(childIds, ["c1"]);
  assert.equal(transcript, "やまだはなこ");
});

test("matchFromResult reports the top alternative when nothing matches", () => {
  const { childIds, transcript } = matchFromResult(fakeResult("こんにちは", "さようなら"), roster());
  assert.deepEqual(childIds, []);
  assert.equal(transcript, "こんにちは");
});

test("matchFromResult tolerates an empty result without throwing", () => {
  const { childIds, transcript } = matchFromResult(fakeResult(), roster());
  assert.deepEqual(childIds, []);
  assert.equal(transcript, "");
});

test("matchFromResult reads a run of names as a list", () => {
  const { childIds } = matchFromResult(fakeResult("やまだはなこたなかたろうすずきけん"), roster());
  assert.deepEqual(childIds, ["c1", "c2", "c3"]);
});

// --- Aliases ---

function withAliases() {
  return [
    { childId: "c1", nameSnapshot: "やまだ はなこ", aliases: ["山田花子"] },
    { childId: "c2", nameSnapshot: "たなか たろう", aliases: [] },
    { childId: "c3", nameSnapshot: "すずき けん" }, // aliases key absent entirely
  ];
}

test("matchChildName matches a taught kanji alias", () => {
  assert.equal(matchChildName("山田花子", withAliases()), "c1");
});

test("honorific stripping and katakana folding apply to aliases too", () => {
  assert.equal(matchChildName("山田花子さん", withAliases()), "c1");
  const katakana = [{ childId: "c1", nameSnapshot: "みらい", aliases: ["やまだはなこ"] }];
  assert.equal(matchChildName("ヤマダハナコ", katakana), "c1");
});

test("a candidate without an aliases key still matches by name", () => {
  assert.equal(matchChildName("けん", withAliases()), "c3");
});

// Aliases are deliberately kept out of the substring tier: kanji aliases are
// 1-3 chars and would fire inside far too many utterances.
test("aliases match exactly, never as a substring", () => {
  const c = [{ childId: "c1", nameSnapshot: "みらい", aliases: ["花子"] }];
  assert.equal(matchChildName("山田花子", c), null);
});

// Load-bearing: uniqueness is counted by distinct childId, not entry count.
// Under entry-count uniqueness both of these would wrongly return null.
test("several matching forms of the SAME child count as one match", () => {
  const c = [{ childId: "c1", nameSnapshot: "はなこ", aliases: ["はなこ", "ハナコ"] }];
  assert.equal(matchChildName("はなこ", c), "c1");

  const acrossTiers = [{ childId: "c1", nameSnapshot: "やまだ はなこ", aliases: ["やまだはなこ"] }];
  assert.equal(matchChildName("やまだはなこ", acrossTiers), "c1");
});

test("matchChildName returns null when two children share an alias", () => {
  const c = [
    { childId: "c1", nameSnapshot: "やまだ はなこ", aliases: ["花子"] },
    { childId: "c2", nameSnapshot: "すずき はなこ", aliases: ["花子"] },
  ];
  assert.equal(matchChildName("花子", c), null);
});

test("matchChildName returns null when an alias equals another child's name", () => {
  const c = [
    { childId: "c1", nameSnapshot: "やまだ はなこ", aliases: ["たなかたろう"] },
    { childId: "c2", nameSnapshot: "たなか たろう" },
  ];
  assert.equal(matchChildName("たなかたろう", c), null);
});

test("blank aliases are ignored without throwing", () => {
  const c = [{ childId: "c1", nameSnapshot: "はなこ", aliases: ["", "   ", null] }];
  assert.equal(matchChildName("はなこ", c), "c1");
  assert.equal(matchChildName("", c), null);
});

// THE STEAL. This is the wrong-child bug that canAddAlias and
// resolveAliasConflicts exist to prevent: 「けん」 currently reaches c3 by
// substring, but an exact-matching alias on c1 wins the earlier tier and takes
// the utterance away. Pinned so that removing either guard fails loudly.
test("KNOWN HAZARD: an unguarded alias steals another child's substring match", () => {
  const c = [
    { childId: "c1", nameSnapshot: "みらい", aliases: ["けん"] },
    { childId: "c3", nameSnapshot: "すずき けん" },
  ];
  assert.equal(matchChildName("けん", c), "c1");
  // ...and the guard undoes it.
  assert.equal(matchChildName("けん", resolveAliasConflicts(c)), "c3");
});

// --- canAddAlias ---

test("canAddAlias accepts a kanji transcript for a child with no aliases", () => {
  const result = canAddAlias("山田花子", "c1", roster());
  assert.equal(result.ok, true);
  assert.equal(result.value, "山田花子");
});

test("canAddAlias allows a one-character kanji given name but not bare kana", () => {
  assert.equal(canAddAlias("舞", "c1", roster()).ok, true);
  assert.equal(canAddAlias("あ", "c1", roster()).reason, "tooShort");
});

test("canAddAlias rejects empty input", () => {
  assert.equal(canAddAlias("", "c1", roster()).reason, "empty");
  assert.equal(canAddAlias("   ", "c1", roster()).reason, "empty");
  assert.equal(canAddAlias(null, "c1", roster()).reason, "empty");
});

test("canAddAlias rejects the child's own name and its own existing aliases", () => {
  assert.equal(canAddAlias("やまだはなこ", "c1", roster()).reason, "duplicate");
  assert.equal(canAddAlias("やまだ はなこさん", "c1", roster()).reason, "duplicate");
  assert.equal(canAddAlias("山田花子", "c1", withAliases()).reason, "duplicate");
});

test("canAddAlias rejects anything overlapping another child's name", () => {
  const exact = canAddAlias("たなかたろう", "c1", roster());
  assert.equal(exact.reason, "conflict");
  assert.equal(exact.conflictChildId, "c2");

  // Contained IN another child's name.
  assert.equal(canAddAlias("たろう", "c1", roster()).conflictChildId, "c2");
  // Canon-equal after honorific stripping.
  assert.equal(canAddAlias("すずきけんくん", "c1", roster()).conflictChildId, "c3");
  // The steal case: would otherwise hijack c3's substring match.
  assert.equal(canAddAlias("けん", "c1", roster()).conflictChildId, "c3");
});

test("canAddAlias rejects an alias already owned by another child", () => {
  const result = canAddAlias("山田花子", "c2", withAliases());
  assert.equal(result.reason, "conflict");
  assert.equal(result.conflictChildId, "c1");
});

test("canAddAlias enforces length and count limits", () => {
  assert.equal(canAddAlias("山".repeat(21), "c1", roster()).reason, "tooLong");

  const full = roster();
  // Filled from the constant so raising the cap does not silently turn this
  // into a test of nothing.
  full[0].aliases = ["山田花子", ...Array.from({ length: MAX_ALIASES_PER_CHILD - 1 }, (_, i) => `華子${i}`)];
  assert.equal(full[0].aliases.length, MAX_ALIASES_PER_CHILD);
  assert.equal(canAddAlias("蓮", "c1", full).reason, "tooMany");
  // duplicate is reported ahead of tooMany, so re-adding says "already there"
  // rather than a confusing "too many".
  assert.equal(canAddAlias("山田花子", "c1", full).reason, "duplicate");
});

test("canAddAlias rejects an unknown child", () => {
  assert.equal(canAddAlias("山田花子", "cX", roster()).reason, "unknownChild");
});

// --- resolveAliasConflicts ---

test("resolveAliasConflicts drops an alias colliding with another child's name", () => {
  const c = [
    { childId: "c1", nameSnapshot: "みらい", aliases: ["たなかたろう", "山田花子"] },
    { childId: "c2", nameSnapshot: "たなか たろう" },
  ];
  assert.deepEqual(resolveAliasConflicts(c)[0].aliases, ["山田花子"]);
});

test("resolveAliasConflicts drops BOTH copies when two children claim one alias", () => {
  const c = [
    { childId: "c1", nameSnapshot: "やまだ はなこ", aliases: ["花子"] },
    { childId: "c2", nameSnapshot: "すずき はなこ", aliases: ["花子"] },
  ];
  const resolved = resolveAliasConflicts(c);
  assert.deepEqual(resolved[0].aliases, []);
  assert.deepEqual(resolved[1].aliases, []);
});

test("resolveAliasConflicts keeps an alias that only overlaps its OWN child's name", () => {
  const c = [{ childId: "c1", nameSnapshot: "やまだ はなこ", aliases: ["はなこ"] }];
  assert.deepEqual(resolveAliasConflicts(c)[0].aliases, ["はなこ"]);
});

test("resolveAliasConflicts leaves unrelated aliases alone and tolerates bad input", () => {
  assert.deepEqual(resolveAliasConflicts(withAliases())[0].aliases, ["山田花子"]);
  assert.deepEqual(resolveAliasConflicts(withAliases())[2].aliases, []);
  assert.deepEqual(resolveAliasConflicts([]), []);
  assert.deepEqual(resolveAliasConflicts(undefined), []);
  const messy = [{ childId: "c1", nameSnapshot: "はなこ", aliases: ["", null, "  "] }];
  assert.deepEqual(resolveAliasConflicts(messy)[0].aliases, []);
});

// --- isLearnableTranscript ---

test("isLearnableTranscript accepts kanji and katakana", () => {
  assert.equal(isLearnableTranscript("山田花子"), true);
  assert.equal(isLearnableTranscript("舞"), true);
  // A name the recognizer has no kanji spelling for comes back in katakana.
  assert.equal(isLearnableTranscript("ユート"), true);
  assert.equal(isLearnableTranscript("ハナコ"), true);
  assert.equal(isLearnableTranscript("ヤマダ ハナコ"), true);
  assert.equal(isLearnableTranscript("ハナコちゃん"), true);
  // Kana is kept as a CANDIDATE — whether it is really a mishearing of a name
  // cannot be known until a tile is tapped, and isPlausibleVoiceAlias decides
  // it there. So chatter passes this gate and is rejected at the next one.
  assert.equal(isLearnableTranscript("のんか"), true);
  assert.equal(isLearnableTranscript("こんにちは"), true);
  assert.equal(isLearnableTranscript("バスがきたよ"), true);
  // A lone kana is noise in any reading.
  assert.equal(isLearnableTranscript("あ"), false);
  assert.equal(isLearnableTranscript(""), false);
  assert.equal(isLearnableTranscript(null), false);
  // A whole sentence is not a name.
  assert.equal(isLearnableTranscript("今日は天気が良いので公園に行きましょうかね皆さん"), false);
  assert.equal(isLearnableTranscript("キョウハトテモイイテンキデスネミナサンオサンポニイキマショウ"), false);
});

test("a katakana alias matches the utterance that taught it", () => {
  // 「ユート」 canonicalizes to 「ゆと」, so it can never reach 「ゆうと」 on its
  // own — this is the whole reason katakana has to be learnable.
  const before = [{ childId: "c1", nameSnapshot: "ゆうと" }];
  assert.equal(matchChildName("ユート", before), null);

  const after = [{ childId: "c1", nameSnapshot: "ゆうと", aliases: ["ユート"] }];
  assert.equal(matchChildName("ユート", after), "c1");
  // Still matches the roster spelling, and still refuses the other child.
  assert.equal(matchChildName("ゆうと", after), "c1");
});

test("katakana honorifics are stripped like their hiragana spellings", () => {
  assert.equal(canon("ハナコチャン"), canon("はなこ"));
  assert.equal(canon("ヤマダサン"), canon("やまだ"));
  const candidates = [{ childId: "c1", nameSnapshot: "はなこ" }];
  assert.equal(matchChildName("ハナコチャン", candidates), "c1");
});

// --- matchNameSequence: several names in one utterance ---

// Aliases are how the kanji/katakana children get matched at all, so the list
// reading has to work on them too — that is the realistic shape of the bug.
function aliasRoster() {
  return [
    { childId: "c1", nameSnapshot: "やまだ はなこ", aliases: ["山田花子"] },
    { childId: "c2", nameSnapshot: "たなか たろう", aliases: ["田中太郎"] },
    { childId: "c3", nameSnapshot: "すずき けん", aliases: ["鈴木健"] },
  ];
}

test("matchNameSequence reads names run together in spoken order", () => {
  assert.deepEqual(matchNameSequence("たなかたろうやまだはなこ", roster()), ["c2", "c1"]);
  assert.deepEqual(matchNameSequence("山田花子田中太郎鈴木健", aliasRoster()), ["c1", "c2", "c3"]);
});

test("matchNameSequence tolerates the separators between names", () => {
  assert.deepEqual(matchNameSequence("山田花子、田中太郎", aliasRoster()), ["c1", "c2"]);
  assert.deepEqual(matchNameSequence("山田花子 と 田中太郎", aliasRoster()), ["c1", "c2"]);
  assert.deepEqual(matchNameSequence("山田花子ちゃん田中太郎くん", aliasRoster()), ["c1", "c2"]);
});

test("matchNameSequence refuses a single name, leaving it to the whole-transcript match", () => {
  // One hit is the match that already failed wearing a disguise — and this is
  // what keeps a short alias from firing inside ordinary speech.
  assert.deepEqual(matchNameSequence("山田花子", aliasRoster()), []);
  assert.deepEqual(matchNameSequence("舞い上がる", [{ childId: "c1", nameSnapshot: "まい", aliases: ["舞"] }]), []);
});

test("matchNameSequence refuses a sentence that merely contains names", () => {
  // Two real names, but far too much left over to be a roll call.
  assert.deepEqual(matchNameSequence("山田花子と田中太郎が公園で遊んでいます", aliasRoster()), []);
});

test("matchNameSequence lets the longest form claim the text", () => {
  const candidates = [
    { childId: "c1", nameSnapshot: "はなこ" },
    { childId: "c2", nameSnapshot: "やまだはなこ" },
    { childId: "c3", nameSnapshot: "たろう" },
  ];
  // 「やまだはなこ」 wins the span outright; 「はなこ」 never gets to claim it.
  assert.deepEqual(matchNameSequence("やまだはなこたろう", candidates), ["c2", "c3"]);
});

test("matchNameSequence drops a span that would be ambiguous on its own", () => {
  const candidates = [
    { childId: "c1", nameSnapshot: "けん" },
    { childId: "c2", nameSnapshot: "けん" },
    { childId: "c3", nameSnapshot: "たろう" },
  ];
  // Two children answer to 「けん」, so it confirms neither — and that leaves a
  // single name, which is not a list.
  assert.deepEqual(matchNameSequence("けんたろう", candidates), []);
});

test("matchNameSequence tolerates junk input", () => {
  assert.deepEqual(matchNameSequence("", roster()), []);
  assert.deepEqual(matchNameSequence(null, roster()), []);
  assert.deepEqual(matchNameSequence("こんにちは", roster()), []);
  assert.deepEqual(matchNameSequence("やまだはなこ", []), []);
});

test("matchNameSequence keeps the names it heard when one is mangled", () => {
  // Four called fast, the last one coming back as junk. Before the leftover
  // allowance scaled per name, that junk sank the whole utterance and
  // confirmed nobody — the reported "早口だと取りこぼす".
  const four = [...aliasRoster(), { childId: "c4", nameSnapshot: "さとう じろう", aliases: ["佐藤次郎"] }];
  assert.deepEqual(matchNameSequence("山田花子田中太郎鈴木健さとじろ", four), ["c1", "c2", "c3"]);
});

test("matchNameSequence requires a short alias to sit against another name", () => {
  const candidates = [
    { childId: "c1", nameSnapshot: "まい", aliases: ["舞"] },
    { childId: "c2", nameSnapshot: "けん", aliases: ["健"] },
  ];
  // Two children's aliases really are in there, but scattered through a
  // sentence — 「健」 in 「健太郎」 and 「舞」 in 「舞い上がる」.
  assert.deepEqual(matchNameSequence("健太郎が舞い上がる", candidates), []);
  // Flush together, the same two aliases are a roll call.
  assert.deepEqual(matchNameSequence("健と舞", candidates), ["c2", "c1"]);
});

test("matchFromResult takes the alternative that hears the most children", () => {
  // The top alternative is not always the fullest reading of a fast burst.
  const result = fakeResult("山田花子田中太郎", "山田花子田中太郎鈴木健");
  assert.deepEqual(matchFromResult(result, aliasRoster()).childIds, ["c1", "c2", "c3"]);
});

test("matchFromResult prefers a whole-transcript name over any list reading", () => {
  // One transcript that IS one name outranks a lower-confidence alternative
  // claiming the same audio was three children.
  const result = fakeResult("山田花子", "山田花子田中太郎鈴木健");
  assert.deepEqual(matchFromResult(result, aliasRoster()).childIds, ["c1"]);
});

// THE FOUR-NAME BUG. Calling four or more names confirmed exactly one of them.
// The transcript comes back with most names mangled; the one that survives is
// found by matchChildName's substring tier, which used to run BEFORE the list
// reading and short-circuit it. Pinned so the pass order cannot be casually
// reordered back.
test("matchFromResult does not let one surviving name pre-empt the list", () => {
  const four = [...aliasRoster(), { childId: "c4", nameSnapshot: "ようせい" }];
  // 「ようせい」 survives whole (substring tier would happily return c4 alone),
  // but two other children are in there too.
  const { childIds } = matchFromResult(fakeResult("山田花子田中太郎ようせい"), four);
  assert.deepEqual(childIds, ["c1", "c2", "c4"]);
});

test("matchFromResult still falls back to the substring tier alone", () => {
  // Nothing to make a list out of, so the vaguest evidence is all there is.
  const { childIds } = matchFromResult(fakeResult("やまだはなこです"), roster());
  assert.deepEqual(childIds, ["c1"]);
});

// --- isPlausibleVoiceAlias: the kana gate on the voice-taught path ---

test("isPlausibleVoiceAlias waves through kanji and katakana", () => {
  assert.equal(isPlausibleVoiceAlias("野々花", "ののか"), true);
  assert.equal(isPlausibleVoiceAlias("ノノカ", "ののか"), true);
  // Not even close to the name, but the script says "the recognizer rewrote a
  // name" and the caregiver is pointing at the child.
  assert.equal(isPlausibleVoiceAlias("山田花子", "ののか"), true);
});

test("isPlausibleVoiceAlias accepts a kana near-miss of the name", () => {
  // The reported problem: 「ののか」 comes back a character wrong and stays
  // untaught because the offer never appeared.
  assert.equal(isPlausibleVoiceAlias("のんか", "ののか"), true);
  assert.equal(isPlausibleVoiceAlias("ののが", "ののか"), true);
  // Measured against the given name too, not just the full roster spelling.
  assert.equal(isPlausibleVoiceAlias("はなご", "やまだ はなこ"), true);
  assert.equal(isPlausibleVoiceAlias("やまだはなご", "やまだ はなこ"), true);
});

test("isPlausibleVoiceAlias rejects kana that is just talk", () => {
  assert.equal(isPlausibleVoiceAlias("そうだね", "ののか"), false);
  assert.equal(isPlausibleVoiceAlias("こんにちは", "ののか"), false);
  assert.equal(isPlausibleVoiceAlias("バスがきたよ", "やまだ はなこ"), false);
  assert.equal(isPlausibleVoiceAlias("", "ののか"), false);
  assert.equal(isPlausibleVoiceAlias("のんか", ""), false);
});

// --- growing: reading an interim result the recognizer is still typing ---

test("growing mode refuses a name that is still on its way to a longer one", () => {
  const c = [
    { childId: "c1", nameSnapshot: "あや" },
    { childId: "c2", nameSnapshot: "あやか" },
  ];
  // 「あや」 is a whole name AND the first two characters of another. Mid-word
  // there is no way to tell which, so wait for the final.
  assert.deepEqual(matchFromResult(fakeResult("あや"), c, { growing: true }).childIds, []);
  // Settled, it is exactly one child.
  assert.deepEqual(matchFromResult(fakeResult("あや"), c).childIds, ["c1"]);
  // And the longer name is nobody's prefix, so it ticks straight away.
  assert.deepEqual(matchFromResult(fakeResult("あやか"), c, { growing: true }).childIds, ["c2"]);
});

test("growing mode drops the substring reading", () => {
  // 「やまだはなこ」 is in there, but so is the start of whatever comes next.
  assert.deepEqual(matchFromResult(fakeResult("やまだはなこです"), roster(), { growing: true }).childIds, []);
  assert.deepEqual(matchFromResult(fakeResult("やまだはなこです"), roster()).childIds, ["c1"]);
});

test("growing mode still ticks whole names and lists", () => {
  assert.deepEqual(matchFromResult(fakeResult("やまだはなこ"), roster(), { growing: true }).childIds, ["c1"]);
  const run = fakeResult("やまだはなこたなかたろう");
  assert.deepEqual(matchFromResult(run, roster(), { growing: true }).childIds, ["c1", "c2"]);
});
