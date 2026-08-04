import { getState, subscribe, recordCheckpoint, toggleConfirm, revokeExitEvent } from "../state.js";
import * as router from "../router.js";
import { activeParticipantIds, computeCarriedOverUnconfirmed } from "../session.js";
import { createTile } from "./components/tile.js";
import { formatTime } from "../utils/date.js";
import { consumeHighlight } from "./highlight.js";
import * as confirmDialog from "./components/confirmDialog.js";

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
}

export function unmount() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
  tileRevokers.forEach((fn) => fn());
  tileRevokers = [];
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
  header.querySelector("#btn-exit").addEventListener("click", () => router.openOverlay("exitSelect", { session }));
  header.querySelector("#btn-end-session").addEventListener("click", () => router.openOverlay("endSession", { session }));
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
  addTab.addEventListener("click", () => router.openOverlay("addCheckpoint", { session }));
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

  const highlightChildId = consumeHighlight();

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
      onClick: () => toggleConfirm(checkpoint.checkpointId, childId),
    });
    tileRevokers.push(revoke);
    if (childId === highlightChildId) {
      el.classList.add("tile--highlight");
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
  recordBtn.className = `btn btn--block ${allConfirmed ? "btn--primary" : "btn--warning"}`;
  recordBtn.textContent = checkpoint.recordedAt
    ? `記録済み(${formatTime(checkpoint.recordedAt)})・再記録する`
    : `この点呼を記録する (${confirmedCount}/${activeIds.length})`;
  recordBtn.addEventListener("click", () => {
    const result = recordCheckpoint(checkpoint.checkpointId, { allowUnconfirmed: false });
    if (!result.ok) {
      router.openOverlay("unconfirmedWarning", {
        session,
        checkpointId: checkpoint.checkpointId,
        unconfirmedChildIds: result.unconfirmedChildIds,
      });
    }
  });
  footer.appendChild(recordBtn);
  container.appendChild(footer);
}
