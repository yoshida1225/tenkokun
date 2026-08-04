import { getState, subscribe } from "../state.js";
import * as router from "../router.js";
import { searchRoster, listTags } from "../roster.js";
import { getPhotoObjectURL } from "../storage.js";

let unsubscribers = [];
let query = "";
let activeTag = null;
let objectUrls = [];

export function mount(container) {
  query = "";
  activeTag = null;
  render(container);
  unsubscribers.push(subscribe("roster:changed", () => render(container)));
}

export function unmount() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
  revokeAll();
}

function revokeAll() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function render(container) {
  revokeAll();
  const { roster } = getState();
  const tags = listTags(roster);
  const filtered = searchRoster(roster, query, activeTag);

  container.innerHTML = "";
  container.className = "screen screen--rosterList";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <button class="header__back"><svg class="icon"><use href="#icon-chevron-left"></use></svg>戻る</button>
    <h1 class="header__title">名簿</h1>
    <button class="header__action"><svg class="icon"><use href="#icon-plus"></use></svg></button>
  `;
  header.querySelector(".header__back").addEventListener("click", () => router.navigateTo("home"));
  header.querySelector(".header__action").addEventListener("click", () => router.navigateTo("childEdit"));
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

  if (tags.length) {
    const filterRow = document.createElement("div");
    filterRow.className = "roster-list__filters";
    const allChip = document.createElement("button");
    allChip.className = `chip chip--tappable${activeTag ? "" : " chip--success"}`;
    allChip.textContent = "すべて";
    allChip.addEventListener("click", () => {
      activeTag = null;
      render(container);
    });
    filterRow.appendChild(allChip);
    for (const tag of tags) {
      const chip = document.createElement("button");
      chip.className = `chip chip--tappable${activeTag === tag ? " chip--success" : ""}`;
      chip.textContent = tag;
      chip.addEventListener("click", () => {
        activeTag = activeTag === tag ? null : tag;
        render(container);
      });
      filterRow.appendChild(chip);
    }
    scroll.appendChild(filterRow);
  }

  if (roster.length === 0) {
    scroll.appendChild(emptyState());
  } else if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "該当する子どもが見つかりません";
    scroll.appendChild(empty);
  } else {
    for (const child of filtered) {
      scroll.appendChild(rosterRow(child, container));
    }
  }

  container.appendChild(scroll);
}

function emptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const p = document.createElement("p");
  p.textContent = "まだ子どもが登録されていません";
  const btn = document.createElement("button");
  btn.className = "btn btn--primary";
  btn.textContent = "＋ 子どもを追加";
  btn.addEventListener("click", () => router.navigateTo("childEdit"));
  empty.appendChild(p);
  empty.appendChild(btn);
  return empty;
}

function rosterRow(child, container) {
  const row = document.createElement("button");
  row.className = "roster-list__row";
  row.style.width = "100%";
  row.addEventListener("click", () => router.navigateTo("childEdit", { childId: child.childId }));

  const avatar = document.createElement("div");
  avatar.className = "roster-list__row-avatar";
  avatar.style.background = "var(--color-surface-3)";
  avatar.textContent = child.name.charAt(0) || "?";
  if (child.photoRef) {
    getPhotoObjectURL(child.photoRef).then((url) => {
      if (!url) return;
      objectUrls.push(url);
      const img = document.createElement("img");
      img.src = url;
      avatar.textContent = "";
      avatar.appendChild(img);
    });
  }

  const main = document.createElement("div");
  main.className = "roster-list__row-main";
  const name = document.createElement("div");
  name.className = "roster-list__row-name";
  name.textContent = child.name;
  main.appendChild(name);

  if (child.tags.length) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "roster-list__row-tags";
    for (const t of child.tags) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t;
      tagsRow.appendChild(chip);
    }
    main.appendChild(tagsRow);
  }

  row.appendChild(avatar);
  row.appendChild(main);
  return row;
}
