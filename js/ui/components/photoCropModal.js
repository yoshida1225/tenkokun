import { cropAndCompress } from "../../utils/image.js";
import { showToast } from "./toast.js";

let activeModal = null;

export function open({ file, onConfirm, onCancel }) {
  if (activeModal) activeModal.cleanup();

  const objectUrl = URL.createObjectURL(file);

  const modal = document.createElement("div");
  modal.className = "photo-crop";
  modal.innerHTML = `
    <h2 class="overlay-title">写真の位置を調整</h2>
    <p class="settings-row__desc">ドラッグで位置を、スライダーで拡大を調整してください。</p>
    <div class="photo-crop__viewport">
      <img class="photo-crop__img" alt="" draggable="false">
    </div>
    <input type="range" class="photo-crop__zoom" min="1" max="3" step="0.01" value="1" aria-label="拡大">
    <div class="overlay-actions">
      <button type="button" class="btn btn--primary btn--block photo-crop__confirm">この位置で使う</button>
      <button type="button" class="btn btn--secondary btn--block photo-crop__cancel">キャンセル</button>
    </div>
  `;

  const img = modal.querySelector(".photo-crop__img");
  const viewport = modal.querySelector(".photo-crop__viewport");
  const zoomInput = modal.querySelector(".photo-crop__zoom");
  const confirmBtn = modal.querySelector(".photo-crop__confirm");
  const cancelBtn = modal.querySelector(".photo-crop__cancel");

  let naturalW = 0;
  let naturalH = 0;
  let viewportSize = 0;
  let baseScale = 1;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let dragStart = null;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function applyTransform() {
    img.style.width = `${naturalW * scale}px`;
    img.style.height = `${naturalH * scale}px`;
    img.style.transform = `translate(${tx}px, ${ty}px)`;
  }

  function clampPosition() {
    const dispW = naturalW * scale;
    const dispH = naturalH * scale;
    tx = clamp(tx, viewportSize - dispW, 0);
    ty = clamp(ty, viewportSize - dispH, 0);
  }

  function onZoomInput() {
    const center = viewportSize / 2;
    const imgCx = (center - tx) / scale;
    const imgCy = (center - ty) / scale;
    scale = baseScale * Number(zoomInput.value);
    tx = center - imgCx * scale;
    ty = center - imgCy * scale;
    clampPosition();
    applyTransform();
  }
  zoomInput.addEventListener("input", onZoomInput);

  function onPointerDown(e) {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY, tx, ty };
    viewport.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    tx = dragStart.tx + (e.clientX - dragStart.x);
    ty = dragStart.ty + (e.clientY - dragStart.y);
    clampPosition();
    applyTransform();
  }
  function onPointerUp(e) {
    dragging = false;
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture already released
    }
  }
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);

  img.addEventListener("load", () => {
    naturalW = img.naturalWidth;
    naturalH = img.naturalHeight;
    viewportSize = viewport.clientWidth;
    baseScale = viewportSize / Math.min(naturalW, naturalH);
    scale = baseScale;
    tx = (viewportSize - naturalW * scale) / 2;
    ty = (viewportSize - naturalH * scale) / 2;
    applyTransform();
  });
  img.src = objectUrl;

  function onKeydown(e) {
    if (e.key === "Escape") handleCancel();
  }
  document.addEventListener("keydown", onKeydown);

  function cleanup() {
    URL.revokeObjectURL(objectUrl);
    modal.remove();
    document.body.classList.remove("no-scroll");
    document.removeEventListener("keydown", onKeydown);
    activeModal = null;
  }

  function handleCancel() {
    cleanup();
    onCancel?.();
  }

  async function handleConfirm() {
    confirmBtn.disabled = true;
    try {
      const sx = -tx / scale;
      const sy = -ty / scale;
      const sw = viewportSize / scale;
      const sh = viewportSize / scale;
      const blob = await cropAndCompress(file, { sx, sy, sw, sh });
      cleanup();
      onConfirm(blob);
    } catch (err) {
      confirmBtn.disabled = false;
      showToast("写真の処理に失敗しました");
      console.error(err);
    }
  }

  confirmBtn.addEventListener("click", handleConfirm);
  cancelBtn.addEventListener("click", handleCancel);

  document.body.classList.add("no-scroll");
  document.body.appendChild(modal);
  activeModal = { cleanup };
}
