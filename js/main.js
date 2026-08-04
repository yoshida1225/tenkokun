import * as state from "./state.js";
import * as router from "./router.js";
import { showPersistent } from "./ui/components/toast.js";

async function boot() {
  await state.init();
  router.init(state);

  const { activeSession } = state.getState();
  if (activeSession) {
    router.openOverlay("resumeSession", { session: activeSession });
  } else {
    router.navigateTo("home", {}, { replace: true });
  }

  registerServiceWorker();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const reg = await navigator.serviceWorker.register("./sw.js").catch((err) => {
    console.error("SW registration failed", err);
    return null;
  });
  if (!reg) return;

  reg.addEventListener("updatefound", () => {
    const newWorker = reg.installing;
    newWorker?.addEventListener("statechange", () => {
      if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
        showPersistent("新しいバージョンがあります", {
          actionLabel: "更新する",
          onAction: () => newWorker.postMessage({ type: "SKIP_WAITING" }),
        });
      }
    });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;

    if (state.getState().activeSession) {
      const unsubscribe = state.subscribe("session:ended", () => {
        unsubscribe();
        location.reload();
      });
      showPersistent("お散歩終了後に更新が適用されます");
      return;
    }
    location.reload();
  });
}

boot();
