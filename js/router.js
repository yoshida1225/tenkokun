import * as screenHome from "./ui/screenHome.js";
import * as screenRosterList from "./ui/screenRosterList.js";
import * as screenChildEdit from "./ui/screenChildEdit.js";
import * as screenParticipantSelect from "./ui/screenParticipantSelect.js";
import * as screenSession from "./ui/screenSession.js";
import * as screenHistoryList from "./ui/screenHistoryList.js";
import * as screenHistoryDetail from "./ui/screenHistoryDetail.js";
import * as screenSettings from "./ui/screenSettings.js";

import * as sheetUnconfirmedWarning from "./ui/sheetUnconfirmedWarning.js";
import * as sheetAddCheckpoint from "./ui/sheetAddCheckpoint.js";
import * as sheetExitSelect from "./ui/sheetExitSelect.js";
import * as sheetExitReason from "./ui/sheetExitReason.js";
import * as modalEndSession from "./ui/modalEndSession.js";
import * as modalResumeSession from "./ui/modalResumeSession.js";
import * as confirmDialog from "./ui/components/confirmDialog.js";

import { renderActiveSessionBanner } from "./ui/components/activeSessionBanner.js";

const SCREENS = {
  home: screenHome,
  rosterList: screenRosterList,
  childEdit: screenChildEdit,
  participantSelect: screenParticipantSelect,
  session: screenSession,
  historyList: screenHistoryList,
  historyDetail: screenHistoryDetail,
  settings: screenSettings,
};

const OVERLAYS = {
  unconfirmedWarning: sheetUnconfirmedWarning,
  addCheckpoint: sheetAddCheckpoint,
  exitSelect: sheetExitSelect,
  exitReason: sheetExitReason,
  endSession: modalEndSession,
  resumeSession: modalResumeSession,
  confirmDialog,
};

let stateModule = null; // set by init() to avoid a circular import at module-eval time
let currentScreenId = null;
let currentOverlayId = null;

export function init(state) {
  stateModule = state;
  window.addEventListener("popstate", onPopState);
}

function screenContainer(screenId) {
  return document.getElementById(`screen-${screenId}`);
}

function overlayContainer(overlayId) {
  return document.getElementById(`overlay-${overlayId}`);
}

function mountScreenDom(screenId, params) {
  if (currentScreenId && SCREENS[currentScreenId]) {
    SCREENS[currentScreenId].unmount?.();
    screenContainer(currentScreenId)?.classList.add("hidden");
  }
  currentScreenId = screenId;
  const container = screenContainer(screenId);
  container?.classList.remove("hidden");
  SCREENS[screenId].mount(container, params ?? {});
  stateModule.setCurrentScreen(screenId, params ?? {});
  renderActiveSessionBanner();
}

function mountOverlayDom(overlayId, params) {
  if (currentOverlayId) unmountOverlayDom();
  currentOverlayId = overlayId;
  const container = overlayContainer(overlayId);
  container?.classList.remove("hidden");
  ensureScrim();
  OVERLAYS[overlayId].mount(container, params ?? {});
}

function unmountOverlayDom() {
  if (!currentOverlayId) return;
  OVERLAYS[currentOverlayId].unmount?.();
  overlayContainer(currentOverlayId)?.classList.add("hidden");
  currentOverlayId = null;
  removeScrim();
}

function ensureScrim() {
  if (document.getElementById("overlay-scrim")) return;
  const scrim = document.createElement("div");
  scrim.id = "overlay-scrim";
  scrim.className = "overlay-scrim";
  scrim.addEventListener("click", () => goBack());
  document.getElementById("overlay-root").appendChild(scrim);
}

function removeScrim() {
  document.getElementById("overlay-scrim")?.remove();
}

export function navigateTo(screenId, params = {}, { replace = false } = {}) {
  if (currentOverlayId) unmountOverlayDom();
  mountScreenDom(screenId, params);
  const historyState = { screenId, params };
  if (replace) {
    history.replaceState(historyState, "", `#${screenId}`);
  } else {
    history.pushState(historyState, "", `#${screenId}`);
  }
}

export function goBack() {
  history.back();
}

function toHistoryParams(params) {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "function") {
      result[key] = value;
    }
  }
  return result;
}

export function openOverlay(overlayId, params = {}) {
  mountOverlayDom(overlayId, params);
  history.pushState(
    { screenId: currentScreenId, overlay: overlayId, params: toHistoryParams(params) },
    "",
    location.hash
  );
}

export function closeOverlay() {
  if (!currentOverlayId) return;
  goBack();
}

function onPopState(event) {
  const s = event.state || { screenId: "home", params: {} };

  if (currentOverlayId && s.overlay !== currentOverlayId) {
    unmountOverlayDom();
  } else if (!currentOverlayId && s.overlay) {
    mountOverlayDom(s.overlay, s.params);
  }

  if (s.screenId && s.screenId !== currentScreenId) {
    mountScreenDom(s.screenId, s.params);
  }
}

export function getCurrentScreenId() {
  return currentScreenId;
}
