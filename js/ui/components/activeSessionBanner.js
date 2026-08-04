import { getState, subscribe } from "../../state.js";
import * as router from "../../router.js";
import { formatTime } from "../../utils/date.js";

let subscribed = false;

function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  subscribe("session:started", renderActiveSessionBanner);
  subscribe("session:ended", renderActiveSessionBanner);
}

export function renderActiveSessionBanner() {
  ensureSubscribed();
  const el = document.getElementById("active-session-banner");
  if (!el) return;

  const { activeSession, currentScreen } = getState();
  if (!activeSession || currentScreen === "session") {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  el.classList.remove("hidden");
  el.innerHTML = "";

  const text = document.createElement("span");
  text.className = "active-session-banner__text";
  text.textContent = `お散歩が進行中です(${formatTime(activeSession.startedAt)}〜)`;

  const btn = document.createElement("button");
  btn.className = "link-btn";
  btn.textContent = "再開する";
  btn.addEventListener("click", () => {
    router.navigateTo("session", { sessionId: activeSession.sessionId });
  });

  el.appendChild(text);
  el.appendChild(btn);
}
