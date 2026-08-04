import { getPhotoObjectURL } from "../../storage.js";
import { GROUP_PRESETS } from "../../constants.js";

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#4f46e5"];
const GROUP_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706"];
const GROUP_COLOR_FALLBACK = "#64748b";

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function colorForGroup(group) {
  if (!group) return null;
  const idx = GROUP_PRESETS.indexOf(group);
  return idx === -1 ? GROUP_COLOR_FALLBACK : GROUP_COLORS[idx];
}

function badgeIconId(status) {
  if (status === "checked") return "#icon-check";
  if (status === "exited") return "#icon-door-exit";
  return "#icon-circle";
}

export function createTile({ name, photoRef, status = "default", meta, onClick, group }) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "tile";
  applyStatusClass(el, status);

  const photoWrap = document.createElement("div");
  photoWrap.className = "tile__photo-wrap";

  const avatar = document.createElement("div");
  avatar.className = "tile__avatar";
  avatar.style.background = colorForGroup(group) || colorForName(name || "");
  avatar.textContent = (name || "").trim() || "?";
  photoWrap.appendChild(avatar);

  const badge = document.createElement("div");
  badge.className = "tile__badge";
  badge.innerHTML = `<svg class="icon"><use href="${badgeIconId(status)}"></use></svg>`;
  photoWrap.appendChild(badge);

  const nameEl = document.createElement("div");
  nameEl.className = "tile__name";
  nameEl.textContent = name;

  el.appendChild(photoWrap);
  el.appendChild(nameEl);

  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "tile__meta";
    metaEl.textContent = meta;
    el.appendChild(metaEl);
  }

  if (onClick) el.addEventListener("click", onClick);

  let objectUrl = null;
  if (photoRef) {
    getPhotoObjectURL(photoRef).then((url) => {
      if (!url || !photoWrap.isConnected) return;
      objectUrl = url;
      const img = document.createElement("img");
      img.className = "tile__photo";
      img.src = url;
      photoWrap.replaceChild(img, avatar);
    });
  }

  return { el, revoke: () => objectUrl && URL.revokeObjectURL(objectUrl) };
}

function applyStatusClass(el, status) {
  el.classList.remove("tile--checked", "tile--exited", "tile--excluded");
  if (status === "checked") el.classList.add("tile--checked");
  if (status === "exited") el.classList.add("tile--exited");
  if (status === "excluded") el.classList.add("tile--excluded");
}

export function setTileStatus(tileEl, status) {
  applyStatusClass(tileEl, status);
  const use = tileEl.querySelector(".tile__badge use");
  if (use) use.setAttribute("href", badgeIconId(status));
  tileEl.classList.remove("tile--checkmark-pop");
  void tileEl.offsetWidth;
  if (status === "checked") tileEl.classList.add("tile--checkmark-pop");
}
