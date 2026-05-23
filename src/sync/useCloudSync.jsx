function useCloudSync({
  db,
  setDb,
  currentUser,
  setBooting,
  setRuntimeFromRoute,
  setSyncStatus,
  setSyncLabel,
  showToast
}) {
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const cloudTimerRef = useRef(null);
  const skipNextAutoSaveRef = useRef(false);

  async function hydrateUserState(user) {
    const userId = user?.id;
    const localState = loadLocalForUser(userId) || loadLegacyLocal();
    let next = localState || seed();
    let usedCloudFallback = false;
    let allowCloudNotes = true;
    if (sb && userId) {
      try {
        setSyncStatus("saving");
        setSyncLabel("Loading");
        const stateRow = await loadCloudWorkspace(userId);
        if (stateRow?.data) {
          const cloudUpdatedAt = validTimestamp(stateRow.updatedAt) || validTimestamp(stateRow.data?.meta?.cloudUpdatedAt);
          const cloudState = markCloudSynced(normalizeState(stateRow.data), cloudUpdatedAt || now());
          const preferLocal = shouldPreferLocal(localState, cloudState, cloudUpdatedAt);
          allowCloudNotes = !preferLocal;
          next = preferLocal ? markPendingSync(localState, localState?.meta?.localUpdatedAt || now()) : cloudState;
        } else if (localState && userId !== "local") {
          next = markPendingSync(localState, localState.meta?.localUpdatedAt || now());
          allowCloudNotes = false;
        }
        if (allowCloudNotes) {
          const normalizedNotes = await loadNormalizedNoteTables(userId);
          if (normalizedNotes) next = mergeNormalizedNotes(next, normalizedNotes.notes, normalizedNotes.links);
        }
        setSyncStatus("saved");
        setSyncLabel("Saved");
      } catch (error) {
        console.warn(error);
        usedCloudFallback = true;
        setSyncStatus("offline");
        setSyncLabel("Local saved");
      }
    }
    try {
      const route = parseRouteHash();
      applyRouteToState(next, route);
      setRuntimeFromRoute(route);
      syncSelectedActionDayWithBox(next);
      if (usedCloudFallback && userId && userId !== "local") skipNextAutoSaveRef.current = true;
      setDb(normalizeState(next));
    } catch (error) {
      console.warn(error);
      setDb(normalizeState(next));
    } finally {
      setBooting(false);
      hydratedRef.current = true;
    }
  }

  function scheduleCloudSync(snapshot, user, delay = 850) {
    const clean = sanitizedState(snapshot);
    clearTimeout(cloudTimerRef.current);
    if (!clean.meta?.pendingSync) {
      setSyncStatus(navigator.onLine ? "saved" : "offline");
      setSyncLabel(navigator.onLine ? "Saved" : "Local saved");
      return;
    }
    if (!canUseCloudSync(user)) {
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      return;
    }
    setSyncStatus("saving");
    setSyncLabel("Saving");
    cloudTimerRef.current = setTimeout(() => pushCloudState(clean, user), delay);
  }

  function reconcileSyncStatus(delay = 200) {
    if (!hydratedRef.current || !currentUser) return;
    const clean = sanitizedState(db);
    const localState = loadLocalForUser(currentUser.id);
    let snapshot = clean;

    if (localState) {
      const localClean = normalizeState(localState);
      const localTime = timestampMs(localClean.meta?.localUpdatedAt);
      const cleanTime = timestampMs(clean.meta?.localUpdatedAt);
      const localSettledSameEdit = localTime >= cleanTime && !localClean.meta?.pendingSync && clean.meta?.pendingSync;
      const localHasNewerEdit = localTime > cleanTime && localClean.meta?.pendingSync;

      if (localSettledSameEdit) {
        snapshot = normalizeState({
          ...clean,
          meta: {
            ...clean.meta,
            pendingSync: false,
            cloudUpdatedAt: localClean.meta?.cloudUpdatedAt || clean.meta?.cloudUpdatedAt,
            lastSyncedAt: localClean.meta?.lastSyncedAt || clean.meta?.lastSyncedAt
          }
        });
        setDb(snapshot);
      } else if (localHasNewerEdit) {
        snapshot = localClean;
        setDb(localClean);
      }
    }

    scheduleCloudSync(snapshot, currentUser, delay);
  }

  async function pushCloudState(snapshot, user, options = {}) {
    if (!canUseCloudSync(user)) {
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      return;
    }
    try {
      const clean = sanitizedState(snapshot);
      if (!options.force && !clean.meta?.pendingSync) {
        setSyncStatus("saved");
        setSyncLabel("Saved");
        return;
      }
      const syncedAt = now();
      const cloudSnapshot = markCloudSynced(clean, syncedAt);
      await saveCloudWorkspace(user.id, cloudSnapshot, syncedAt);
      await pushNormalizedNoteTables(cloudSnapshot, user);
      const currentLocal = loadLocalForUser(user.id);
      const pushedTime = timestampMs(cloudSnapshot.meta?.localUpdatedAt);
      const hasNewerLocalEdit = Boolean(
        currentLocal?.meta?.pendingSync &&
        timestampMs(currentLocal.meta?.localUpdatedAt) > pushedTime
      );
      if (!hasNewerLocalEdit) {
        saveLocal(cloudSnapshot, user.id);
      }
      setDb(prev => {
        const current = normalizeState(prev);
        if (timestampMs(current.meta?.localUpdatedAt) > pushedTime && current.meta?.pendingSync) return current;
        return normalizeState({
          ...current,
          meta: {
            ...current.meta,
            pendingSync: false,
            cloudUpdatedAt: syncedAt,
            lastSyncedAt: syncedAt
          }
        });
      });
      if (hasNewerLocalEdit) {
        setSyncStatus("saving");
        setSyncLabel("Saving");
        clearTimeout(cloudTimerRef.current);
        cloudTimerRef.current = setTimeout(() => pushCloudState(currentLocal, user), 850);
      } else {
        setSyncStatus("saved");
        setSyncLabel("Saved");
      }
    } catch (error) {
      console.warn(error);
      setSyncStatus("offline");
      setSyncLabel("Local saved");
    }
  }

  function syncNow() {
    saveLocal(db, currentUser?.id);
    if (!canUseCloudSync(currentUser)) {
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      showToast?.("Saved locally");
      return;
    }
    setSyncStatus("saving");
    setSyncLabel("Saving");
    clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = setTimeout(() => pushCloudState(db, currentUser, { force: true }), 500);
  }

  useEffect(() => {
    if (!hydratedRef.current || !currentUser) return;
    const clean = sanitizedState(db);
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      saveLocal(clean, currentUser.id);
      clearTimeout(saveTimerRef.current);
      clearTimeout(cloudTimerRef.current);
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      return;
    }
    saveLocal(clean, currentUser.id);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveLocal(clean, currentUser.id), 120);
    scheduleCloudSync(clean, currentUser, 850);
  }, [db, currentUser?.id]);

  useEffect(() => {
    const online = () => reconcileSyncStatus(150);
    const offline = () => {
      clearTimeout(cloudTimerRef.current);
      setSyncStatus("offline");
      setSyncLabel("Local saved");
    };
    const resume = () => {
      if (document.visibilityState === "hidden") {
        const clean = sanitizedState(db);
        if (!clean.meta?.pendingSync) clearTimeout(cloudTimerRef.current);
        return;
      }
      reconcileSyncStatus(150);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [db, currentUser?.id]);

  return {
    hydratedRef,
    hydrateUserState,
    scheduleCloudSync,
    reconcileSyncStatus,
    pushCloudState,
    syncNow
  };
}
