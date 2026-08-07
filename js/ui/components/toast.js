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

export function showToast(message, { duration = 3000, actionLabel, onAction } = {}) {
  const el = buildToastEl(message, { actionLabel, onAction });
  root()?.appendChild(el);
  const timer = setTimeout(() => el.remove(), duration);
  return () => {
    clearTimeout(timer);
    el.remove();
  };
}

// NOTE: never use this over the roll-call screen. .toast-root sits at the
// bottom edge with pointer-events:auto, directly on top of .sticky-footer —
// a toast that never dismisses would swallow taps on the record and mic
// buttons for the rest of the walk. Use showToast with a duration instead.
export function showPersistent(message, { actionLabel, onAction } = {}) {
  const el = buildToastEl(message, { actionLabel, onAction });
  root()?.appendChild(el);
  return () => el.remove();
}
