const SYNC_STATUS_VALUES = new Set(["saved", "saving", "pending", "offline", "error"]);
const SYNC_STUCK_TIMEOUT_MS = 18000;

function normalizeSyncStatus(status, online = navigator.onLine) {
  const value = SYNC_STATUS_VALUES.has(status) ? status : (online ? "saved" : "offline");
  if (!online && value !== "saving" && value !== "error") return "offline";
  return value;
}

function syncLabelFor(status, online = navigator.onLine) {
  const value = normalizeSyncStatus(status, online);
  if (value === "saving") return "Saving";
  if (value === "pending") return "Pending";
  if (value === "offline") return "Local saved";
  if (value === "error") return "Sync error";
  return "Saved";
}

function syncStatusFromSnapshot(snapshot, user, online = navigator.onLine) {
  if (snapshot?.meta?.pendingSync) {
    if (!sb || !user?.id || user.id === "local" || !online) return "offline";
    return "pending";
  }
  return online ? "saved" : "offline";
}

function useSyncStatusMachine(initialStatus = navigator.onLine ? "saved" : "offline") {
  const [syncStatus, setRawSyncStatus] = useState(() => normalizeSyncStatus(initialStatus));
  const [syncLabel, setRawSyncLabel] = useState(() => syncLabelFor(initialStatus));
  const savingStartedAtRef = useRef(0);

  function setSyncState(status, label) {
    const normalized = normalizeSyncStatus(status);
    savingStartedAtRef.current = normalized === "saving" ? Date.now() : 0;
    setRawSyncStatus(normalized);
    setRawSyncLabel(label || syncLabelFor(normalized));
  }

  function setSyncStatus(status) {
    const normalized = normalizeSyncStatus(status);
    savingStartedAtRef.current = normalized === "saving" ? Date.now() : 0;
    setRawSyncStatus(normalized);
  }

  function setSyncLabel(label) {
    setRawSyncLabel(String(label || ""));
  }

  useEffect(() => {
    if (syncStatus !== "saving") return undefined;
    const timer = window.setTimeout(() => {
      if (!savingStartedAtRef.current) return;
      if (Date.now() - savingStartedAtRef.current < SYNC_STUCK_TIMEOUT_MS) return;
      setSyncState(navigator.onLine ? "pending" : "offline");
    }, SYNC_STUCK_TIMEOUT_MS + 250);
    return () => window.clearTimeout(timer);
  }, [syncStatus]);

  return {
    syncStatus,
    syncLabel,
    setSyncStatus,
    setSyncLabel,
    setSyncState
  };
}
