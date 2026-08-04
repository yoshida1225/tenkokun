import { addExitEvent } from "../state.js";
import * as router from "../router.js";

const REASONS = [
  { value: "pickup", label: "お迎え" },
  { value: "illness_with_staff", label: "体調不良等で職員付き添い戻園" },
  { value: "other", label: "その他(自由記述)" },
];

let selectedReason = null;

export function mount(container, params) {
  selectedReason = null;
  render(container, params);
}

export function unmount() {}

function render(container, params) {
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "overlay-title";
  title.textContent = "途中退出の理由";
  container.appendChild(title);

  const now = new Date();
  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  timeInput.style.width = "100%";

  const timeRow = document.createElement("div");
  timeRow.className = "exit-reason__time";
  timeRow.innerHTML = "<span>時刻</span>";
  timeRow.appendChild(timeInput);
  container.appendChild(timeRow);

  const cardList = document.createElement("div");
  for (const reason of REASONS) {
    const card = document.createElement("button");
    card.className = `radio-card${selectedReason === reason.value ? " radio-card--selected" : ""}`;
    card.style.width = "100%";
    card.innerHTML = `<span class="radio-card__dot"></span><span>${reason.label}</span>`;
    card.addEventListener("click", () => {
      selectedReason = reason.value;
      render(container, params);
    });
    cardList.appendChild(card);
  }
  container.appendChild(cardList);

  let noteInput = null;
  if (selectedReason === "other") {
    noteInput = document.createElement("textarea");
    noteInput.className = "exit-reason__note";
    noteInput.placeholder = "詳細を入力してください";
    noteInput.style.width = "100%";
    noteInput.rows = 3;
    container.appendChild(noteInput);
  }

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn--primary btn--block";
  saveBtn.textContent = "記録して閉じる";
  saveBtn.disabled = !selectedReason;
  saveBtn.addEventListener("click", () => {
    const [h, m] = timeInput.value.split(":").map(Number);
    const occurredAt = new Date(now);
    occurredAt.setHours(h, m, 0, 0);
    addExitEvent({
      childIds: params.childIds,
      reason: selectedReason,
      reasonNote: noteInput ? noteInput.value.trim() || null : null,
      occurredAt: occurredAt.toISOString(),
    });
    router.closeOverlay();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--secondary btn--block";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () => router.closeOverlay());

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  container.appendChild(actions);
}
