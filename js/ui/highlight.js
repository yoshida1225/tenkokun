// Transient single-value store so one screen can ask screenSession (S5) to
// scroll to and flash a specific tile on its next render.
//
// Two producers with opposite meanings, hence `kind`:
//   "alert" — sheetUnconfirmedWarning (S6): "this child is missing" (red)
//   "voice" — voice confirmation: "I heard this name" (green)
let pendingChildId = null;
let pendingKind = null;

export function setHighlight(childId, kind = "alert") {
  pendingChildId = childId;
  pendingKind = kind;
}

export function consumeHighlight() {
  const childId = pendingChildId;
  const kind = pendingKind;
  pendingChildId = null;
  pendingKind = null;
  return { childId, kind };
}
