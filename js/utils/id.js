export function generateId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

export function generateSessionId(date, existingSessions) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const dayPrefix = `s_${y}${m}${d}_`;
  const todaysCount = existingSessions.filter((s) => s.sessionId.startsWith(dayPrefix)).length;
  const seq = String(todaysCount + 1).padStart(2, "0");
  return `${dayPrefix}${seq}`;
}
