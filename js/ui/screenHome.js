import { getState, subscribe } from "../state.js";
import * as router from "../router.js";

let unsubscribers = [];

export function mount(container) {
  render(container);
  unsubscribers.push(subscribe("roster:changed", () => render(container)));
  unsubscribers.push(subscribe("session:started", () => render(container)));
  unsubscribers.push(subscribe("session:ended", () => render(container)));
}

export function unmount() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
}

function render(container) {
  const { roster, activeSession } = getState();
  const hasRoster = roster.length > 0;

  container.innerHTML = "";
  container.className = "screen screen--home";

  const title = document.createElement("h1");
  title.className = "home__title";
  title.textContent = "点呼くん";
  container.appendChild(title);

  const lead = document.createElement("p");
  lead.className = "home__lead";
  lead.textContent = hasRoster
    ? "お散歩先などで、名前で一人ひとり確認する点呼アプリです。"
    : "まずは名簿に子どもを登録しましょう。";
  container.appendChild(lead);

  const actions = document.createElement("div");
  actions.className = "home__actions";

  const startBtn = document.createElement("button");
  startBtn.className = "btn btn--primary btn--block";
  startBtn.textContent = "お散歩をはじめる";
  startBtn.disabled = !hasRoster || !!activeSession;
  startBtn.addEventListener("click", () => router.navigateTo("participantSelect"));
  actions.appendChild(startBtn);

  if (!hasRoster) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn--secondary btn--block";
    addBtn.textContent = "＋ 子どもを追加";
    addBtn.addEventListener("click", () => router.navigateTo("childEdit"));
    actions.appendChild(addBtn);
  }

  container.appendChild(actions);

  const links = document.createElement("div");
  links.className = "home__secondary-links";

  const rosterLink = document.createElement("button");
  rosterLink.className = "link-btn";
  rosterLink.textContent = "名簿を管理";
  rosterLink.addEventListener("click", () => router.navigateTo("rosterList"));

  const historyLink = document.createElement("button");
  historyLink.className = "link-btn";
  historyLink.textContent = "履歴を見る";
  historyLink.addEventListener("click", () => router.navigateTo("historyList"));

  const settingsLink = document.createElement("button");
  settingsLink.className = "link-btn";
  settingsLink.textContent = "設定";
  settingsLink.addEventListener("click", () => router.navigateTo("settings"));

  links.appendChild(rosterLink);
  links.appendChild(historyLink);
  links.appendChild(settingsLink);
  container.appendChild(links);

  const note = document.createElement("p");
  note.className = "home__lead";
  note.style.fontSize = "13px";
  note.textContent = "ホーム画面に追加すると次回からすぐ開けます(Safariの共有ボタン→「ホーム画面に追加」)。";
  container.appendChild(note);
}
