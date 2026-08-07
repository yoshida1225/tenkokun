// Bump this on every deploy that touches cached files (ASSETS below, or any
// JS/CSS it imports) — the browser only checks for a SW update when sw.js's
// own bytes change, so an unbumped version means the PWA never updates.
const CACHE_VERSION = "v15";
const CACHE_NAME = `tenkokun-static-${CACHE_VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/components.css",
  "./styles/screens.css",
  "./js/main.js",
  "./js/router.js",
  "./js/state.js",
  "./js/storage.js",
  "./js/roster.js",
  "./js/constants.js",
  "./js/session.js",
  "./js/backup.js",
  "./js/utils/id.js",
  "./js/utils/kana.js",
  "./js/utils/image.js",
  "./js/utils/date.js",
  "./js/utils/csv.js",
  "./js/ui/screenHome.js",
  "./js/ui/screenRosterList.js",
  "./js/ui/screenChildEdit.js",
  "./js/ui/screenParticipantSelect.js",
  "./js/ui/screenSession.js",
  "./js/ui/screenHistoryList.js",
  "./js/ui/screenHistoryDetail.js",
  "./js/ui/screenSettings.js",
  "./js/ui/sheetUnconfirmedWarning.js",
  "./js/ui/sheetAddCheckpoint.js",
  "./js/ui/sheetExitSelect.js",
  "./js/ui/sheetExitReason.js",
  "./js/ui/modalEndSession.js",
  "./js/ui/modalResumeSession.js",
  "./js/ui/highlight.js",
  "./js/ui/components/tile.js",
  "./js/ui/components/toast.js",
  "./js/ui/components/confirmDialog.js",
  "./js/ui/components/photoCropModal.js",
  "./js/ui/components/activeSessionBanner.js",
  "./js/voice.js",
  "./js/photoGc.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("tenkokun-static-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  // Lets the settings screen report the version actually running in this
  // worker, rather than the version the page's JS believes it is. The two can
  // differ because the fetch handler above is cache-first with no
  // revalidation, and that divergence is what makes "did the update apply?"
  // impossible to answer from the outside.
  if (event.data?.type === "GET_VERSION") {
    event.ports[0]?.postMessage({ cacheVersion: CACHE_VERSION });
  }
});
