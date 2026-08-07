// Japanese text normalization shared by the voice matcher and the roster.
// Lives apart from voice.js because that module reads `window` at load time,
// while roster.js needs canon() to dedupe aliases under Node.

// Honorifics are stripped so 「はなこちゃん」 and 「はなこ」 are one form. The
// katakana spellings are here too because the recognizer writes a name it does
// not know in katakana and carries the honorific along with it 「ハナコチャン」.
// The long-vowel mark is stripped too, folding 「ゆーこ」 into 「ゆうこ」-ish shapes.
const STRIP_PATTERN = /[\s、。,.!?！？・\-ー]|さん|ちゃん|くん|君|サン|チャン|クン/g;

function normalize(str) {
  return (str || "").normalize("NFKC").replace(STRIP_PATTERN, "").toLowerCase();
}

function toHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// The single comparison form for every name and alias in the app. Names and
// aliases are always STORED raw and canonicalized at comparison time, so
// improvements here apply retroactively to data already saved.
export function canon(str) {
  return toHiragana(normalize(str));
}

// Covers the CJK ideograph ranges plus 々 (repeat), 〇, and 〻. Used to decide
// whether a failed transcript is worth offering to learn: the confirmed cause
// of non-matching children is the recognizer returning kanji for a kana
// roster, so a kanji-free miss is ambient speech, not a reading we want to
// remember forever.
const KANJI = /[々〇〻㐀-䶿一-鿿豈-﫿]/;

export function containsKanji(str) {
  return KANJI.test(str ?? "");
}

// The other shape an unrecognized name comes back in. Where a name the
// recognizer knows becomes kanji 「山田花子」, one it does not know at all comes
// back as bare katakana 「ユート」 — and that spelling can miss the hiragana
// roster whenever the reading is not letter-for-letter identical (「ユート」
// canonicalizes to 「ゆと」, never 「ゆうと」). Ambient speech comes back as mixed
// kanji and hiragana, so an all-katakana result is a strong signal that we are
// looking at a name rather than chatter. Checked on the STRIPPED form so
// punctuation and honorifics do not disqualify it.
const KATAKANA_ONLY = /^[ァ-ヶ]+$/;

export function isKatakanaOnly(str) {
  const stripped = normalize(str);
  return stripped.length > 0 && KATAKANA_ONLY.test(stripped);
}
