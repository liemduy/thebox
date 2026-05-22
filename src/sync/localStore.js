function localKey(userId) { return userId ? `${STORAGE_KEY}:${userId}` : `${STORAGE_KEY}:guest`; }
function loadLocalForUser(userId) {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch { return null; }
}
function loadLegacyLocal() {
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch {}
  }
  return null;
}
function saveLocal(state, userId) {
  try {
    const payload = JSON.stringify(sanitizedState(state));
    maybeWarnLargeSnapshot(payload);
    localStorage.setItem(localKey(userId), payload);
  } catch {}
}

function snapshotPayloadBytes(payload) {
  try { return new Blob([payload]).size; } catch { return String(payload || "").length; }
}

function maybeWarnLargeSnapshot(payload) {
  const bytes = snapshotPayloadBytes(payload);
  if (bytes < SNAPSHOT_WARN_BYTES) return;
  const t = Date.now();
  if (t - lastSnapshotSizeWarningAt < 60000) return;
  lastSnapshotSizeWarningAt = t;
  console.warn(`Planner snapshot is ${(bytes / 1048576).toFixed(2)}MB. Long-term storage should move daily action entries out of the full snapshot.`);
}
