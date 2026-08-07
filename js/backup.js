import { getState } from "./state.js";
import * as storage from "./storage.js";
import { toCsv, downloadCsv } from "./utils/csv.js";
import { formatDateTime, formatTime } from "./utils/date.js";
import { MAX_ALIASES_PER_CHILD } from "./constants.js";

const SCHEMA_VERSION = 1;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportRosterBackup() {
  const { roster } = getState();
  const items = await Promise.all(
    roster.map(async (child) => {
      let photoDataUrl = null;
      if (child.photoRef) {
        const blob = await storage.getPhoto(child.photoRef);
        if (blob) photoDataUrl = await blobToBase64(blob);
      }
      return { ...child, photoDataUrl };
    })
  );
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    roster: items,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenkokun-roster-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true, sizeBytes: blob.size };
}

export function validateBackupShape(data) {
  return !!(data && typeof data.schemaVersion === "number" && Array.isArray(data.roster));
}

// Export spreads the whole child, but import whitelists — so any field missed
// here is silently dropped while still looking intact in the JSON file. Pure
// and separate from the photo I/O so it can be tested directly.
// No SCHEMA_VERSION bump needed: every field added here is optional with a
// default, so older backups still restore cleanly.
export function normalizeBackupChild(item) {
  if (!item?.childId || !item?.name) return null;
  return {
    childId: item.childId,
    name: item.name,
    tags: Array.isArray(item.tags) ? item.tags : [],
    voiceAliases: Array.isArray(item.voiceAliases)
      ? item.voiceAliases
          .filter((a) => typeof a === "string" && a.trim())
          .slice(0, MAX_ALIASES_PER_CHILD)
      : [],
    photoRef: null,
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

export async function importRosterBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: "ファイルの読み込みに失敗しました" };
  }
  if (!validateBackupShape(data)) {
    return { ok: false, error: "このファイルは点呼くんの名簿バックアップではないようです" };
  }

  const children = [];
  for (const item of data.roster) {
    const child = normalizeBackupChild(item);
    if (!child) continue;
    if (item.photoDataUrl) {
      try {
        const blob = await dataUrlToBlob(item.photoDataUrl);
        const photoRef = `roster:${child.childId}`;
        const result = await storage.savePhoto(photoRef, blob);
        if (result.ok) child.photoRef = photoRef;
      } catch (err) {
        console.error("photo restore failed", child.childId, err);
      }
    }
    children.push(child);
  }

  storage.setRosterRaw(children);
  return { ok: true, count: children.length };
}

const REASON_LABEL = { pickup: "お迎え", illness_with_staff: "体調不良等で職員付き添い", other: "その他" };

// Pure row-building, kept separate from the DOM-triggering download side effect
// so it stays testable under Node (plan 14-1).
export function buildSessionCsvRows(session) {
  const rows = [["チェックポイント", "時刻", "確認済み/対象", "未確認あり"]];
  const sorted = [...session.checkpoints].sort((a, b) => a.order - b.order);
  for (const cp of sorted) {
    if (!cp.recordedAt) continue;
    rows.push([
      cp.label,
      formatDateTime(cp.recordedAt),
      `${cp.confirmedChildIds.length}/${cp.confirmedChildIds.length + cp.unconfirmedChildIds.length}`,
      cp.recordedWithWarning ? "あり" : "なし",
    ]);
  }
  rows.push([]);
  rows.push(["途中退出", "時刻", "理由"]);
  for (const e of session.exitEvents) {
    const name = session.participants.find((p) => p.childId === e.childId)?.nameSnapshot ?? e.childId;
    rows.push([name, formatTime(e.occurredAt), e.reasonNote || REASON_LABEL[e.reason] || e.reason]);
  }
  return rows;
}

export function buildHistoryCsvRows(sessions) {
  const rows = [["お散歩日時", "チェックポイント", "時刻", "確認済み/対象", "未確認あり"]];
  for (const session of sessions) {
    const sorted = [...session.checkpoints].sort((a, b) => a.order - b.order);
    for (const cp of sorted) {
      if (!cp.recordedAt) continue;
      rows.push([
        formatDateTime(session.startedAt),
        cp.label,
        formatDateTime(cp.recordedAt),
        `${cp.confirmedChildIds.length}/${cp.confirmedChildIds.length + cp.unconfirmedChildIds.length}`,
        cp.recordedWithWarning ? "あり" : "なし",
      ]);
    }
  }
  return rows;
}

export function exportSessionCsv(session) {
  downloadCsv(`tenkokun-${session.sessionId}.csv`, buildSessionCsvRows(session));
}

export function exportAllHistoryCsv(sessions) {
  downloadCsv(`tenkokun-history-${new Date().toISOString().slice(0, 10)}.csv`, buildHistoryCsvRows(sessions));
}

export { toCsv };
