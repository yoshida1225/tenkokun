import { endSession } from "../state.js";
import * as router from "../router.js";
import { showToast } from "./components/toast.js";

export function mount(container) {
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "overlay-title";
  title.textContent = "お散歩を終了しますか?";
  container.appendChild(title);

  const msg = document.createElement("p");
  msg.style.color = "var(--color-text-secondary)";
  msg.textContent = "終了すると点呼記録が履歴に保存されます。";
  container.appendChild(msg);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const endBtn = document.createElement("button");
  endBtn.className = "btn btn--primary btn--block";
  endBtn.textContent = "終了する";
  endBtn.addEventListener("click", () => {
    const result = endSession();
    if (result.ok) {
      router.closeOverlay();
      router.navigateTo("home", {}, { replace: true });
    } else {
      const detail = result.error?.name || result.error?.message;
      showToast(detail ? `終了処理に失敗しました (${detail})` : "終了処理に失敗しました。もう一度お試しください");
    }
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--secondary btn--block";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () => router.closeOverlay());

  actions.appendChild(endBtn);
  actions.appendChild(cancelBtn);
  container.appendChild(actions);
}

export function unmount() {}
