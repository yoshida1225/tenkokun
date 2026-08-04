import * as router from "../router.js";
import { createTile } from "./components/tile.js";

let selected = new Set();
let tileRevokers = [];

export function mount(container, params) {
  selected = new Set();
  render(container, params);
}

export function unmount() {
  tileRevokers.forEach((fn) => fn());
  tileRevokers = [];
}

function render(container, params) {
  tileRevokers.forEach((fn) => fn());
  tileRevokers = [];

  const { session } = params;
  const exitedIds = new Set(session.exitEvents.map((e) => e.childId));
  const selectable = session.participants.filter((p) => !exitedIds.has(p.childId));

  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "overlay-title";
  title.textContent = "途中退出する子を選ぶ";
  container.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const p of selectable) {
    const { el, revoke } = createTile({
      name: p.nameSnapshot,
      photoRef: p.photoSnapshot,
      status: selected.has(p.childId) ? "checked" : "default",
      onClick: () => {
        if (selected.has(p.childId)) selected.delete(p.childId);
        else selected.add(p.childId);
        render(container, params);
      },
    });
    tileRevokers.push(revoke);
    grid.appendChild(el);
  }
  container.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn btn--primary btn--block";
  nextBtn.textContent = `次へ(${selected.size}人)`;
  nextBtn.disabled = selected.size === 0;
  nextBtn.addEventListener("click", () => {
    router.openOverlay("exitReason", { session, childIds: [...selected] });
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--secondary btn--block";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () => router.closeOverlay());

  actions.appendChild(nextBtn);
  actions.appendChild(cancelBtn);
  container.appendChild(actions);
}
