import { getState, saveSettings, resetAll, sweepOrphanPhotos } from "../state.js";
import * as router from "../router.js";
import * as confirmDialog from "./components/confirmDialog.js";
import { showToast } from "./components/toast.js";
import { exportRosterBackup, importRosterBackup, exportAllHistoryCsv } from "../backup.js";
import { estimateStorageUsage } from "../storage.js";
import { formatDateTime } from "../utils/date.js";
import { APP_VERSION } from "../constants.js";

export function mount(container) {
  render(container);
}

export function unmount() {}

// Asks the worker that actually served this page, via navigator.serviceWorker
// .controller — NOT .ready, whose .active can be a newer worker that has not
// served anything yet. Resolves null if there is no controller or the worker
// predates the GET_VERSION handler (which every already-installed copy does),
// so the caller must render that case rather than hang on 確認中….
function getServiceWorkerVersion({ timeoutMs = 1500 } = {}) {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data?.cacheVersion ?? null);
    };
    try {
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function formatBytes(n) {
  if (!n) return "0 KB";
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

async function render(container) {
  const { settings, roster, sessions } = getState();

  container.innerHTML = "";
  container.className = "screen screen--settings";

  const header = document.createElement("div");
  header.className = "header";
  header.innerHTML = `
    <button class="header__back"><svg class="icon"><use href="#icon-chevron-left"></use></svg>戻る</button>
    <h1 class="header__title">設定</h1>
    <span class="header__action" aria-hidden="true"></span>
  `;
  header.querySelector(".header__back").addEventListener("click", () => router.navigateTo("home"));
  container.appendChild(header);

  const scroll = document.createElement("div");
  scroll.className = "screen-scroll";

  // Backup section
  const backupSection = document.createElement("div");
  backupSection.className = "settings-section";
  backupSection.innerHTML = `<div class="settings-section__title">名簿のバックアップ</div>`;

  const lastBackupRow = document.createElement("div");
  lastBackupRow.className = "settings-row__desc";
  lastBackupRow.textContent = settings.lastBackupAt
    ? `最終バックアップ: ${formatDateTime(settings.lastBackupAt)}`
    : "まだバックアップしていません";
  backupSection.appendChild(lastBackupRow);

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn btn--secondary btn--block";
  exportBtn.style.marginTop = "12px";
  exportBtn.innerHTML = '<svg class="icon"><use href="#icon-download"></use></svg>名簿をJSONで書き出す';
  exportBtn.addEventListener("click", async () => {
    const result = await exportRosterBackup();
    if (result.ok) {
      saveSettings({ lastBackupAt: new Date().toISOString() });
      showToast(`書き出しました(約${formatBytes(result.sizeBytes)})`);
      render(container);
    }
  });
  backupSection.appendChild(exportBtn);

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json";
  importInput.className = "hidden";
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const result = await importRosterBackup(file);
    if (result.ok) {
      showToast(`名簿を読み込みました(${result.count}人)`);
      location.reload();
    } else {
      showToast(result.error || "読み込みに失敗しました");
    }
  });

  const importBtn = document.createElement("button");
  importBtn.className = "btn btn--secondary btn--block";
  importBtn.style.marginTop = "8px";
  importBtn.innerHTML = '<svg class="icon"><use href="#icon-upload"></use></svg>名簿をJSONから読み込む';
  importBtn.addEventListener("click", () => importInput.click());
  backupSection.appendChild(importBtn);
  backupSection.appendChild(importInput);
  scroll.appendChild(backupSection);

  // History export section
  const historySection = document.createElement("div");
  historySection.className = "settings-section";
  historySection.innerHTML = `<div class="settings-section__title">点呼履歴</div>`;
  const csvBtn = document.createElement("button");
  csvBtn.className = "btn btn--secondary btn--block";
  csvBtn.textContent = "全履歴をCSVで書き出す";
  csvBtn.disabled = sessions.length === 0;
  csvBtn.addEventListener("click", () => exportAllHistoryCsv(sessions));
  historySection.appendChild(csvBtn);
  scroll.appendChild(historySection);

  // Storage usage
  const storageSection = document.createElement("div");
  storageSection.className = "settings-section";
  storageSection.innerHTML = `<div class="settings-section__title">端末ストレージ</div><div class="settings-row__desc">確認中…</div>`;
  scroll.appendChild(storageSection);
  estimateStorageUsage().then(({ usageBytes, quotaBytes }) => {
    const desc = storageSection.querySelector(".settings-row__desc");
    if (desc) {
      desc.textContent = quotaBytes
        ? `使用中: 約${formatBytes(usageBytes)} / 上限 約${formatBytes(quotaBytes)}(名簿${roster.length}人・履歴${sessions.length}件)`
        : "この端末では使用量を確認できません";
    }
  });
  // Runs on its own at startup; this is the manual lever so the effect is
  // visible and recoverable if the automatic sweep ever misbehaves.
  const gcBtn = document.createElement("button");
  gcBtn.className = "btn btn--secondary btn--block";
  gcBtn.style.marginTop = "var(--space-3)";
  gcBtn.textContent = "不要な写真データを整理する";
  gcBtn.addEventListener("click", async () => {
    gcBtn.disabled = true;
    const { deleted } = await sweepOrphanPhotos();
    gcBtn.disabled = false;
    showToast(deleted ? `${deleted}件の不要な写真を削除しました` : "整理できる写真はありませんでした");
    render(container);
  });
  storageSection.appendChild(gcBtn);

  // Version. Two lines on purpose: the first is what the loaded JS claims, the
  // second is what the service worker actually serving that JS claims. They
  // only agree when a deploy landed cleanly, and hours have been lost to that
  // being unknowable from the outside.
  const versionSection = document.createElement("div");
  versionSection.className = "settings-section";
  versionSection.innerHTML = `<div class="settings-section__title">バージョン</div>`;
  const appLine = document.createElement("div");
  appLine.className = "settings-row__desc";
  appLine.textContent = `アプリ: ${APP_VERSION}`;
  const swLine = document.createElement("div");
  swLine.className = "settings-row__desc";
  swLine.textContent = "Service Worker: 確認中…";
  versionSection.appendChild(appLine);
  versionSection.appendChild(swLine);
  scroll.appendChild(versionSection);

  getServiceWorkerVersion().then((swVersion) => {
    if (!swLine.isConnected) return;
    swLine.textContent = `Service Worker: ${swVersion ?? "応答なし(古いバージョン)"}`;
    if (swVersion && swVersion !== APP_VERSION) {
      const warn = document.createElement("div");
      warn.className = "settings-row__desc";
      warn.style.color = "var(--color-warning)";
      warn.textContent = "⚠ 更新が中途半端です。アプリを完全終了して開き直してください";
      versionSection.appendChild(warn);
    }
  });

  // Danger zone
  const dangerSection = document.createElement("div");
  dangerSection.className = "settings-section";
  dangerSection.style.borderBottom = "none";
  dangerSection.innerHTML = `<div class="settings-section__title">危険操作</div>`;
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn btn--danger btn--block";
  resetBtn.innerHTML = '<svg class="icon"><use href="#icon-trash"></use></svg>全データを削除する';
  resetBtn.addEventListener("click", () => {
    confirmDialog.confirm({
      title: "全データを削除しますか?",
      message: "名簿・点呼履歴・設定がすべて削除されます。この操作は取り消せません。事前にバックアップすることをおすすめします。",
      confirmLabel: "削除する",
      danger: true,
      onConfirm: async () => {
        await resetAll();
        router.navigateTo("home", {}, { replace: true });
      },
    });
  });
  dangerSection.appendChild(resetBtn);
  scroll.appendChild(dangerSection);

  container.appendChild(scroll);
}
