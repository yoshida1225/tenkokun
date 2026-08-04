import { recordCheckpoint } from "../state.js";
import * as router from "../router.js";
import { setHighlight } from "./highlight.js";

export function mount(container, params) {
  const { session, checkpointId, unconfirmedChildIds } = params;
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "overlay-title";
  title.innerHTML = `<svg class="icon" style="color:var(--color-warning)"><use href="#icon-warning"></use></svg> まだ${unconfirmedChildIds.length}人が未確認です`;
  title.style.display = "flex";
  title.style.alignItems = "center";
  title.style.gap = "8px";
  container.appendChild(title);

  const chipList = document.createElement("div");
  chipList.className = "unconfirmed-chip-list";
  for (const childId of unconfirmedChildIds) {
    const p = session.participants.find((x) => x.childId === childId);
    const chip = document.createElement("button");
    chip.className = "chip chip--tappable chip--warning";
    chip.textContent = p?.nameSnapshot ?? "?";
    chip.addEventListener("click", () => {
      setHighlight(childId);
      router.closeOverlay();
    });
    chipList.appendChild(chip);
  }
  container.appendChild(chipList);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const backBtn = document.createElement("button");
  backBtn.className = "btn btn--primary btn--block";
  backBtn.textContent = "戻って確認する";
  backBtn.addEventListener("click", () => router.closeOverlay());

  const forceBtn = document.createElement("button");
  forceBtn.className = "link-btn";
  forceBtn.style.textAlign = "center";
  forceBtn.textContent = "未確認のまま記録する";
  forceBtn.addEventListener("click", () => {
    const ok = confirm(`本当に${unconfirmedChildIds.length}人を未確認のまま記録しますか?`);
    if (!ok) return;
    recordCheckpoint(checkpointId, { allowUnconfirmed: true });
    router.closeOverlay();
  });

  actions.appendChild(backBtn);
  actions.appendChild(forceBtn);
  container.appendChild(actions);
}

export function unmount() {}
