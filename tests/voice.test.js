import test from "node:test";
import assert from "node:assert/strict";
import { matchChildName, matchFromResult } from "../js/voice.js";

// The roster is hiragana full names (confirmed with the user), which is what
// makes text matching viable at all — there is no furigana field, so a kanji
// roster could never match a spoken transcript.
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
  const { childId, transcript } = matchFromResult(fakeResult("さとうじろう", "やまだはなこ"), roster());
  assert.equal(childId, "c1");
  assert.equal(transcript, "やまだはなこ");
});

test("matchFromResult reports the top alternative when nothing matches", () => {
  const { childId, transcript } = matchFromResult(fakeResult("こんにちは", "さようなら"), roster());
  assert.equal(childId, null);
  assert.equal(transcript, "こんにちは");
});

test("matchFromResult tolerates an empty result without throwing", () => {
  const { childId, transcript } = matchFromResult(fakeResult(), roster());
  assert.equal(childId, null);
  assert.equal(transcript, "");
});
