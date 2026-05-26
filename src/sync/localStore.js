function localKey(userId) { return userId ? `${STORAGE_KEY}:${userId}` : `${STORAGE_KEY}:guest`; }
function loadLocalForUser(userId) {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch { return null; }
}

function loadLocalPreviewState() {
  const candidates = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(`${STORAGE_KEY}:`)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      candidates.push(normalizeState(parsed));
    }
  } catch {}
  const legacy = loadLegacyLocal();
  if (legacy) candidates.push(legacy);
  if (!candidates.length) return null;
  const customScore = state => {
    const ui = state?.ui || {};
    const hasCustomLogo = ui.workspaceName && ui.workspaceName !== DEFAULT_WORKSPACE_NAME;
    const hasCustomStyle = Number(ui.logoStyle || 0) !== 0;
    return hasCustomLogo || hasCustomStyle ? 1 : 0;
  };
  return candidates
    .filter(Boolean)
    .sort((a, b) => {
      const bTime = timestampMs(b.meta?.localUpdatedAt || b.meta?.lastSyncedAt || b.meta?.cloudUpdatedAt);
      const aTime = timestampMs(a.meta?.localUpdatedAt || a.meta?.lastSyncedAt || a.meta?.cloudUpdatedAt);
      return (bTime - aTime) || (customScore(b) - customScore(a));
    })[0] || null;
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
