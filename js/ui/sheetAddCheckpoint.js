import { addAdhocCheckpoint } from "../state.js";
import * as router from "../router.js";

const PRESET_LABELS = ["公園にて", "自由遊び中", "その他"];

export function mount(container) {
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "overlay-title";
  title.textContent = "点呼を追加";
  container.appendChild(title);

  const chipRow = document.createElement("div");
  chipRow.className = "tag-list";
  chipRow.style.marginBottom = "12px";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "任意の名称を入力(例: 公園にて)";
  input.style.width = "100%";
  input.style.marginBottom = "16px";

  for (const label of PRESET_LABELS) {
    const chip = document.createElement("button");
    chip.className = "chip chip--tappable";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      input.value = label;
    });
    chipRow.appendChild(chip);
  }

  container.appendChild(chipRow);
  container.appendChild(input);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const addBtn = document.createElement("button");
  addBtn.className = "btn btn--primary btn--block";
  addBtn.textContent = "追加する";
  addBtn.addEventListener("click", () => {
    const label = input.value.trim();
    if (!label) return;
    const checkpoint = addAdhocCheckpoint(label);
    router.closeOverlay();
    router.navigateTo("session", { checkpointId: checkpoint.checkpointId });
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--secondary btn--block";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () => router.closeOverlay());

  actions.appendChild(addBtn);
  actions.appendChild(cancelBtn);
  container.appendChild(actions);
}

export function unmount() {}
