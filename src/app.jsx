function boxRangeDateLabel(value) {
  if (!value) return "dd/mm/yyyy";
  return displayDate(value).replace(" (today)", "");
}

function App() {
  const initialRouteRef = useRef(null);
  if (!initialRouteRef.current) initialRouteRef.current = parseRouteHash();
  const [db, setDb] = useState(() => normalizeState(applyRouteToState(loadLocalForUser(null) || loadLegacyLocal() || seed(), initialRouteRef.current)));
  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authView, setAuthView] = useState("login");
  const [currentView, setCurrentView] = useState(() => routeView(initialRouteRef.current));
  const [isSearchOpen, setIsSearchOpen] = useState(() => initialRouteRef.current?.name === "search");
  const [searchQuery, setSearchQuery] = useState(() => initialRouteRef.current?.query || "");
  const [searchFilters, setSearchFilters] = useState({ box: true, action: true, note: true });
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPlacements, setMenuPlacements] = useState({});
  const [isActiveMenuOpen, setIsActiveMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isActionCalendarOpen, setIsActionCalendarOpen] = useState(false);
  const [isNotesViewMenuOpen, setIsNotesViewMenuOpen] = useState(false);
  const [isNotesViewByMenuOpen, setIsNotesViewByMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [flashTarget, setFlashTarget] = useState(null);
  const [syncStatus, setSyncStatus] = useState(navigator.onLine ? "saved" : "offline");
  const [syncLabel, setSyncLabel] = useState(navigator.onLine ? "Saved" : "Offline");
  const [historyTick, setHistoryTick] = useState(0);
  const [dragState, setDragState] = useState(null);
  const fileInputRef = useRef(null);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const cloudTimerRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const routeApplyRef = useRef(false);
  const skipNextAutoSaveRef = useRef(false);

  const selectedDate = db.ui.selectedActionDate || todayYMD();
  const selectedDay = db.actionDays.find(day => day.date === selectedDate);
  const boxView = db.ui.boxView || "active";
  const searchResults = useMemo(() => collectSearchResults(db, searchQuery, searchFilters), [db, searchQuery, searchFilters]);
  const noteTags = useMemo(() => allNoteTags(db), [db]);
  const notesForView = useMemo(() => filteredNotes(db), [db]);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }

  function requestConfirm(options, onConfirm) {
    setConfirmDialog({
      title: options?.title || "Are you sure?",
      body: options?.body || "",
      confirmLabel: options?.confirmLabel || "Confirm",
      danger: options?.danger !== false,
      onConfirm
    });
  }

  function confirmDeleteNote(onConfirm) {
    requestConfirm({
      title: "Delete note?",
      body: "This removes the note from this workspace. You can restore only from backup.",
      confirmLabel: "Delete",
      danger: true
    }, onConfirm);
  }

  function closeFloating() {
    setIsHeaderMenuOpen(false);
    setActiveMenu(null);
    setMenuPlacements({});
    setIsActiveMenuOpen(false);
    setIsDateMenuOpen(false);
    setIsActionsMenuOpen(false);
    setIsActionCalendarOpen(false);
    setIsNotesViewMenuOpen(false);
    setIsNotesViewByMenuOpen(false);
  }

  function openNodeMenu(menuId, event, estimatedHeight) {
    event?.stopPropagation?.();
    const placement = floatingMenuMeta(event?.currentTarget, estimatedHeight);
    setMenuPlacements(prev => ({ ...prev, [menuId]: placement }));
    setActiveMenu(prev => prev === menuId ? null : menuId);
  }

  function flashAfterNavigation(target) {
    if (!target?.id) return;
    setFlashTarget(null);
    window.setTimeout(() => setFlashTarget(target), 30);
  }

  function setRuntimeFromRoute(route) {
    setCurrentView(routeView(route));
    setIsSearchOpen(route?.name === "search");
    setSearchQuery(route?.name === "search" ? (route.query || "") : "");
    setIsHeaderMenuOpen(false);
    setActiveMenu(null);
    setMenuPlacements({});
    setIsActiveMenuOpen(false);
    setIsDateMenuOpen(false);
    setIsActionsMenuOpen(false);
    setIsActionCalendarOpen(false);
    setIsNotesViewMenuOpen(false);
    setIsNotesViewByMenuOpen(false);
  }

  function applyHashRoute(route = parseRouteHash()) {
    routeApplyRef.current = true;
    setRuntimeFromRoute(route);
    setDb(prev => {
      const next = normalizeState(clone(prev));
      applyRouteToState(next, route);
      return normalizeState(next);
    });
    window.setTimeout(() => { routeApplyRef.current = false; }, 0);
  }

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
        const { data: stateRow, error: stateError } = await withTimeout(
          sb.from(STATE_TABLE).select("data,updated_at").eq("user_id", userId).maybeSingle(),
          CLOUD_READ_TIMEOUT_MS,
          "Workspace load"
        );
        if (stateError) throw stateError;
        if (!stateError && stateRow?.data) {
          const cloudUpdatedAt = validTimestamp(stateRow.updated_at) || validTimestamp(stateRow.data?.meta?.cloudUpdatedAt);
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

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!sb) {
        const localUser = { id: "local", email: "local" };
        setCurrentUser(localUser);
        await hydrateUserState(localUser);
        return;
      }
      try {
        const { data, error } = await withTimeout(sb.auth.getSession(), CLOUD_READ_TIMEOUT_MS, "Session check");
        if (error) console.warn(error);
        if (!alive) return;
        if (data?.session?.user) {
          setCurrentUser(data.session.user);
          await hydrateUserState(data.session.user);
        } else {
          setBooting(false);
          hydratedRef.current = false;
        }
        sb.auth.onAuthStateChange(async (event, session) => {
          if (event === "PASSWORD_RECOVERY") {
            setAuthView("updatePassword");
            setBooting(false);
            return;
          }
          if (event === "SIGNED_IN" && session?.user) {
            setCurrentUser(session.user);
            await hydrateUserState(session.user);
          }
          if (event === "SIGNED_OUT") {
            hydratedRef.current = false;
            setCurrentUser(null);
            setAuthView("login");
            setAuthMessage("Logged out");
          }
        });
      } catch (error) {
        console.warn(error);
        setBooting(false);
      }
    }
    boot();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Service worker skipped", error));
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => applyHashRoute(parseRouteHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (routeApplyRef.current) return;
    const nextHash = buildAppHash({ currentView, ui: db.ui, isSearchOpen, searchQuery });
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [
    currentView,
    isSearchOpen,
    searchQuery,
    db.ui.boxView,
    db.ui.boxFilter,
    db.ui.boxFilterFrom,
    db.ui.boxFilterTo,
    db.ui.showBoxDays,
    db.ui.selectedActionDate,
    db.ui.actionFilter,
    db.ui.notesView,
    db.ui.notesTag,
    db.ui.notesDate,
    db.ui.notesTagsInput,
    db.ui.notesDatesInput
  ]);

  useEffect(() => {
    if (!flashTarget) return;
    const safeId = window.CSS?.escape ? window.CSS.escape(flashTarget.id) : String(flashTarget.id).replace(/"/g, '\\"');
    const selector = flashTarget.type === "entry"
      ? `[data-action-entry-id="${safeId}"]`
      : flashTarget.type === "action"
        ? `[data-action-node-id="${safeId}"]`
        : flashTarget.type === "note"
          ? `[data-note-id="${safeId}"]`
          : `[data-box-node-id="${safeId}"]`;
    const scrollTimer = setTimeout(() => {
      const el = document.querySelector(selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top >= 92 && rect.bottom <= window.innerHeight - 28;
      if (!inViewport) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const clearTimer = setTimeout(() => setFlashTarget(null), 1100);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [flashTarget, currentView, db]);

  function scheduleCloudSync(snapshot, user, delay = 850) {
    const clean = sanitizedState(snapshot);
    clearTimeout(cloudTimerRef.current);
    if (!clean.meta?.pendingSync) {
      setSyncStatus(navigator.onLine ? "saved" : "offline");
      setSyncLabel(navigator.onLine ? "Saved" : "Local saved");
      return;
    }
    if (!sb || !user?.id || user.id === "local" || !navigator.onLine) {
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
    if (!sb || !user?.id || user.id === "local" || !navigator.onLine) {
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
      const stateResult = await withTimeout(
        sb.from(STATE_TABLE).upsert({ user_id: user.id, data: cloudSnapshot, updated_at: syncedAt }, { onConflict: "user_id" }),
        CLOUD_WRITE_TIMEOUT_MS,
        "Workspace save"
      );
      if (stateResult?.error) throw stateResult.error;
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
    if (!sb || !currentUser?.id || currentUser.id === "local" || !navigator.onLine) {
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      showToast("Saved locally");
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

  function commit(label, mutator, options = {}) {
    setDb(prev => {
      const before = sanitizedState(prev);
      const next = normalizeState(clone(prev));
      const changed = mutator(next);
      if (changed === false) return prev;
      if (options.sync !== false) syncSelectedActionDayWithBox(next);
      undoRef.current.push(before);
      if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
      redoRef.current = [];
      setHistoryTick(t => t + 1);
      return markPendingSync(next);
    });
  }

  function undo() {
    if (!undoRef.current.length) return;
    setDb(prev => {
      redoRef.current.push(sanitizedState(prev));
      const snap = undoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }

  function redo() {
    if (!redoRef.current.length) return;
    setDb(prev => {
      undoRef.current.push(sanitizedState(prev));
      const snap = redoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }

  async function handleAuth(action, payload) {
    if (!sb) {
      const localUser = { id: "local", email: "local" };
      setCurrentUser(localUser);
      setAuthMessage("");
      await hydrateUserState(localUser);
      return;
    }
    const email = String(payload.email || "").trim();
    const password = String(payload.password || "");
    setAuthBusy(true);
    setAuthMessage(action === "signup" ? "Signing up..." : action === "forgot" ? "Sending reset email..." : "Logging in...");
    try {
      if (action === "forgot") {
        if (!email) throw new Error("Enter email first");
        const { error } = await withTimeout(
          sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }),
          CLOUD_READ_TIMEOUT_MS,
          "Password reset"
        );
        if (error) throw error;
        setAuthMessage("Check email to reset password");
        return;
      }
      if (action === "update-password") {
        if (password.length < 6) throw new Error("Password must have at least 6 characters");
        const { error } = await withTimeout(sb.auth.updateUser({ password }), CLOUD_READ_TIMEOUT_MS, "Password update");
        if (error) throw error;
        setAuthView("login");
        setAuthMessage("Password updated");
        return;
      }
      if (!email || !password) throw new Error("Enter email and password");
      if (password.length < 6) throw new Error("Password must have at least 6 characters");
      const redirectTo = `${location.origin}${location.pathname}`;
      const result = await withTimeout(
        action === "signup"
          ? sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
          : sb.auth.signInWithPassword({ email, password }),
        CLOUD_READ_TIMEOUT_MS,
        action === "signup" ? "Sign up" : "Login"
      );
      if (result.error) throw result.error;
      const session = result.data?.session || (await withTimeout(sb.auth.getSession(), CLOUD_READ_TIMEOUT_MS, "Session check")).data?.session;
      if (session?.user) {
        setCurrentUser(session.user);
        await hydrateUserState(session.user);
      } else {
        setAuthMessage("Check email to confirm, then login again");
      }
    } catch (error) {
      setAuthMessage(error.message || "Auth error");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    hydratedRef.current = false;
    setCurrentUser(null);
    setAuthMessage("Logged out");
    if (sb) {
      try { await sb.auth.signOut({ scope: "local" }); } catch {}
    }
  }

  function createRootBox() {
    commit("Create box", state => {
      const t = now();
      state.ui.boxView = "active";
      state.boxNodes.push({ id: uid("box"), parentId: null, level: 1, title: "Untitled", sort: childrenOf(null, state.boxNodes).length + 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t });
    });
  }

  function addSub(targetId) {
    commit("Create sub", state => {
      const target = getNode(state.boxNodes, targetId);
      if (!target || boxIsInactive(target)) return false;
      const t = now();
      const isRootTarget = target.level === 1;
      const parentId = isRootTarget ? target.id : (target.parentId ?? null);
      const level = isRootTarget ? target.level + 1 : target.level;
      if (level > 5) return false;
      const siblings = childrenOf(parentId, state.boxNodes);
      const child = { id: uid("sub"), parentId, level, title: "Untitled", sort: siblings.length + 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t };
      state.boxNodes.push(child);
      if (!isRootTarget) {
        const ordered = [...siblings, child].filter(Boolean);
        const targetIndex = ordered.findIndex(node => node.id === target.id);
        const currentIndex = ordered.findIndex(node => node.id === child.id);
        if (targetIndex >= 0 && currentIndex >= 0) {
          const [inserted] = ordered.splice(currentIndex, 1);
          ordered.splice(targetIndex + 1, 0, inserted);
          ordered.forEach((node, index) => {
            const real = getNode(state.boxNodes, node.id);
            if (real) real.sort = index + 1;
          });
        }
      }
      if (isRootTarget) state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => id !== target.id);
      else {
        const parent = getNode(state.boxNodes, parentId);
        if (parent?.level === 1) state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => id !== parent.id);
        else if (parent?.id) state.ui.expandedBoxNodes = [...new Set([...(state.ui.expandedBoxNodes || []), parent.id])];
      }
    });
  }

  function renameBox(id, text) {
    const nextTitle = cleanTitle(text);
    const current = getNode(db.boxNodes, id);
    if (!current || current.title === nextTitle) return;
    commit("Rename box", state => {
      const node = getNode(state.boxNodes, id);
      if (!node) return false;
      node.title = nextTitle;
      node.updatedAt = now();
      state.actionDays.forEach(day => day.nodes.forEach(actionNode => {
        if (actionNode.sourceBoxNodeId === id) {
          actionNode.title = nextTitle;
          actionNode.updatedAt = now();
        }
      }));
    }, { sync: false });
  }

  function toggleBoxOpen(id) {
    setDb(prev => {
      const next = normalizeState(clone(prev));
      const node = getNode(next.boxNodes, id);
      if (!node) return prev;
      const view = next.ui.boxView || "active";
      const getChildren = item => childrenOf(item.id, next.boxNodes).filter(child => shouldShowChildInView(child, view));
      const hasOwnContent = item => next.ui.showBoxDays !== false && actionTimelineForBox(next, item).length > 0;
      const maxDepth = cascadeMaxDepth(node, getChildren, hasOwnContent);
      const currentDepth = Math.min(maxDepth, cascadeOpenDepth(node, getChildren, item => isBoxOpen(next, item), hasOwnContent));
      const plan = cascadePlan(currentDepth, maxDepth, next.ui.boxCascadeModes?.[id]);
      applyCascadeDepth(node, plan.nextDepth, getChildren, (item, open) => setBoxOpen(next, item, open));
      next.ui.boxCascadeModes = { ...normalizeModeMap(next.ui.boxCascadeModes), [id]: plan.nextMode };
      return markPendingSync(next);
    });
  }

  function toggleBoxTimelineDay(boxId, date) {
    setDb(prev => {
      const next = normalizeState(clone(prev));
      next.ui.expandedBoxActionDays = toggleId(next.ui.expandedBoxActionDays || [], `${boxId}:${date}`);
      return markPendingSync(next);
    });
  }

  function archiveBox(id) {
    commit("Archive box", state => {
      const ids = new Set([id, ...descendantsOf(id, state.boxNodes).map(n => n.id)]);
      const t = now();
      state.boxNodes.forEach(n => {
        if (ids.has(n.id)) {
          n.archivedAt = t;
          n.doneAt = null;
          n.updatedAt = t;
        }
      });
    });
  }

  function doneBox(id) {
    commit("Done box", state => {
      const node = getNode(state.boxNodes, id);
      if (!node) return false;
      const t = now();
      if (node.level === 1) {
        const ids = new Set([id, ...descendantsOf(id, state.boxNodes).map(n => n.id)]);
        state.boxNodes.forEach(n => {
          if (ids.has(n.id)) {
            n.doneAt = t;
            n.archivedAt = null;
            n.updatedAt = t;
          }
        });
        state.ui.boxView = "done";
      } else {
        node.doneAt = node.doneAt ? null : t;
        node.updatedAt = t;
      }
    });
  }

  function restoreBox(id) {
    commit("Restore box", state => {
      const ids = new Set([id, ...descendantsOf(id, state.boxNodes).map(n => n.id), ...ancestorsOf(id, state.boxNodes).map(n => n.id)]);
      const t = now();
      state.boxNodes.forEach(n => {
        if (ids.has(n.id)) {
          n.archivedAt = null;
          n.doneAt = null;
          n.updatedAt = t;
        }
      });
      state.ui.boxView = "active";
    });
  }

  function deleteBox(id) {
    commit("Delete box", state => {
      const ids = new Set([id, ...descendantsOf(id, state.boxNodes).map(n => n.id)]);
      state.boxNodes = state.boxNodes.filter(n => !ids.has(n.id));
      const deletedNoteIds = new Set((state.noteLinks || []).filter(link => link.boxNodeId && ids.has(link.boxNodeId)).map(link => link.noteId));
      const t = now();
      state.notes.forEach(note => {
        if (deletedNoteIds.has(note.id)) {
          note.deletedAt = t;
          note.updatedAt = t;
          note.clientUpdatedAt = t;
        }
      });
      state.noteLinks = (state.noteLinks || []).filter(link => !deletedNoteIds.has(link.noteId));
      state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(x => !ids.has(x));
      state.ui.expandedBoxNodes = (state.ui.expandedBoxNodes || []).filter(x => !ids.has(x));
      state.ui.boxCascadeModes = Object.fromEntries(Object.entries(state.ui.boxCascadeModes || {}).filter(([key]) => !ids.has(key)));
      state.actionDays.forEach(day => {
        const removedActionIds = new Set(day.nodes.filter(n => ids.has(n.sourceBoxNodeId)).map(n => n.id));
        day.nodes = day.nodes.filter(n => !ids.has(n.sourceBoxNodeId));
        state.ui.actionCascadeModes = Object.fromEntries(Object.entries(state.ui.actionCascadeModes || {}).filter(([key]) => !removedActionIds.has(key)));
      });
    }, { sync: false });
  }

  function upsertCentralNote(state, { noteId, title, bodyHtml, noteDate, link }) {
    const t = now();
    const id = noteId || uid("note");
    const html = sanitizeHtml(bodyHtml || "");
    const cleanNote = normalizeNote({
      id,
      title: cleanOptionalTitle(title || "") || (htmlToText(html) ? "Untitled" : ""),
      bodyHtml: html,
      noteDate: validNoteDate(noteDate || todayYMD()),
      createdAt: getNote(state, id)?.createdAt || t,
      updatedAt: t,
      clientUpdatedAt: t
    });
    const existing = getNote(state, id);
    if (existing) Object.assign(existing, cleanNote, { id, createdAt: existing.createdAt || cleanNote.createdAt });
    else state.notes.push(cleanNote);
    if (link) upsertNoteLink(state, { ...link, noteId: id });
    return id;
  }

  function saveCentralNote({ noteId, title, bodyHtml, noteDate, link }) {
    let savedId = noteId;
    commit("Save note", state => {
      savedId = upsertCentralNote(state, { noteId, title, bodyHtml, noteDate, link });
      syncNoteToLinkedLegacy(state, savedId);
      state.ui.notesView = link ? "linked" : (state.ui.notesView || "free");
    }, { sync: false });
    setModal(null);
    if (savedId) flashAfterNavigation({ type: "note", id: savedId });
  }

  function deleteCentralNote({ noteId }) {
    if (!noteId) { setModal(null); return; }
    commit("Delete note", state => {
      const note = getNote(state, noteId);
      if (!note) return false;
      syncNoteToLinkedLegacy(state, noteId, true);
      note.deletedAt = now();
      note.updatedAt = note.deletedAt;
      note.clientUpdatedAt = note.deletedAt;
      state.noteLinks = (state.noteLinks || []).filter(link => link.noteId !== noteId);
    }, { sync: false });
    setModal(null);
  }

  function saveBoxNote({ boxId, title, bodyHtml }) {
    commit("Save box note", state => {
      const node = getNode(state.boxNodes, boxId);
      if (!node) return false;
      const t = now();
      node.boxNoteTitle = cleanOptionalTitle(title || "");
      node.boxNoteHtml = sanitizeHtml(bodyHtml || "");
      node.updatedAt = t;
      upsertCentralNote(state, {
        noteId: boxNoteId(boxId),
        title: node.boxNoteTitle,
        bodyHtml: node.boxNoteHtml,
        noteDate: String(t).slice(0, 10),
        link: { id: boxNoteLinkId(boxId), linkType: "box", boxNodeId: boxId }
      });
    });
    setModal(null);
  }

  function deleteBoxNote({ boxId }) {
    commit("Delete box note", state => {
      const node = getNode(state.boxNodes, boxId);
      if (!node || !boxHasNote(node)) return false;
      const note = getNote(state, boxNoteId(boxId));
      if (note) {
        note.deletedAt = now();
        note.updatedAt = note.deletedAt;
        note.clientUpdatedAt = note.deletedAt;
      }
      state.noteLinks = (state.noteLinks || []).filter(link => link.noteId !== boxNoteId(boxId));
      node.boxNoteTitle = "";
      node.boxNoteHtml = "";
      node.updatedAt = now();
    });
    setModal(null);
  }

  function reorderBox(dragId, targetId) {
    commit("Reorder boxes", state => {
      const drag = getNode(state.boxNodes, dragId);
      const target = getNode(state.boxNodes, targetId);
      if (!drag || !target || (drag.parentId ?? null) !== (target.parentId ?? null)) return false;
      const siblings = childrenOf(drag.parentId, state.boxNodes);
      const next = siblings.filter(n => n.id !== dragId);
      const targetIndex = next.findIndex(n => n.id === targetId);
      next.splice(Math.max(0, targetIndex), 0, drag);
      next.forEach((n, index) => { n.sort = index + 1; n.updatedAt = now(); });
    });
  }

  function createActionsForDate(date = selectedDate) {
    commit("Create actions", state => {
      const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : todayYMD();
      state.ui.selectedActionDate = ymd;
      let day = state.actionDays.find(item => item.date === ymd);
      if (!day) {
        const t = now();
        day = { id: uid("day"), date: ymd, createdAt: t, updatedAt: t, nodes: [] };
        state.actionDays.push(day);
      }
      syncActionDayWithBox(state, day);
    }, { sync: false });
  }

  function selectActionDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;
    setDb(prev => {
      const next = normalizeState(clone(prev));
      next.ui.selectedActionDate = date;
      syncSelectedActionDayWithBox(next);
      return markPendingSync(next);
    });
  }

  function toggleActionOpen(id) {
    setDb(prev => {
      const next = normalizeState(clone(prev));
      const day = next.actionDays.find(item => item.date === (next.ui.selectedActionDate || todayYMD()));
      const node = day ? getNode(day.nodes, id) : null;
      if (!day || !node) return prev;
      const filter = next.ui.actionFilter || "all";
      const getChildren = item => childrenOf(item.id, day.nodes).filter(child => hasVisibleAction(child, day.nodes, filter));
      const hasOwnContent = item => visibleEntriesFor(item, filter).length > 0;
      const maxDepth = cascadeMaxDepth(node, getChildren, hasOwnContent);
      const currentDepth = Math.min(maxDepth, cascadeOpenDepth(node, getChildren, item => isActionOpen(next, item), hasOwnContent));
      const plan = cascadePlan(currentDepth, maxDepth, next.ui.actionCascadeModes?.[id]);
      applyCascadeDepth(node, plan.nextDepth, getChildren, (item, open) => setActionOpen(next, item, open));
      next.ui.actionCascadeModes = { ...normalizeModeMap(next.ui.actionCascadeModes), [id]: plan.nextMode };
      return markPendingSync(next);
    });
  }

  function openActionDate(date, actionNodeId = null, entryId = null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;
    setDb(prev => {
      const state = normalizeState(clone(prev));
      state.ui.selectedActionDate = date;
      state.ui.actionFilter = "all";
      const day = state.actionDays.find(item => item.date === date);
      if (day && actionNodeId) {
        const idsToOpen = [...ancestorsOf(actionNodeId, day.nodes).map(node => node.id), actionNodeId];
        state.ui.collapsedActionNodes = (state.ui.collapsedActionNodes || []).filter(id => !idsToOpen.includes(id));
      }
      syncSelectedActionDayWithBox(state);
      return markPendingSync(state);
    });
    setCurrentView("actions");
    setIsSearchOpen(false);
    if (entryId) flashAfterNavigation({ type: "entry", id: entryId });
    else if (actionNodeId) flashAfterNavigation({ type: "action", id: actionNodeId });
  }

  function addActionEntries(dayId, nodeId, lines) {
    const cleaned = String(lines || "").split(/\n+/).map(cleanTitle).filter(Boolean);
    if (!cleaned.length) { setModal(null); return; }
    commit("Add actions", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const t = now();
      node.entries = normalizeEntries(node);
      cleaned.forEach(text => node.entries.push(normalizeEntry({ type: "action", text, createdAt: t, updatedAt: t }, node.entries.length)));
      node.updatedAt = t;
      day.updatedAt = t;
      state.ui.actionFilter = "all";
      state.ui.collapsedActionNodes = (state.ui.collapsedActionNodes || []).filter(id => id !== nodeId);
    }, { sync: false });
    setModal(null);
  }

  function saveActionNote({ dayId, nodeId, entryId, title, bodyHtml }) {
    commit("Save action note", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const t = now();
      node.entries = normalizeEntries(node);
      const entry = entryId ? node.entries.find(e => e.id === entryId) : null;
      let savedEntryId = entry?.id || null;
      if (entry) {
        entry.title = cleanTitle(title || "Note");
        entry.bodyHtml = sanitizeHtml(bodyHtml || "");
        entry.tags = entryTagList(entry);
        entry.updatedAt = t;
      } else {
        const nextEntry = normalizeEntry({ type: "note", title: title || "Note", bodyHtml, createdAt: t, updatedAt: t }, node.entries.length);
        savedEntryId = nextEntry.id;
        node.entries.push(nextEntry);
      }
      node.updatedAt = t;
      day.updatedAt = t;
      if (savedEntryId) {
        upsertCentralNote(state, {
          noteId: actionNoteId(savedEntryId),
          title: title || "Note",
          bodyHtml,
          noteDate: day.date,
          link: {
            id: actionNoteLinkId(savedEntryId),
            linkType: "action_entry",
            actionDate: day.date,
            actionNodeId: node.id,
            actionEntryId: savedEntryId,
            boxNodeId: node.sourceBoxNodeId || null
          }
        });
      }
      state.ui.actionFilter = "all";
      state.ui.collapsedActionNodes = (state.ui.collapsedActionNodes || []).filter(id => id !== nodeId);
    }, { sync: false });
    setModal(null);
  }

  function deleteActionNoteMirror(state, entryId) {
    const note = getNote(state, actionNoteId(entryId));
    if (note) {
      const t = now();
      note.deletedAt = t;
      note.updatedAt = t;
      note.clientUpdatedAt = t;
    }
    state.noteLinks = (state.noteLinks || []).filter(link => link.noteId !== actionNoteId(entryId));
  }

  function deleteActionNote({ dayId, nodeId, entryId }) {
    if (!entryId) { setModal(null); return; }
    commit("Delete action note", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      const entry = node ? entriesFor(node).find(e => e.id === entryId) : null;
      if (!day || !node || !entry || entry.type !== "note") return false;
      node.entries = normalizeEntries(node).filter(e => e.id !== entryId);
      deleteActionNoteMirror(state, entryId);
      node.updatedAt = now();
      day.updatedAt = now();
    }, { sync: false });
    setModal(null);
  }

  function toggleEntry(dayId, nodeId, entryId) {
    commit("Toggle action", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      const entry = node ? entriesFor(node).find(e => e.id === entryId) : null;
      if (!day || !node || !entry || entry.type !== "action") return false;
      entry.done = !entry.done;
      entry.updatedAt = now();
      node.entries = node.entries.map(e => e.id === entry.id ? entry : e);
      node.updatedAt = entry.updatedAt;
      day.updatedAt = entry.updatedAt;
    }, { sync: false });
  }

  function renameEntry(dayId, nodeId, entryId, text) {
    const nextText = cleanTitle(text || "Action");
    commit("Rename action", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      const entry = node ? entriesFor(node).find(e => e.id === entryId) : null;
      if (!day || !node || !entry || entry.type !== "action" || entry.text === nextText) return false;
      entry.text = nextText;
      entry.tags = entryTagList(entry);
      entry.updatedAt = now();
      node.entries = node.entries.map(e => e.id === entry.id ? entry : e);
      node.updatedAt = entry.updatedAt;
      day.updatedAt = entry.updatedAt;
    }, { sync: false });
  }

  function deleteEntry(dayId, nodeId, entryId) {
    commit("Delete entry", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const entry = entriesFor(node).find(e => e.id === entryId);
      if (entry?.type === "note") deleteActionNoteMirror(state, entryId);
      node.entries = normalizeEntries(node).filter(e => e.id !== entryId);
      node.updatedAt = now();
      day.updatedAt = now();
    }, { sync: false });
  }

  function doneAllEntries(dayId, nodeId) {
    commit("Done entries", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const actions = actionEntriesFor(node);
      if (!actions.length) return false;
      const shouldDone = actions.some(e => !e.done);
      node.entries = normalizeEntries(node).map(e => e.type === "action" ? { ...e, done: shouldDone, updatedAt: now() } : e);
      node.updatedAt = now();
      day.updatedAt = now();
    }, { sync: false });
  }

  function clearEntries(dayId, nodeId) {
    commit("Clear entries", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node || !entriesFor(node).length) return false;
      entriesFor(node, "note").forEach(entry => deleteActionNoteMirror(state, entry.id));
      node.entries = [];
      node.updatedAt = now();
      day.updatedAt = now();
    }, { sync: false });
  }

  function exportJson() {
    const clean = sanitizedState(db);
    const backup = createBackupEnvelope(clean, { appVersion: `state-v${clean.version || 1}` });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liems-planner-backup-v${BACKUP_VERSION}-${todayYMD()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
    setIsHeaderMenuOpen(false);
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = readBackupEnvelope(text);
      const next = normalizeState(parsed.data);
      setModal({
        type: "importPreview",
        state: next,
        summary: parsed.summary,
        legacy: parsed.legacy,
        backupVersion: parsed.envelope?.version,
        fileName: file.name
      });
      showToast("Backup ready to import");
    } catch (error) {
      console.warn(error);
      showToast("Invalid JSON file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function applyImportedState(mode) {
    if (modal?.type !== "importPreview") return;
    const next = mode === "merge"
      ? mergeImportedState(db, modal.state)
      : normalizeState(modal.state);
    commit(mode === "merge" ? "Merge JSON" : "Replace JSON", state => {
      state.version = next.version;
      state.meta = next.meta;
      state.boxNodes = next.boxNodes;
      state.actionDays = next.actionDays;
      state.notes = next.notes;
      state.noteLinks = next.noteLinks;
      state.ui = next.ui;
    }, { sync: false });
    setModal(null);
    showToast(mode === "merge" ? "Merged backup" : "Imported backup");
  }

  function countNodeEntries(nodes = []) {
    return nodes.reduce((total, node) => total + entriesFor(node).length, 0);
  }

  function makeDebugInfo() {
    const clean = sanitizedState(db);
    const payload = JSON.stringify(clean);
    const key = localKey(currentUser?.id);
    let localBytes = 0;
    try { localBytes = snapshotPayloadBytes(localStorage.getItem(key) || ""); } catch {}
    const entries = (clean.actionDays || []).reduce((total, day) => total + countNodeEntries(day.nodes || []), 0);
    return {
      buildId: APP_BUILD_ID,
      cacheName: APP_CACHE_NAME,
      route: window.location.hash || "#/boxes",
      user: currentUser?.email || currentUser?.id || "local",
      online: navigator.onLine,
      standalone: Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone),
      serviceWorker: navigator.serviceWorker?.controller ? "controlled" : ("serviceWorker" in navigator ? "registered/pending" : "unavailable"),
      syncStatus,
      syncLabel,
      pendingSync: Boolean(clean.meta?.pendingSync),
      localUpdatedAt: clean.meta?.localUpdatedAt || "",
      cloudUpdatedAt: clean.meta?.cloudUpdatedAt || "",
      lastSyncedAt: clean.meta?.lastSyncedAt || "",
      snapshotBytes: snapshotPayloadBytes(payload),
      snapshotKb: Math.ceil(snapshotPayloadBytes(payload) / 1024),
      localStorageKey: key,
      localStorageBytes: localBytes,
      counts: {
        boxes: (clean.boxNodes || []).length,
        actionDays: (clean.actionDays || []).length,
        entries,
        notes: (clean.notes || []).filter(note => !note.deletedAt).length,
        noteLinks: (clean.noteLinks || []).length
      }
    };
  }

  function openDebugPanel() {
    setModal({ type: "debug", info: makeDebugInfo() });
    setIsHeaderMenuOpen(false);
  }

  function exportAiNotes(options = {}) {
    const tags = exportTagsFromInput(options.tagsInput || "");
    const dateFilters = parseExportDateFilters(options.datesInput || "");
    const selected = notesForView.filter(note => {
      const noteTags = noteTagList(note);
      const tagMatch = !tags.length || tags.every(tag => noteTags.includes(tag));
      return tagMatch && noteMatchesExportDates(note, dateFilters);
    });
    if (!selected.length) {
      showToast("No notes to export");
      return;
    }
    const markdown = selected.map(note => {
      const links = noteLinksFor(db, note.id).map(link => linkLabel(db, link));
      const tags = noteTagList(note).map(tag => `#${tag}`).join(" ");
      return [
        `# ${noteDisplayTitle(note)}`,
        "",
        `Date: ${note.noteDate}`,
        `Type: ${links.length ? "Linked" : "Free"}`,
        links.length ? `Linked: ${links.join("; ")}` : "",
        tags ? `Tags: ${tags}` : "",
        "",
        noteBodyText(note) || "(empty)",
        ""
      ].filter(line => line !== "").join("\n");
    }).join("\n---\n\n");
    const blob = new Blob([markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liems-notes-for-ai-${todayYMD()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
    showToast("Exported notes for AI");
    setModal(null);
  }

  function setNotesUI(key, value) {
    setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, [key]: value } }));
  }

  function setNotesViewBy(patch) {
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        notesTagsInput: patch.tagsInput !== undefined ? patch.tagsInput : (prev.ui.notesTagsInput || ""),
        notesDatesInput: patch.datesInput !== undefined ? patch.datesInput : (prev.ui.notesDatesInput || "")
      }
    }));
  }

  function toggleNoteDate(date) {
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        collapsedNoteDates: toggleId(prev.ui.collapsedNoteDates || [], date)
      }
    }));
  }

  function toggleSearchFilter(key) {
    setSearchFilters(prev => {
      const next = { ...prev, [key]: prev[key] === false };
      if (!next.box && !next.action && !next.note) return prev;
      return next;
    });
  }

  function openCentralNote(noteId) {
    setModal({ type: "centralNote", noteId });
  }

  function preferredFreeNoteDate() {
    const filters = parseExportDateFilters(db.ui.notesDatesInput || "");
    return filters.length === 1 && filters[0].type === "date" ? filters[0].date : todayYMD();
  }

  function createFreeNote() {
    const noteDate = preferredFreeNoteDate();
    const hadViewBy = Boolean((db.ui.notesTagsInput || "").trim() || (db.ui.notesDatesInput || "").trim());
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        notesView: "free",
        notesTagsInput: "",
        notesDatesInput: ""
      }
    }));
    setIsNotesViewByMenuOpen(false);
    setIsNotesViewMenuOpen(false);
    setCurrentView("notes");
    setModal({ type: "centralNote", noteId: null, noteDate });
    if (hadViewBy) showToast("View by cleared for new note");
  }

  function requestDeleteCentralNote(noteId) {
    confirmDeleteNote(() => deleteCentralNote({ noteId }));
  }

  function openNotesExport() {
    setModal({ type: "notesExport" });
  }

  function openSearchResult(result) {
    if (result.noteId) {
      setCurrentView("notes");
      setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, notesView: noteIsLinked(prev, result.noteId) ? "linked" : "free" } }));
      flashAfterNavigation({ type: "note", id: result.noteId });
    } else if (result.boxId) {
      setDb(prev => {
        const state = normalizeState(clone(prev));
        const ancestors = ancestorsOf(result.boxId, state.boxNodes);
        ancestors.forEach(parent => {
          if (parent.level === 1) state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => id !== parent.id);
          else state.ui.expandedBoxNodes = [...new Set([...(state.ui.expandedBoxNodes || []), parent.id])];
        });
        const node = getNode(state.boxNodes, result.boxId);
        const root = node ? rootOf(node, state.boxNodes) : null;
        if (root) {
          state.ui.boxView = boxIsArchived(root) ? "archived" : boxIsDone(root) ? "done" : "active";
        }
        return markPendingSync(state);
      });
      setCurrentView("boxes");
      flashAfterNavigation({ type: "box", id: result.boxId });
    } else if (result.date) {
      setDb(prev => {
        const state = normalizeState(clone(prev));
        state.ui.selectedActionDate = result.date;
        state.ui.actionFilter = "all";
        const day = state.actionDays.find(item => item.date === result.date);
        if (day && result.actionNodeId) {
          const idsToOpen = [...ancestorsOf(result.actionNodeId, day.nodes).map(node => node.id), result.actionNodeId];
          state.ui.collapsedActionNodes = (state.ui.collapsedActionNodes || []).filter(id => !idsToOpen.includes(id));
        }
        syncSelectedActionDayWithBox(state);
        return markPendingSync(state);
      });
      setCurrentView("actions");
      if (result.entryId) flashAfterNavigation({ type: "entry", id: result.entryId });
      else if (result.actionNodeId) flashAfterNavigation({ type: "action", id: result.actionNodeId });
    }
    setIsSearchOpen(false);
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12">
        <div className="w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] min-h-screen sm:min-h-[850px] flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 w-[46px] h-[46px] grid place-items-center bg-[#FFD2D7] text-black rounded-[14px] font-black">LP</div>
            <div className="font-extrabold text-[20px]">Loading</div>
            <div className="text-[#A7A7A7] text-[13px] mt-1">Opening workspace...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen authView={authView} authBusy={authBusy} authMessage={authMessage} onAuth={handleAuth} onSwitchView={setAuthView} />;
  }

  const boxHandlers = {
    addSub,
    renameBox,
    toggleBoxOpen,
    archiveBox,
    doneBox,
    restoreBox,
    deleteBox,
    openBoxNote: (boxId) => setModal({ type: "boxNote", boxId }),
    toggleBoxTimelineDay,
    openActionDate,
    reorderBox
  };
  const actionHandlers = {
    toggleActionOpen,
    openActionLines: (dayId, nodeId) => setModal({ type: "actionLines", dayId, nodeId }),
    openActionNote: (dayId, nodeId, entryId) => setModal({ type: "actionNote", dayId, nodeId, entryId }),
    deleteActionNote: (dayId, nodeId, entryId) => {
      confirmDeleteNote(() => deleteActionNote({ dayId, nodeId, entryId }));
    },
    toggleEntry,
    renameEntry,
    deleteEntry,
    doneAllEntries,
    clearEntries
  };
  const rootBoxes = vaultRoots(db, boxView);
  const actionRoots = selectedDay ? childrenOf(null, selectedDay.nodes).filter(root => hasVisibleAction(root, selectedDay.nodes, db.ui.actionFilter || "all")) : [];
  const actionProgress = selectedDay ? progressForNodes(selectedDay.nodes) : null;

  return (
    <div className="min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12 selection:bg-[#FFD2D7] selection:text-black relative" onClick={closeFloating}>
      <div className="app-shell w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] overflow-hidden min-h-screen sm:min-h-[850px] relative flex flex-col shadow-2xl">
        <Header
          syncStatus={syncStatus}
          syncLabel={syncLabel}
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          isHeaderMenuOpen={isHeaderMenuOpen}
          setIsHeaderMenuOpen={setIsHeaderMenuOpen}
          onSyncNow={syncNow}
          onExport={exportJson}
          onImportClick={() => fileInputRef.current?.click()}
          onOpenDebug={openDebugPanel}
          onImportFile={(e) => importJson(e.target.files?.[0])}
          onSignOut={signOut}
          fileInputRef={fileInputRef}
        />

        <SearchPanel isOpen={isSearchOpen} query={searchQuery} setQuery={setSearchQuery} results={searchResults} filters={searchFilters} onToggleFilter={toggleSearchFilter} onOpenResult={openSearchResult} />

        <main className="app-main p-5 flex-1 flex flex-col pb-24">
          <div className="flex justify-between items-center gap-3 mb-7 mt-1">
            <h2 className="view-title text-[1.55rem] leading-[1.1] font-extrabold tracking-tighter flex flex-nowrap items-baseline min-w-0">
              <button type="button" className={`cursor-pointer transition-colors whitespace-nowrap ${currentView === "boxes" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); setCurrentView("boxes"); }}>Box</button>
              <span className="text-[#3E3E3E] mx-1.5 font-light">/</span>
              <button type="button" className={`cursor-pointer transition-colors whitespace-nowrap ${currentView === "actions" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); setCurrentView("actions"); }}>Act</button>
              <span className="text-[#3E3E3E] mx-1.5 font-light">/</span>
              <button type="button" className={`cursor-pointer transition-colors whitespace-nowrap ${currentView === "notes" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); setCurrentView("notes"); }}>Note</button>
            </h2>
            <div className="flex gap-3 text-[#A7A7A7] shrink-0">
              <button type="button" disabled={!undoRef.current.length} onClick={(e) => { e.stopPropagation(); undo(); }} className="cursor-pointer hover:text-white transition-colors" aria-label="Undo"><Undo2 size={18} /></button>
              <button type="button" disabled={!redoRef.current.length} onClick={(e) => { e.stopPropagation(); redo(); }} className="cursor-pointer hover:text-white transition-colors" aria-label="Redo"><Redo2 size={18} /></button>
            </div>
          </div>

          {currentView === "boxes" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="filter-row flex flex-wrap items-center gap-2.5 mb-7 relative z-20">
                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setIsActiveMenuOpen(!isActiveMenuOpen); setIsDateMenuOpen(false); }} className="flex items-center gap-1.5 px-6 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform">
                    {boxView === "archived" ? "Archived" : boxView === "done" ? "Done" : "Active"}
                  </button>
                  {isActiveMenuOpen && (
                    <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 mt-2 w-[130px] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100">
                      {["active", "archived", "done"].map(opt => (
                        <button key={opt} type="button" onClick={() => { setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxView: opt } })); setIsActiveMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors capitalize">{opt}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setIsDateMenuOpen(!isDateMenuOpen); setIsActiveMenuOpen(false); }} className="flex items-center gap-1.5 px-6 py-2 bg-transparent hover:border-white active:scale-95 text-white text-[13px] font-bold rounded-full border border-[#878787] transition-all">
                    {db.ui.boxFilter === "today" ? "Today" : db.ui.boxFilter === "7" ? "7 days" : db.ui.boxFilter === "15" ? "15 days" : db.ui.boxFilter === "30" ? "30 days" : db.ui.boxFilter === "all" ? "All" : "Custom"}
                  </button>
                  {isDateMenuOpen && (
                    <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 mt-2 w-[280px] max-w-[calc(100vw-2rem)] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100">
                      {[["today", "Today"], ["7", "7 days"], ["15", "15 days"], ["30", "30 days"], ["all", "All"]].map(([value, label]) => (
                        <button key={value} type="button" onClick={() => { setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilter: value } })); setIsDateMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors">{label}</button>
                      ))}
                      <label className="border-t border-[#3E3E3E] mt-1 flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#3E3E3E] transition-colors cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={db.ui.showBoxDays !== false}
                          onChange={(e) => setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, showBoxDays: e.target.checked } }))}
                          className="h-4 w-4 accent-[#FFD2D7] cursor-pointer"
                        />
                        Show days
                      </label>
                      <div className="border-t border-[#3E3E3E] mt-1 px-4 py-3 grid grid-cols-1 gap-2">
                        <label className="relative block w-full cursor-pointer">
                          <span className="flex h-[46px] w-full items-center justify-between gap-3 bg-[#111111] border border-[#333333] rounded-[10px] px-3 text-[14px] text-white">
                            <span className={`min-w-0 truncate whitespace-nowrap ${db.ui.boxFilterFrom ? "" : "text-[#A7A7A7]"}`}>{boxRangeDateLabel(db.ui.boxFilterFrom)}</span>
                            <CalendarDays size={15} className="shrink-0 text-[#A7A7A7]" />
                          </span>
                          <input type="date" aria-label="Start date" value={db.ui.boxFilterFrom || ""} onChange={(e) => setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilterFrom: e.target.value } }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [color-scheme:dark]" />
                        </label>
                        <label className="relative block w-full cursor-pointer">
                          <span className="flex h-[46px] w-full items-center justify-between gap-3 bg-[#111111] border border-[#333333] rounded-[10px] px-3 text-[14px] text-white">
                            <span className={`min-w-0 truncate whitespace-nowrap ${db.ui.boxFilterTo ? "" : "text-[#A7A7A7]"}`}>{boxRangeDateLabel(db.ui.boxFilterTo)}</span>
                            <CalendarDays size={15} className="shrink-0 text-[#A7A7A7]" />
                          </span>
                          <input type="date" aria-label="End date" value={db.ui.boxFilterTo || ""} onChange={(e) => setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilterTo: e.target.value } }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [color-scheme:dark]" />
                        </label>
                        <button type="button" onClick={() => { setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilter: "custom" } })); setIsDateMenuOpen(false); }} className="justify-self-start text-[#FFD2D7] hover:text-white active:scale-95 text-[14px] font-bold underline underline-offset-4 decoration-[#FFD2D7] transition-all">
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button type="button" onClick={createRootBox} className="ml-auto px-5 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform" aria-label="Create box">
                  +box
                </button>
              </div>

              <div className="space-y-4">
                {rootBoxes.length ? rootBoxes.map(item => (
                  <div key={item.id} className="bg-[#141414] rounded-[12px] border border-white/[0.03]">
                    <BoxTreeItem state={db} node={item} level={0} view={boxView} menuOpenId={activeMenu} setMenuOpenId={setActiveMenu} menuPlacements={menuPlacements} openNodeMenu={openNodeMenu} handlers={boxHandlers} dragState={dragState} setDragState={setDragState} flashTarget={flashTarget} />
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6"><ClipboardList size={36} className="text-[#444444]" /></div>
                    <h3 className="text-white font-bold text-[18px] mb-2">No boxes yet</h3>
                    <button type="button" onClick={createRootBox} className="mt-4 bg-[#FFD2D7] text-black font-bold px-7 py-3 rounded-full flex items-center gap-2"><Plus size={18} /> Create box</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === "actions" && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-300 flex-1 flex flex-col">
              <div className="flex items-center gap-2.5 mb-8 relative z-20">
                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setIsActionsMenuOpen(!isActionsMenuOpen); }} className="flex items-center gap-1.5 px-6 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform">
                    {db.ui.actionFilter === "undone" ? "Undone" : db.ui.actionFilter === "done" ? "Done" : db.ui.actionFilter === "notes" ? "Notes" : "All"}
                  </button>
                  {isActionsMenuOpen && (
                    <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 mt-2 w-[130px] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100">
                      {["all", "undone", "done", "notes"].map(opt => (
                        <button key={opt} type="button" onClick={() => { setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, actionFilter: opt } })); setIsActionsMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors capitalize">{opt}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative flex items-center justify-between bg-transparent border border-[#555555] rounded-full px-4 py-1.5 hover:border-white transition-colors group flex-1">
                  <button type="button" onClick={() => selectActionDate(addDaysYMD(selectedDate, -1))} className="text-[#A7A7A7] group-hover:text-white transition-colors"><ChevronLeft size={16} /></button>
                  <button type="button" aria-label="Select action date" onClick={(e) => { e.stopPropagation(); setIsActionCalendarOpen(!isActionCalendarOpen); setIsActionsMenuOpen(false); }} className="flex items-center gap-2 text-white font-bold text-[13px] min-w-0">
                    {displayDate(selectedDate, true)} {actionProgress ? <span className="text-[#A7A7A7] font-semibold">{actionProgress.done}/{actionProgress.total}</span> : null} <CalendarDays size={14} className="text-[#FFD2D7]" />
                  </button>
                  <button type="button" onClick={() => selectActionDate(addDaysYMD(selectedDate, 1))} className="text-[#A7A7A7] group-hover:text-white transition-colors"><ChevronRight size={16} /></button>
                  {isActionCalendarOpen && (
                    <ActionDatePickerPanel
                      selectedDate={selectedDate}
                      actionDays={db.actionDays}
                      onSelect={(date) => { selectActionDate(date); setIsActionCalendarOpen(false); }}
                    />
                  )}
                </div>
              </div>

              {!selectedDay ? (
                <div className="flex-1 flex flex-col items-center justify-center pb-20 animate-in fade-in duration-300">
                  <div className="w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6">
                    <CalendarDays size={36} className="text-[#A7A7A7]" />
                  </div>
                  <h3 className="text-white font-bold text-[18px] mb-2">No scheduled actions yet</h3>
                  <button type="button" onClick={() => createActionsForDate(selectedDate)} className="bg-[#FFD2D7] hover:scale-105 active:scale-95 transition-transform text-black font-bold px-7 py-3 rounded-full flex items-center gap-2">
                    <Plus size={18} strokeWidth={2.5} /> Create actions
                  </button>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  {actionRoots.length ? actionRoots.map(item => (
                    <div key={item.id} className="bg-[#141414] rounded-[12px] border border-white/[0.03]">
                      <ActionTreeItem state={db} day={selectedDay} node={item} level={0} menuOpenId={activeMenu} setMenuOpenId={setActiveMenu} menuPlacements={menuPlacements} openNodeMenu={openNodeMenu} handlers={actionHandlers} flashTarget={flashTarget} />
                    </div>
                  )) : (
                    <div className="bg-[#141414] rounded-[12px] border border-white/[0.03] p-6 text-center text-[#A7A7A7]">No items match this filter.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentView === "notes" && (
            <NotesPanel
              state={db}
              notes={notesForView}
              tags={noteTags}
              isViewMenuOpen={isNotesViewMenuOpen}
              setIsViewMenuOpen={setIsNotesViewMenuOpen}
              isViewByMenuOpen={isNotesViewByMenuOpen}
              setIsViewByMenuOpen={setIsNotesViewByMenuOpen}
              onCreateNote={createFreeNote}
              onOpenNote={openCentralNote}
              onDeleteNote={requestDeleteCentralNote}
              onSetView={(value) => setNotesUI("notesView", value)}
              onSetViewBy={setNotesViewBy}
              onToggleDate={toggleNoteDate}
              onOpenExport={openNotesExport}
              flashTarget={flashTarget}
            />
          )}
        </main>

        {modal?.type === "boxNote" && <RichNoteModal modal={modal} state={db} onClose={() => setModal(null)} onSave={saveBoxNote} onDelete={deleteBoxNote} onConfirmDelete={confirmDeleteNote} />}
        {modal?.type === "actionNote" && <RichNoteModal modal={modal} state={db} onClose={() => setModal(null)} onSave={saveActionNote} onDelete={deleteActionNote} onConfirmDelete={confirmDeleteNote} />}
        {modal?.type === "centralNote" && <RichNoteModal modal={modal} state={db} onClose={() => setModal(null)} onSave={saveCentralNote} onDelete={deleteCentralNote} onConfirmDelete={confirmDeleteNote} />}
        {modal?.type === "notesExport" && <ExportNotesModal tags={noteTags} onClose={() => setModal(null)} onExport={exportAiNotes} />}
        {modal?.type === "importPreview" && <ImportPreviewModal modal={modal} onClose={() => setModal(null)} onImport={applyImportedState} />}
        {modal?.type === "debug" && <DebugPanel info={modal.info || makeDebugInfo()} onClose={() => setModal(null)} />}
        {modal?.type === "actionLines" && <ActionLinesModal modal={modal} onClose={() => setModal(null)} onSave={addActionEntries} />}
        <ConfirmModal
          dialog={confirmDialog}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            const run = confirmDialog?.onConfirm;
            setConfirmDialog(null);
            run?.();
          }}
        />
        {toast && <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[60] bg-[#1A1A1A] border border-[#444] text-white text-[13px] font-bold px-4 py-3 rounded-full shadow-2xl">{toast}</div>}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
