import { getState, subscribe } from "../state.js";
import * as router from "../router.js";
import { formatDateTime } from "../utils/date.js";

let unsubscribers = [];

export function mount(container) {
  render(container);
  unsubscribers.push(subscribe("session:ended", () => render(container)));
}

export function unmount() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
}

function render(container) {
  const { sessions } = getState();

  container.innerHTML = "";
  container.className = "screen screen--historyList";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <button class="header__back"><svg class="icon"><use href="#icon-chevron-left"></use></svg>戻る</button>
    <h1 class="header__title">点呼履歴</h1>
    <span class="header__action" aria-hidden="true"></span>
  `;
  header.querySelector(".header__back").addEventListener("click", () => router.navigateTo("home"));
  container.appendChild(header);

  const scroll = document.createElement("div");
  scroll.className = "screen-scroll";

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "まだ記録がありません";
    scroll.appendChild(empty);
  } else {
    for (const session of sessions) {
      const recordedCount = session.checkpoints.filter((cp) => cp.recordedAt).length;
      const row = document.createElement("button");
      row.className = "history-row";
      row.style.width = "100%";
      row.innerHTML = `
        <div class="history-row__top">
          <span class="history-row__date">${formatDateTime(session.startedAt)}</span>
        </div>
        <span class="history-row__meta">参加${session.participants.length}人・点呼${recordedCount}回</span>
      `;
      row.addEventListener("click", () => router.navigateTo("historyDetail", { sessionId: session.sessionId }));
      scroll.appendChild(row);
    }
  }

  container.appendChild(scroll);
}
