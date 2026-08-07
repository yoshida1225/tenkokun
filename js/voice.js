// Push-to-talk voice matching for roll call confirmation. Best-effort: iOS
// Safari's speech recognition can be flaky in standalone (home screen) PWA
// mode, and without stored furigana, kanji roster names won't match spoken
// audio — this is an assist alongside tap, not a replacement for it.

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

const STRIP_PATTERN = /[\s、。,.!?！？・\-ー]|さん|ちゃん|くん|君/g;

function normalize(str) {
  return (str || "").normalize("NFKC").replace(STRIP_PATTERN, "").toLowerCase();
}

function toHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function canon(str) {
  return toHiragana(normalize(str));
}

// Matches a spoken transcript against candidate participants' names.
// Returns a childId only on an unmatched, unambiguous hit — ties resolve to
// "no match" so a misheard name never silently confirms the wrong child.
export function matchChildName(transcript, participants) {
  const target = canon(transcript);
  if (!target) return null;

  const candidates = participants
    .map((p) => ({ childId: p.childId, norm: canon(p.nameSnapshot) }))
    .filter((c) => c.norm.length > 0);

  const exact = candidates.filter((c) => c.norm === target);
  if (exact.length === 1) return exact[0].childId;
  if (exact.length > 1) return null;

  const partial = candidates.filter((c) => target.includes(c.norm) || c.norm.includes(target));
  if (partial.length === 1) return partial[0].childId;

  return null;
}

// Tries each speech-recognition alternative in confidence order until one
// uniquely matches a participant.
export function matchFromResult(result, participants) {
  for (let i = 0; i < result.length; i += 1) {
    const transcript = result[i].transcript;
    const childId = matchChildName(transcript, participants);
    if (childId) return { childId, transcript };
  }
  return { childId: null, transcript: result[0]?.transcript ?? "" };
}
