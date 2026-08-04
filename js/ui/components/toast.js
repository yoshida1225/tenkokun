function root() {
  return document.getElementById("toast-root");
}

function buildToastEl(message, { actionLabel, onAction } = {}) {
  const el = document.createElement("div");
  el.className = "toast";
  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);
  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.className = "link-btn";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      onAction();
      el.remove();
    });
    el.appendChild(btn);
  }
  return el;
}

export function showToast(message, { duration = 3000 } = {}) {
  const el = buildToastEl(message);
  root()?.appendChild(el);
  setTimeout(() => el.remove(), duration);
  return () => el.remove();
}

export function showPersistent(message, { actionLabel, onAction } = {}) {
  const el = buildToastEl(message, { actionLabel, onAction });
  root()?.appendChild(el);
  return () => el.remove();
}
