import {
  getState,
  subscribe,
  recordCheckpoint,
  toggleConfirm,
  revokeExitEvent,
  confirmChild,
  addVoiceAlias,
  removeVoiceAlias,
} from "../state.js";
import * as router from "../router.js";
import { activeParticipantIds, computeCarriedOverUnconfirmed } from "../session.js";
import { getChildById, getVoiceAliases } from "../roster.js";
import { createTile } from "./components/tile.js";
import { formatTime } from "../utils/date.js";
import { consumeHighlight, setHighlight } from "./highlight.js";
import * as confirmDialog from "./components/confirmDialog.js";
import * as voice from "../voice.js";
import { showToast } from "./components/toast.js";

let unsubscribers = [];
let currentCheckpointId = null;
let showExited = false;
let tileRevokers = [];

export function mount(container, params) {
  const { activeSession } = getState();
  if (!activeSession) {
    router.navigateTo("home", {}, { replace: true });
    return;
  }
  currentCheckpointId = params.checkpointId || pickDefaultCheckpoint(activeSession);
  showExited = false;
  render(container);
  unsubscribers.push(subscribe("session:changed", () => render(container)));
  unsubscribers.push(subscribe("session:ended", () => router.navigateTo("home", {}, { replace: true })));
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
}

export function unmount() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
  tileRevokers.forEach((fn) => fn());
  tileRevokers = [];
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("pagehide", onPageHide);
  stopVoice({ hard: true });
  clearPendingLearn();
}

// Backgrounding the app or locking the screen must not leave the mic live.
function onVisibilityChange() {
  if (document.hidden) stopVoice({ hard: true });
}

function onPageHide() {
  stopVoice({ hard: true });
}

function pickDefaultCheckpoint(session) {
  const sorted = [...session.checkpoints].sort((a, b) => a.order - b.order);
  const unrecorded = sorted.find((cp) => !cp.recordedAt);
  return (unrecorded || sorted[sorted.length - 1])?.checkpointId ?? null;
}

