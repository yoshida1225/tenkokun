import { getState, startSession } from "../state.js";
import * as router from "../router.js";
import { searchRoster, listTags } from "../roster.js";
import { createTile } from "./components/tile.js";
import { showToast } from "./components/toast.js";

let participating = new Set();
let query = "";
let tileRevokers = [];

export function mount(container) {
  const { roster } = getState();
  participating = new Set(roster.map((c) => c.childId));
  query = "";
  render(container);
}

export function unmount() {
  tileRevokers.forEach((fn) => fn());
  tileRevokers = [];
}

function render(container) {
  tileRevokers.forEach((fn) => fn());
  tileRevokers = [];

  const { roster } = getState();
  const tags = listTags(roster);
  const filtered = searchRoster(roster, query, null);
  const untagged = filtered.filter((c) => c.tags.length === 0);

  container.innerHTML = "";
  container.className = "screen screen--participantSelect";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <button class="header__back"><svg class="icon"><use href="#icon-chevron-left"></use></svg>戻る</button>
    <h1 class="header__title">参加児選択</h1>
    <span class="header__action" aria-hidden="true"></span>
  `;
  header.querySelector(".header__back").addEventListener("click", () => router.navigateTo("home"));
  container.appendChild(header);

  const scroll = document.createElement("div");
  scroll.className = "screen-scroll";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "search-box";
  searchInput.placeholder = "名前・グループで検索";
  searchInput.value = query;
  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    render(container);
  });
  scroll.appendChild(searchInput);

  const counter = document.createElement("div");
  counter.className = "participant-counter";
  scroll.appendChild(counter);

  function updateCounter() {
    counter.textContent = `対象: ${participating.size}/${roster.length}人`;
    footerBtn.textContent = `この人数(${participating.size}人)ではじめる`;
    footerBtn.disabled = participating.size === 0 || !!getState().activeSession;
  }

  for (const tag of tags) {
    const members = filtered.filter((c) => c.tags.includes(tag));
    if (members.length === 0) continue;
    scroll.appendChild(groupSection(tag, members, updateCounter));
  }
  if (untagged.length) {
    scroll.appendChild(groupSection("グループなし", untagged, updateCounter));
  }
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = roster.length === 0 ? "名簿に子どもが登録されていません" : "該当する子どもが見つかりません";
    scroll.appendChild(empty);
  }

  container.appendChild(scroll);

  const footer = document.createElement("div");
  footer.className = "sticky-footer";
  const footerBtn = document.createElement("button");
  footerBtn.className = "btn btn--primary btn--block";
  footer.appendChild(footerBtn);
  footerBtn.addEventListener("click", async () => {
    if (getState().activeSession) {
      showToast("進行中のお散歩があります");
      return;
    }
    footerBtn.disabled = true;
    const result = await startSession([...participating]);
    if (result.ok) {
      router.navigateTo("session", { sessionId: result.session.sessionId });
      if (result.photoFailedChildIds?.length) {
        showToast("一部の写真をコピーできませんでした(名前で表示されます)");
      }
    } else {
      showToast("お散歩を開始できませんでした");
      footerBtn.disabled = false;
    }
  });
  container.appendChild(footer);

  updateCounter();

  function groupSection(label, members, onToggle) {
    const section = document.createElement("div");
    section.className = "group-section";

    const head = document.createElement("div");
    head.className = "group-section__header";
    const title = document.createElement("span");
    title.className = "group-section__title";
    title.textContent = `${label}(${members.length})`;
    const groupToggle = document.createElement("button");
    const allOn = members.every((c) => participating.has(c.childId));
    groupToggle.className = `toggle${allOn ? " toggle--on" : ""}`;
    groupToggle.setAttribute("aria-label", `${label}を一括切替`);
    groupToggle.addEventListener("click", () => {
      const nextOn = !members.every((c) => participating.has(c.childId));
      for (const c of members) {
        if (nextOn) participating.add(c.childId);
        else participating.delete(c.childId);
      }
      render(container);
    });
    head.appendChild(title);
    head.appendChild(groupToggle);
    section.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "tile-grid";
    for (const child of members) {
      const isOn = participating.has(child.childId);
      const { el, revoke } = createTile({
        name: child.name,
        photoRef: child.photoRef,
        status: isOn ? "checked" : "excluded",
        meta: isOn ? undefined : "休",
        group: label === "グループなし" ? undefined : label,
        onClick: () => {
          if (participating.has(child.childId)) participating.delete(child.childId);
          else participating.add(child.childId);
          render(container);
        },
      });
      tileRevokers.push(revoke);
      grid.appendChild(el);
    }
    section.appendChild(grid);
    return section;
  }
}
