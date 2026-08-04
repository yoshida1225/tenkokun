import * as router from "../router.js";
import { formatDateTime } from "../utils/date.js";

export function mount(container, params) {
  const { session } = params;
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "overlay-title";
  title.textContent = "前回のお散歩が終了していません";
  container.appendChild(title);

  const msg = document.createElement("p");
  msg.style.color = "var(--color-text-secondary)";
  msg.textContent = `${formatDateTime(session.startedAt)}に開始したお散歩が進行中です。`;
  container.appendChild(msg);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const resumeBtn = document.createElement("button");
  resumeBtn.className = "btn btn--primary btn--block";
  resumeBtn.textContent = "再開する";
  resumeBtn.addEventListener("click", () => {
    router.navigateTo("session", { sessionId: session.sessionId }, { replace: true });
  });

  const endBtn = document.createElement("button");
  endBtn.className = "btn btn--secondary btn--block";
  endBtn.textContent = "このお散歩を終了する";
  endBtn.addEventListener("click", () => {
    router.openOverlay("endSession", { session });
  });

  actions.appendChild(resumeBtn);
  actions.appendChild(endBtn);
  container.appendChild(actions);
}

export function unmount() {}
