import { getState } from "../state.js";
import * as router from "../router.js";
import { formatDateTime, formatTime } from "../utils/date.js";
import { exportSessionCsv } from "../backup.js";

const REASON_LABEL = { pickup: "お迎え", illness_with_staff: "体調不良等で職員付き添い戻園", other: "その他" };

export function mount(container, params) {
  render(container, params);
}

export function unmount() {}

function render(container, params) {
  const { sessions } = getState();
  const session = sessions.find((s) => s.sessionId === params.sessionId);

  container.innerHTML = "";
  container.className = "screen screen--historyDetail";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <button class="header__back"><svg class="icon"><use href="#icon-chevron-left"></use></svg>戻る</button>
    <h1 class="header__title">お散歩の記録</h1>
    <span class="header__action" aria-hidden="true"></span>
  `;
  header.querySelector(".header__back").addEventListener("click", () => router.navigateTo("historyList"));
  container.appendChild(header);

  if (!session) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "記録が見つかりませんでした";
    container.appendChild(empty);
    return;
  }

  const scroll = document.createElement("div");
  scroll.className = "screen-scroll";

  const summary = document.createElement("p");
  summary.textContent = `${formatDateTime(session.startedAt)} 〜 ${session.endedAt ? formatDateTime(session.endedAt) : "-"}(参加${session.participants.length}人)`;
  summary.style.color = "var(--color-text-secondary)";
  scroll.appendChild(summary);

  const sorted = [...session.checkpoints].sort((a, b) => a.order - b.order);
  for (const cp of sorted) {
    if (!cp.recordedAt) continue;
    const row = document.createElement("div");
    row.className = "detail-checkpoint";
    const total = cp.confirmedChildIds.length + cp.unconfirmedChildIds.length;
    row.innerHTML = `
      <div class="detail-checkpoint__head">
        <span>${cp.label}</span>
        <span>${formatTime(cp.recordedAt)}</span>
      </div>
      <div>確認済み ${cp.confirmedChildIds.length}/${total}${cp.recordedWithWarning ? " ・ 未確認あり" : ""}</div>
    `;
    scroll.appendChild(row);
  }

  if (session.exitEvents.length) {
    const exitTitle = document.createElement("h2");
    exitTitle.className = "overlay-title";
    exitTitle.style.marginTop = "16px";
    exitTitle.textContent = "途中退出";
    scroll.appendChild(exitTitle);
    for (const e of session.exitEvents) {
      const name = session.participants.find((p) => p.childId === e.childId)?.nameSnapshot ?? "?";
      const row = document.createElement("div");
      row.className = "detail-exit-row";
      row.textContent = `${name}(${formatTime(e.occurredAt)}・${e.reasonNote || REASON_LABEL[e.reason] || e.reason})`;
      scroll.appendChild(row);
    }
  }

  container.appendChild(scroll);

  const footer = document.createElement("div");
  footer.className = "sticky-footer";
  const csvBtn = document.createElement("button");
  csvBtn.className = "btn btn--secondary btn--block";
  csvBtn.textContent = "CSVで書き出す";
  csvBtn.addEventListener("click", () => exportSessionCsv(session));
  footer.appendChild(csvBtn);
  container.appendChild(footer);
}
