// Pure logic for reclaiming orphaned session photo copies. No DOM/storage
// access — storage.js owns IndexedDB, state.js drives the sweep.
//
// startSession copies every participant's roster photo to a per-session key so
// history keeps the photo the child actually had that day. Nothing ever read
// those copies back after the walk ended, so they accumulated ~1MB per walk
// forever and eventually exhausted the origin quota.
//
// COUPLING CONTRACT: this deletes every ended session's photos because no
// history screen displays them (verified: photoSnapshot is read only by
// ui/screenSession.js and ui/sheetExitSelect.js, both active-session-only).
// If a history screen ever shows participant photos, this must change to keep
// those sessions' refs.

export const ROSTER_PREFIX = "roster:";
export const SESSION_PREFIX = "session:";

// "session:s_20260807_01:c_mseb204wh8cs13" -> "s_20260807_01".
// Neither generateSessionId (s_YYYYMMDD_NN) nor generateId (<prefix>_<base36>)
// can produce a ':', so splitting on it is unambiguous.
export function sessionIdFromPhotoRef(photoRef) {
  if (typeof photoRef !== "string" || !photoRef.startsWith(SESSION_PREFIX)) return null;
  const parts = photoRef.split(":");
  if (parts.length !== 3) return null;
  const [, sessionId, childId] = parts;
  if (!sessionId || !childId) return null;
  return sessionId;
}

// Deny by default: a key is returned ONLY if it is a well-formed session photo
// ref whose session is not in keepSessionIds. Anything else — roster photos,
// malformed keys, or a namespace some future version introduces — is never
// returned, so an old sweep can't destroy data it doesn't understand.
export function selectOrphanPhotoRefs(allRefs, { keepSessionIds = [] } = {}) {
  if (!Array.isArray(allRefs)) return [];
  const keep = new Set(keepSessionIds);
  return allRefs.filter((ref) => {
    const sessionId = sessionIdFromPhotoRef(ref);
    return sessionId !== null && !keep.has(sessionId);
  });
}
