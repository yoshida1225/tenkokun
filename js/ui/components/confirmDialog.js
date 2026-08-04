import * as router from "../../router.js";

export function mount(container, params) {
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "overlay-title";
  title.textContent = params.title;
  container.appendChild(title);

  if (params.message) {
    const msg = document.createElement("p");
    msg.style.color = "var(--color-text-secondary)";
    msg.textContent = params.message;
    container.appendChild(msg);
  }

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const confirmBtn = document.createElement("button");
  confirmBtn.className = `btn btn--block ${params.danger ? "btn--danger" : "btn--primary"}`;
  confirmBtn.textContent = params.confirmLabel || "実行する";
  confirmBtn.addEventListener("click", () => {
    router.closeOverlay();
    params.onConfirm?.();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--block btn--secondary";
  cancelBtn.textContent = params.cancelLabel || "キャンセル";
  cancelBtn.addEventListener("click", () => router.closeOverlay());

  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  container.appendChild(actions);
}

export function unmount() {}

export function confirm(params) {
  router.openOverlay("confirmDialog", params);
}