function render(container) {
  tileRevokers.forEach((fn) => fn());
  tileRevokers = [];

  const previousScrollTop = container.querySelector(".screen-scroll")?.scrollTop ?? 0;

  const { activeSession: session } = getState();
  if (!session) return;

  const sortedCheckpoints = [...session.checkpoints].sort((a, b) => a.order - b.order);
  if (!sortedCheckpoints.find((cp) => cp.checkpointId === currentCheckpointId)) {
    currentCheckpointId = sortedCheckpoints[0]?.checkpointId ?? null;
  }
  const checkpoint = sortedCheckpoints.find((cp) => cp.checkpointId === currentCheckpointId);

  container.innerHTML = "";
  container.className = "screen screen--session";

  // Header
  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <button class="header__back"><svg class="icon"><use href="#icon-chevron-left"></use></svg>戻る</button>
    <h1 class="header__title">点呼くん</h1>
    <div style="display:flex;gap:4px">
      <button class="icon-btn" id="btn-exit" aria-label="途中退出"><svg class="icon"><use href="#icon-door-exit"></use></svg></button>
      <button class="link-btn" id="btn-end-session">終了</button>
    </div>
  `;
  header.querySelector(".header__back").addEventListener("click", () => router.navigateTo("home"));
  // Overlays do NOT unmount this screen (see router.mountOverlayDom), so the
  // mic must be stopped explicitly or it keeps confirming children behind a
  // modal the caregiver has already moved on from.
  header.querySelector("#btn-exit").addEventListener("click", () => openOverlayWithMicOff("exitSelect", { session }));
  header
    .querySelector("#btn-end-session")
    .addEventListener("click", () => openOverlayWithMicOff("endSession", { session }));
  container.appendChild(header);

  // Carried-over unconfirmed banner (3-4)
  const carriedOver = computeCarriedOverUnconfirmed(session).filter((id) =>
    session.participants.some((p) => p.childId === id)
  );
  if (carriedOver.length) {
    const names = carriedOver
      .map((id) => session.participants.find((p) => p.childId === id)?.nameSnapshot)
      .filter(Boolean)
      .join("・");
    const banner = document.createElement("div");
    banner.className = "unconfirmed-banner";
    banner.innerHTML = `<svg class="icon"><use href="#icon-warning"></use></svg><span>まだ確認できていません: ${names}</span>`;
    container.appendChild(banner);
  }

  if (getState().saveError) {
    const errBanner = document.createElement("div");
    errBanner.className = "save-error-banner";
    errBanner.textContent = "保存できていません。お散歩を終えたらすぐバックアップしてください";
    container.appendChild(errBanner);
  }

  // Checkpoint tabs
  const tabs = document.createElement("div");
  tabs.className = "checkpoint-tabs";
  for (const cp of sortedCheckpoints) {
    const tab = document.createElement("button");
    tab.className = `checkpoint-tab${cp.checkpointId === currentCheckpointId ? " checkpoint-tab--active" : ""}`;
    tab.textContent = cp.label;
    tab.addEventListener("click", () => {
      // Not in render() — that runs on every confirm and would kill a pending
      // offer instantly. Switching tabs really is a change of context though.
      clearPendingLearn();
      currentCheckpointId = cp.checkpointId;
      render(container);
    });
    tabs.appendChild(tab);
    if (cp.checkpointId === currentCheckpointId) {
      requestAnimationFrame(() => tab.scrollIntoView({ inline: "center", behavior: "smooth" }));
    }
  }
  const addTab = document.createElement("button");
  addTab.className = "checkpoint-tab checkpoint-tab--add";
  addTab.innerHTML = '<svg class="icon" style="width:16px;height:16px"><use href="#icon-plus"></use></svg>点呼を追加';
  addTab.addEventListener("click", () => openOverlayWithMicOff("addCheckpoint", { session }));
  tabs.appendChild(addTab);
  container.appendChild(tabs);

  if (!checkpoint) return;

  const activeIds = activeParticipantIds(session, checkpoint.checkpointId);
  const confirmedCount = activeIds.filter((id) => checkpoint.confirmedChildIds.includes(id)).length;

  const subheader = document.createElement("div");
  subheader.className = "session-subheader";
  subheader.innerHTML = `
    <span class="session-subheader__title">${checkpoint.label}の点呼</span>
    <span class="session-subheader__count">確認済み ${confirmedCount}/${activeIds.length}</span>
  `;
  container.appendChild(subheader);

  const progress = document.createElement("div");
  progress.className = "session-progress";
  const pct = activeIds.length ? Math.round((confirmedCount / activeIds.length) * 100) : 0;
  progress.innerHTML = `<div class="progress-bar"><div class="progress-bar__fill" style="width:${pct}%"></div></div>`;
  container.appendChild(progress);

  const scroll = document.createElement("div");
  scroll.className = "screen-scroll";

  const { childId: highlightChildId, kind: highlightKind } = consumeHighlight();

  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const childId of activeIds) {
    const p = session.participants.find((x) => x.childId === childId);
    if (!p) continue;
    const checked = checkpoint.confirmedChildIds.includes(childId);
    const { el, revoke } = createTile({
      name: p.nameSnapshot,
      photoRef: p.photoSnapshot,
      status: checked ? "checked" : "default",
      onClick: () => {
        toggleConfirm(checkpoint.checkpointId, childId);
        // Only the unconfirmed -> confirmed direction. Un-checking a tile is a
        // correction, not the caregiver telling us who they just said.
        if (!checked) offerAliasLearn(childId, checkpoint.checkpointId);
      },
    });
    tileRevokers.push(revoke);
    if (childId === highlightChildId) {
      el.classList.add(highlightKind === "voice" ? "tile--voice-flash" : "tile--highlight");
      requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    }
    grid.appendChild(el);
  }
  scroll.appendChild(grid);

  const exitedParticipants = session.participants.filter((p) => !activeIds.includes(p.childId));
  if (exitedParticipants.length) {
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "exited-toggle";
    toggleBtn.textContent = `── 途中退出済み(${exitedParticipants.length}) 表示切替 ──`;
    toggleBtn.addEventListener("click", () => {
      showExited = !showExited;
      render(container);
    });
    scroll.appendChild(toggleBtn);

    if (showExited) {
      const exitedGrid = document.createElement("div");
      exitedGrid.className = "tile-grid";
      for (const p of exitedParticipants) {
        const exitEvent = [...session.exitEvents].reverse().find((e) => e.childId === p.childId);
        const meta = exitEvent ? `退出済 ${formatTime(exitEvent.occurredAt)}` : "退出済";
        const { el, revoke } = createTile({
          name: p.nameSnapshot,
          photoRef: p.photoSnapshot,
          status: "exited",
          meta,
          onClick: () => {
            confirmDialog.confirm({
              title: "途中退出を取り消しますか?",
              message: `${p.nameSnapshot}さんを在園扱いに戻します。`,
              confirmLabel: "取り消す",
              onConfirm: () => revokeExitEvent(p.childId),
            });
          },
        });
        tileRevokers.push(revoke);
        exitedGrid.appendChild(el);
      }
      scroll.appendChild(exitedGrid);
    }
  }

  container.appendChild(scroll);
  scroll.scrollTop = previousScrollTop;

  const footer = document.createElement("div");
  footer.className = "sticky-footer";
  const recordBtn = document.createElement("button");
  const allConfirmed = confirmedCount === activeIds.length;
  recordBtn.className = `btn btn--flex ${allConfirmed ? "btn--primary" : "btn--warning"}`;
  recordBtn.textContent = checkpoint.recordedAt
    ? `記録済み(${formatTime(checkpoint.recordedAt)})・再記録する`
    : `この点呼を記録する (${confirmedCount}/${activeIds.length})`;
  recordBtn.addEventListener("click", () => {
    const result = recordCheckpoint(checkpoint.checkpointId, { allowUnconfirmed: false });
    if (!result.ok) {
      openOverlayWithMicOff("unconfirmedWarning", {
        session,
        checkpointId: checkpoint.checkpointId,
        unconfirmedChildIds: result.unconfirmedChildIds,
      });
    }
  });
  footer.appendChild(recordBtn);

  if (voice.isSupported()) {
    footer.appendChild(createMicButton());
  }

  container.appendChild(footer);
}

function openOverlayWithMicOff(name, params) {
  stopVoice({ hard: true });
  clearPendingLearn(); // a modal really is a change of context
  router.openOverlay(name, params);
}

// --- Voice confirmation (tap to toggle) ---
//
// This was originally push-to-talk, which could never work: on touch the UA
// fires pointerup -> pointerout -> pointerleave, so the pointerleave handler's
// abort() destroyed the result that pointerup's stop() had just asked for, and
// onerror swallowed the resulting "aborted". Every correct press threw away
// its own result, silently. Tapping to toggle removes that whole class of bug
// and is easier to use while saying many names in a row.
//
// Safety property carried over from push-to-talk: the mic runs only when
// deliberately switched on, shows a red pulsing state, and stops on screen
// leave, backgrounding, overlays, and after MAX_LISTEN_MS.

const WATCHDOG_MS = 4000;
const RESTART_DELAY_MS = 300;
const MAX_RESTARTS_WITHOUT_RESULT = 8;
const MAX_LISTEN_MS = 3 * 60 * 1000;
const UNMATCHED_TOAST_COOLDOWN_MS = 4000;
const TOAST_SHORT = 1600;
// How long an unmatched transcript stays eligible to be taught. Originally 8s
// on the theory that the repair loop is 2-5 seconds — but that assumed the
// child's tile was already on screen. With 10-28 tiles the caregiver has to
// find and often scroll to the right one while watching actual children, which
// routinely takes longer, and the offer silently never appeared.
// Widening is safe because time was never the real guard: a new utterance, a
// checkpoint switch, an overlay or leaving the screen all still discard it,
// only a confirm-direction tap qualifies, the prompt names the child, the
// alias is checked against the whole roster, and it can be undone.
const LEARN_WINDOW_MS = 45000;
// Separate from the eligibility window — how long the prompt itself sits over
// the sticky footer. These serve different purposes and must not be unified.
const LEARN_OFFER_TOAST_MS = 8000;

const VOICE_ERROR_MESSAGES = {
  "no-speech": "声が聞き取れませんでした",
  "not-allowed": "マイクの使用が許可されていません。設定でマイクへのアクセスを許可してください",
  "service-not-allowed": "この端末では音声認識が利用できないようです",
  "audio-capture": "マイクが使えませんでした",
  network: "通信エラーで音声認識に失敗しました",
};
const TERMINAL_VOICE_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

let activeRecognition = null;
let voiceListening = false; // user intent; survives render(), unlike the DOM
let restartTimer = null;
let watchdogTimer = null;
let autoOffTimer = null;
let consecutiveNoSpeech = 0;
let restartCount = 0;
let confirmedByVoiceCount = 0;
let lastUnmatchedToastAt = 0;
let pendingLearn = null; // { transcript, sessionId, checkpointId, at }
let learnOfferDismiss = null;

// Resolve the button from the DOM every time. render() rebuilds the footer
// after every confirmed name, so a captured reference goes stale immediately.
function micEl() {
  return document.querySelector(".screen--session .mic-btn");
}

function paintMic() {
  const el = micEl();
  if (!el) return; // mid-render; the next createMicButton() paints itself
  el.classList.toggle("mic-btn--listening", voiceListening);
  el.setAttribute("aria-pressed", String(voiceListening));
  el.setAttribute("aria-label", voiceListening ? "音声確認を止める" : "音声で確認する(タップして開始)");
}

function createMicButton() {
  const micBtn = document.createElement("button");
  micBtn.type = "button";
  micBtn.className = `mic-btn${voiceListening ? " mic-btn--listening" : ""}`;
  micBtn.setAttribute("aria-pressed", String(voiceListening));
  micBtn.setAttribute("aria-label", voiceListening ? "音声確認を止める" : "音声で確認する(タップして開始)");
  micBtn.innerHTML = '<svg class="icon"><use href="#icon-mic"></use></svg>';
  micBtn.addEventListener("click", toggleVoice);
  return micBtn;
}

function toggleVoice() {
  if (voiceListening) {
    stopVoice({ summary: true });
    return;
  }
  voiceListening = true;
  confirmedByVoiceCount = 0;
  restartCount = 0;
  consecutiveNoSpeech = 0;
  paintMic();
  showToast("🎤 聞き取り中。名前を言ってください", { duration: TOAST_SHORT });
  // Backstop so a mic left on in a pocket can't listen indefinitely.
  autoOffTimer = setTimeout(() => {
    stopVoice({ hard: true });
    showToast("マイクを自動で止めました", { duration: TOAST_SHORT });
  }, MAX_LISTEN_MS);
  startRecognitionCycle();
}

function startRecognitionCycle() {
  if (!voiceListening || activeRecognition) return;

  // Construction, property assignment and start() are all inside one try: on
  // iOS a synchronous throw can come from any of them, and an uncaught error
  // in a handler fails silently on a phone with no devtools.
  try {
    // Always a fresh instance — Safari throws InvalidStateError on start() of
    // an already-ended one, which would kill every auto-restart silently.
    const recognition = voice.createRecognition();
    activeRecognition = recognition;
    let started = false;

    // Covers the platform granting a constructor but never delivering audio.
    watchdogTimer = setTimeout(() => {
      if (started) return;
      failVoice(`音声認識が反応しません (${voice.diagnostics()})`);
    }, WATCHDOG_MS);

    recognition.onstart = () => {
      started = true;
      clearTimeout(watchdogTimer);
      // A successful start proves the engine works, so the restart budget is
      // spent only on starts that FAIL. Previously every restart counted,
      // including the ones caused by ordinary silence — and a caregiver
      // walking with children is silent most of the time, so the mic gave up
      // and switched itself off during normal use.
      restartCount = 0;
      paintMic();
    };
    recognition.onresult = onVoiceResult;
    recognition.onerror = onVoiceError;
    recognition.onend = onVoiceEnd;

    recognition.start();
  } catch (err) {
    failVoice(`音声認識を開始できませんでした (${err?.name || err?.message || err})`);
  }
}

function onVoiceEnd() {
  clearTimeout(watchdogTimer);
  activeRecognition = null;
  if (!voiceListening) {
    paintMic();
    return;
  }
  // Safari ignores `continuous` and ends after each utterance, so staying on
  // means restarting. Delayed, because restarting instantly can leave iOS
  // holding the audio session and kill the mic outright.
  restartCount += 1;
  if (restartCount > MAX_RESTARTS_WITHOUT_RESULT) {
    failVoice("音声認識を続けられませんでした。もう一度マイクをタップしてください");
    return;
  }
  restartTimer = setTimeout(startRecognitionCycle, RESTART_DELAY_MS);
}

function onVoiceError(event) {
  clearTimeout(watchdogTimer);
  const code = event.error;

  // The old code returned silently on "aborted" no matter what, which is how
  // the original bug stayed invisible. Only stay quiet if WE stopped it; if
  // we're still meant to be listening, fall through to onend's restart, and
  // MAX_RESTARTS_WITHOUT_RESULT eventually surfaces it loudly.
  if (code === "aborted") return;

  if (code === "no-speech") {
    consecutiveNoSpeech += 1;
    if (consecutiveNoSpeech === 3) {
      showToast("声が聞き取れていません。近づけて話してください", { duration: TOAST_SHORT });
    }
    return;
  }

  if (TERMINAL_VOICE_ERRORS.has(code)) {
    failVoice(`${VOICE_ERROR_MESSAGES[code]} (${voice.diagnostics()})`);
    return;
  }

  if (code === "network") {
    showToast(VOICE_ERROR_MESSAGES.network, { duration: TOAST_SHORT });
    return;
  }

  failVoice(`音声認識でエラーが発生しました (${code})`);
}

// Names come from the session snapshot (evidence, frozen for this walk);
// aliases come from the LIVE roster. Aliases are recognizer configuration, not
// a record of the walk, so freezing them would mean writing to two places at
// once — and if the roster write failed on quota while the session write
// succeeded, an alias would work today and silently vanish forever.
function voiceCandidates(session, checkpointId) {
  const activeIds = activeParticipantIds(session, checkpointId);
  const { roster: liveRoster } = getState();
  return voice.resolveAliasConflicts(
    session.participants
      .filter((p) => activeIds.includes(p.childId))
      .map((p) => ({
        childId: p.childId,
        nameSnapshot: p.nameSnapshot,
        aliases: getVoiceAliases(getChildById(liveRoster, p.childId)),
      }))
  );
}

function onVoiceResult(event) {
  const { activeSession: current } = getState();
  if (!current || !currentCheckpointId) return;
  // Read the checkpoint from module state, not a closure, so switching tabs
  // while listening confirms into the tab actually on screen.
  const candidates = voiceCandidates(current, currentCheckpointId);

  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    if (!result.isFinal) continue;

    // Any new utterance invalidates a pending offer — the caregiver has moved
    // on, and two offers naming two transcripts is how you tap the wrong one.
    clearPendingLearn();

    const { childIds, transcript } = voice.matchFromResult(result, candidates);
    restartCount = 0;
    consecutiveNoSpeech = 0;

    if (childIds.length) {
      confirmedByVoiceCount += childIds.length;
      // No success toast for a single name: 28 children would bury the screen,
      // and the tile turning green, the counter, the progress bar and the
      // record button all already say it. setHighlight must come BEFORE
      // confirmChild, which notifies -> render() -> consumeHighlight()
      // synchronously.
      for (const id of childIds) {
        setHighlight(id, "voice");
        confirmChild(currentCheckpointId, id);
      }
      // Several names at once is the exception: only the last tile is left
      // flashing, so the rest need saying out loud.
      if (childIds.length > 1) {
        showToast(`${childIds.length}人を確認しました`, { duration: TOAST_SHORT });
      }
    } else if (transcript) {
      const trimmed = transcript.trim();
      const learnable = voice.isLearnableTranscript(trimmed);
      // Eligibility is set OUTSIDE the toast cooldown: the cooldown throttles
      // toast spam, and letting it also gate learning would make the second of
      // two quick misses un-learnable for no reason.
      if (learnable) {
        pendingLearn = {
          transcript: trimmed,
          sessionId: current.sessionId,
          checkpointId: currentCheckpointId,
          at: Date.now(),
        };
      }
      // Two characters filters out grunts and stray syllables — but a single
      // kanji is a real given name (舞/蓮/葵/健), so anything learnable is
      // worth surfacing even at one character.
      if (trimmed.length < 2 && !learnable) continue;
      const now = Date.now();
      if (now - lastUnmatchedToastAt > UNMATCHED_TOAST_COOLDOWN_MS) {
        lastUnmatchedToastAt = now;
        showToast(`「${trimmed}」は分かりませんでした。タップで確認を`, { duration: TOAST_SHORT });
      }
    }
  }
}

// --- Teaching the recognizer a child's name ---
//
// iOS rewrites a hiragana roster as kanji (「山田花子」) or, for a name it does
// not know, as katakana (「ユート」) — neither reliably matches.
// Rather than ship a dictionary, learn from the caregiver at the one moment
// their intent is unambiguous: the tap they were about to make anyway.

// No expiry timer: the age is checked at tap time instead, so an expired offer
// can SAY it expired. A timer that silently nulled it left the caregiver
// tapping a tile and getting nothing back.
function clearPendingLearn() {
  pendingLearn = null;
  learnOfferDismiss?.();
  learnOfferDismiss = null;
}

function offerAliasLearn(childId, checkpointId) {
  const p = pendingLearn;
  if (!p) return;

  const { activeSession: current, roster: liveRoster } = getState();
  if (!current || current.sessionId !== p.sessionId || checkpointId !== p.checkpointId) {
    return clearPendingLearn();
  }
  if (Date.now() - p.at > LEARN_WINDOW_MS) {
    clearPendingLearn();
    showToast(`「${p.transcript}」の登録は時間切れです。もう一度言ってからタップしてください`);
    return;
  }

  const transcript = p.transcript;
  clearPendingLearn(); // consume before anything can re-enter

  // Checked against the WHOLE roster, not just this walk's participants: a
  // child who stayed home today would still collide next week.
  const rosterCandidates = liveRoster.map((c) => ({
    childId: c.childId,
    nameSnapshot: c.name,
    aliases: getVoiceAliases(c),
  }));
  const verdict = voice.canAddAlias(transcript, childId, rosterCandidates);
  const name = getChildById(liveRoster, childId)?.name ?? "この子";

  if (!verdict.ok) {
    // Every branch says something. A tap that produces nothing is the exact
    // failure mode that made this feature look broken in the first place.
    if (verdict.reason === "conflict") {
      const other = getChildById(liveRoster, verdict.conflictChildId)?.name ?? "他の子";
      showToast(`「${transcript}」は ${other} さんと紛らわしいため覚えられません`);
    } else if (verdict.reason === "duplicate") {
      showToast(`「${transcript}」はすでに ${name} さんに登録されています`, { duration: TOAST_SHORT });
    } else if (verdict.reason === "tooMany") {
      showToast(`${name} さんの呼び方が上限です。名簿から古いものを削除してください`);
    } else if (verdict.reason === "tooShort") {
      showToast(`「${transcript}」は短すぎて覚えられません`, { duration: TOAST_SHORT });
    } else if (verdict.reason === "tooLong") {
      showToast(`「${transcript}」は長すぎて覚えられません`, { duration: TOAST_SHORT });
    } else {
      showToast(`「${transcript}」は覚えられませんでした (${verdict.reason})`);
    }
    return;
  }

  // Safe despite toggleConfirm having just re-rendered the screen
  // synchronously: #toast-root lives outside the screen container.
  learnOfferDismiss = showToast(`「${transcript}」を ${name} さんの呼び方として覚えますか?`, {
    duration: LEARN_OFFER_TOAST_MS,
    actionLabel: "覚える",
    onAction: () => commitAlias(childId, transcript, name),
  });
}

function commitAlias(childId, transcript, name) {
  learnOfferDismiss = null;
  const result = addVoiceAlias(childId, transcript);
  if (!result.ok) {
    showToast("保存できませんでした。端末の空き容量を確認してください");
    return;
  }
  // The "wrong tile" realization arrives a second or two later, so give it a
  // way back.
  showToast(`「${transcript}」を ${name} さんの呼び方に登録しました`, {
    duration: 6000,
    actionLabel: "取り消す",
    onAction: () => {
      removeVoiceAlias(childId, transcript);
      showToast("登録を取り消しました", { duration: TOAST_SHORT });
    },
  });
}

// NOTE: deliberately does NOT clear pendingLearn. The caregiver saying a name
// and then hunting for the tile is the normal flow, and the mic stopping
// midway — auto-off, a restart giving up, or them switching it off — does not
// change who they meant. Only a real change of context discards it: a new
// utterance, a checkpoint switch, an overlay, or leaving the screen.
function stopVoice({ hard = false, summary = false } = {}) {
  const wasListening = voiceListening;
  voiceListening = false;
  clearTimeout(restartTimer);
  clearTimeout(watchdogTimer);
  clearTimeout(autoOffTimer);
  restartTimer = watchdogTimer = autoOffTimer = null;

  const recognition = activeRecognition;
  if (recognition) {
    // stop() on a deliberate toggle-off so the final utterance still lands —
    // exactly what the old pointerleave abort() was destroying.
    try {
      if (hard) recognition.abort();
      else recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        /* already dead */
      }
    }
  }
  paintMic();

  if (wasListening && summary) {
    showToast(
      confirmedByVoiceCount ? `マイクを止めました(音声で${confirmedByVoiceCount}人確認)` : "マイクを止めました",
      { duration: TOAST_SHORT }
    );
  }
}

function failVoice(message) {
  stopVoice({ hard: true });
  showToast(message);
}
