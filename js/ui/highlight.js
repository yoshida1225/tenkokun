// Transient single-value store so sheetUnconfirmedWarning (S6) can ask
// screenSession (S5) to scroll to and flash a specific tile (plan 4-5).
let pendingChildId = null;

export function setHighlight(childId) {
  pendingChildId = childId;
}

export function consumeHighlight() {
  const id = pendingChildId;
  pendingChildId = null;
  return id;
}
