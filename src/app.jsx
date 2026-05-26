function App() {
  const initialRouteRef = useRef(null);
  if (!initialRouteRef.current) initialRouteRef.current = parseRouteHash();
  const [db, setDb] = useState(() => normalizeState(applyRouteToState(loadLocalPreviewState() || seed(), initialRouteRef.current)));
  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState(() => routeView(initialRouteRef.current));
  const [isSearchOpen, setIsSearchOpen] = useState(() => initialRouteRef.current?.name === "search");
  const [searchQuery, setSearchQuery] = useState(() => initialRouteRef.current?.query || "");
  const [searchFilters, setSearchFilters] = useState({ box: true, action: true, note: true });
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPlacements, setMenuPlacements] = useState({});
  const [isActiveMenuOpen, setIsActiveMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [boxDateCalendarTarget, setBoxDateCalendarTarget] = useState(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isActionCalendarOpen, setIsActionCalendarOpen] = useState(false);
  const [isNotesViewMenuOpen, setIsNotesViewMenuOpen] = useState(false);
  const [isNotesViewByMenuOpen, setIsNotesViewByMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [flashTarget, setFlashTarget] = useState(null);
  const { syncStatus, syncLabel, setSyncStatus, setSyncLabel, setSyncState } = useSyncStatusMachine(navigator.onLine ? "saved" : "offline");
  const [dragState, setDragState] = useState(null);
  const fileInputRef = useRef(null);
  const routeApplyRef = useRef(false);
  const { historyTick, undoRef, redoRef, commit, undo, redo } = usePlannerHistory(setDb, syncSelectedActionDayWithBox);
  const { hydratedRef, hydrateUserState, syncNow } = useCloudSync({
    db,
    setDb,
    currentUser,
    setBooting,
    setRuntimeFromRoute,
    setSyncStatus,
    setSyncLabel,
    showToast
  });
  const { authBusy, authMessage, authView, setAuthView, handleAuth, signOut } = useAuthSession({
    setCurrentUser,
    setBooting,
    hydrateUserState,
    hydratedRef
  });
  const {
    createRootBox,
    addSub,
    renameBox,
    toggleBoxOpen,
    toggleBoxTimelineDay,
    archiveBox,
    doneBox,
    restoreBox,
    deleteBox,
    reorderBox
  } = useBoxActions({ db, setDb, commit });

  const selectedDate = db.ui.selectedActionDate || todayYMD();
  const selectedDay = db.actionDays.find(day => day.date === selectedDate);
  const boxView = db.ui.boxView || "active";
  const searchResults = useMemo(() => collectSearchResults(db, searchQuery, searchFilters), [db, searchQuery, searchFilters]);
  const noteTags = useMemo(() => allNoteTags(db), [db]);
  const notesForView = useMemo(() => filteredNotes(db), [db]);
  const selectedBoxNoteId = db.ui.selectedBoxNoteId || "";
  const notesForSelectedBox = useMemo(() => selectedBoxNoteId ? boxNotesFor(db, selectedBoxNoteId) : [], [db, selectedBoxNoteId]);
  const {
    upsertCentralNote,
    saveCentralNote,
    deleteCentralNote,
    saveBoxNote,
    deleteBoxNote,
    exportAiNotes
  } = useNoteActions({ db, commit, setModal, flashAfterNavigation, notesForView, showToast });
  const {
    createActionsForDate,
    selectActionDate,
    toggleActionOpen,
    openActionDate,
    addActionEntries,
    saveActionNote,
    deleteActionNote,
    toggleEntry,
    renameEntry,
    deleteEntry,
    doneAllEntries,
    clearEntries
  } = useActionEntries({
    selectedDate,
    setDb,
    commit,
    setModal,
    setCurrentView,
    setIsSearchOpen,
    flashAfterNavigation,
    upsertCentralNote
  });

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
      body: "Undo can restore it while it remains in the last 10 changes.",
      confirmLabel: "Delete",
      danger: true
    }, onConfirm);
  }

  function confirmDeleteAction(onConfirm) {
    requestConfirm({
      title: "Delete action?",
      body: "Undo can restore it while it remains in the last 10 changes.",
      confirmLabel: "Delete",
      danger: true
    }, onConfirm);
  }

  function confirmDeleteBox(onConfirm) {
    requestConfirm({
      title: "Remove box?",
      body: "This removes the box, sub-boxes, linked notes, and scheduled entries. Undo can restore it while it remains in the last 10 changes.",
      confirmLabel: "Remove",
      danger: true
    }, onConfirm);
  }

  function confirmClearEntries(onConfirm) {
    requestConfirm({
      title: "Clear entries?",
      body: "This removes every action and note in this row. Undo can restore them while they remain in the last 10 changes.",
      confirmLabel: "Clear",
      danger: true
    }, onConfirm);
  }

  function closeFloating() {
    setIsHeaderMenuOpen(false);
    setActiveMenu(null);
    setMenuPlacements({});
    setIsActiveMenuOpen(false);
    setIsDateMenuOpen(false);
    setBoxDateCalendarTarget(null);
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
    setBoxDateCalendarTarget(null);
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
    db.ui.notesDatesInput,
    db.ui.selectedBoxNoteId
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

  function updateWorkspaceName(name) {
    setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, workspaceName: name || "Liem's Planner" } }));
  }

  function cycleLogoStyle() {
    setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, logoStyle: ((Number(prev.ui.logoStyle) || 0) + 1) % 15 } }));
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

  function toggleBoxNoteDate(date) {
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        collapsedBoxNoteDates: toggleId(prev.ui.collapsedBoxNoteDates || [], date)
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

  function expandBoxPathInState(state, boxId) {
    const ancestors = ancestorsOf(boxId, state.boxNodes);
    ancestors.forEach(parent => {
      if (parent.level === 1) state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => id !== parent.id);
      else state.ui.expandedBoxNodes = [...new Set([...(state.ui.expandedBoxNodes || []), parent.id])];
    });
    const node = getNode(state.boxNodes, boxId);
    const root = node ? rootOf(node, state.boxNodes) : null;
    if (root) state.ui.boxView = boxIsArchived(root) ? "archived" : boxIsDone(root) ? "done" : "active";
  }

  function revealBox(boxId) {
    if (!boxId) return;
    setDb(prev => {
      const state = normalizeState(clone(prev));
      expandBoxPathInState(state, boxId);
      state.ui.selectedBoxNoteId = "";
      return markPendingSync(state);
    });
    setCurrentView("boxes");
    setIsSearchOpen(false);
    flashAfterNavigation({ type: "box", id: boxId });
  }

  function openBoxNotes(boxId) {
    if (!boxId) return;
    setDb(prev => {
      const state = normalizeState(clone(prev));
      state.ui.selectedBoxNoteId = boxId;
      expandBoxPathInState(state, boxId);
      return markPendingSync(state);
    });
    setCurrentView("boxNotes");
    setIsSearchOpen(false);
    setActiveMenu(null);
  }

  function createBoxLinkedNote(boxId) {
    if (!boxId) return;
    openBoxNotes(boxId);
    setModal({
      type: "centralNote",
      noteId: null,
      noteDate: todayYMD(),
      link: { id: uid("notelink"), linkType: "box", boxNodeId: boxId }
    });
  }

  function openNotesTab() {
    setCurrentView("notes");
    setDb(prev => prev.ui.selectedBoxNoteId ? markPendingSync({ ...prev, ui: { ...prev.ui, selectedBoxNoteId: "" } }) : prev);
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
        notesView: prev.ui.notesView === "linked" ? "free" : (prev.ui.notesView || "free"),
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

  function requestDeleteBox(boxId) {
    confirmDeleteBox(() => deleteBox(boxId));
  }

  function requestDeleteEntry(dayId, nodeId, entryId) {
    const day = db.actionDays.find(item => item.id === dayId);
    const node = day ? getNode(day.nodes, nodeId) : null;
    const entry = node ? entriesFor(node).find(item => item.id === entryId) : null;
    const confirm = entry?.type === "note" ? confirmDeleteNote : confirmDeleteAction;
    confirm(() => deleteEntry(dayId, nodeId, entryId));
  }

  function requestClearEntries(dayId, nodeId) {
    confirmClearEntries(() => clearEntries(dayId, nodeId));
  }

  function openNotesExport() {
    setModal({ type: "notesExport" });
  }

  function openSearchResult(result) {
    if (result.noteId) {
      setCurrentView("notes");
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          notesView: prev.ui.notesView === "all" ? "all" : (noteIsLinked(prev, result.noteId) ? "linked" : "free")
        }
      }));
      flashAfterNavigation({ type: "note", id: result.noteId });
    } else if (result.boxId) {
      revealBox(result.boxId);
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

  function openNoteOrigin(noteId) {
    const origin = notePrimaryOrigin(db, noteId);
    if (!origin) return;
    if (origin.type === "box") {
      revealBox(origin.boxId);
      return;
    }
    if (origin.date) openActionDate(origin.date, origin.actionNodeId || null, origin.entryId || null);
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12">
        <div className="w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] min-h-screen sm:min-h-[850px] flex items-center justify-center">
          <div className="text-center">
            <BrandLogo
              name={db.ui.workspaceName}
              style={db.ui.logoStyle}
              className="mx-auto mb-4 w-[46px] h-[46px]"
              textClassName="text-[20px]"
              ariaLabel="Loading workspace logo"
              title="Loading workspace logo"
            />
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
    deleteBox: requestDeleteBox,
    openBoxNote: openBoxNotes,
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
    deleteEntry: requestDeleteEntry,
    doneAllEntries,
    clearEntries: requestClearEntries
  };
  const rootBoxes = vaultRoots(db, boxView);
  const actionRoots = selectedDay ? childrenOf(null, selectedDay.nodes).filter(root => hasVisibleAction(root, selectedDay.nodes, db.ui.actionFilter || "all")) : [];
  const actionProgress = selectedDay ? progressForNodes(selectedDay.nodes) : null;

  return (
    <div className="min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12 selection:bg-[#FFD2D7] selection:text-black relative" onClick={closeFloating}>
      <div className="app-shell w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] overflow-hidden min-h-screen sm:min-h-[850px] relative flex flex-col shadow-2xl">
        <Header
          workspaceName={db.ui.workspaceName}
          logoStyle={db.ui.logoStyle}
          onWorkspaceNameChange={updateWorkspaceName}
          onCycleLogoStyle={cycleLogoStyle}
          syncStatus={syncStatus}
          syncLabel={syncLabel}
          isSearchOpen={isSearchOpen}
          setIsSearchOpen={setIsSearchOpen}
          isHeaderMenuOpen={isHeaderMenuOpen}
          setIsHeaderMenuOpen={setIsHeaderMenuOpen}
          onSyncNow={syncNow}
          onExport={exportJson}
          onImportClick={() => fileInputRef.current?.click()}
          onImportFile={(e) => importJson(e.target.files?.[0])}
          onSignOut={signOut}
          fileInputRef={fileInputRef}
        />

        <SearchPanel isOpen={isSearchOpen} query={searchQuery} setQuery={setSearchQuery} results={searchResults} filters={searchFilters} onToggleFilter={toggleSearchFilter} onOpenResult={openSearchResult} />

        <main className="app-main p-5 flex-1 flex flex-col pb-24">
          <div className="view-nav-row flex justify-between items-center gap-3 mb-7 mt-1">
            <h2 className="view-title text-[1.55rem] leading-[1.1] font-extrabold tracking-tighter flex flex-nowrap items-baseline min-w-0">
              <button type="button" className={`cursor-pointer transition-colors whitespace-nowrap ${currentView === "boxes" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); setCurrentView("boxes"); }}>Box</button>
              <span className="text-[#3E3E3E] mx-1.5 font-light">/</span>
              <button type="button" className={`cursor-pointer transition-colors whitespace-nowrap ${currentView === "actions" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); setCurrentView("actions"); }}>Act</button>
              <span className="text-[#3E3E3E] mx-1.5 font-light">/</span>
              <button type="button" className={`cursor-pointer transition-colors whitespace-nowrap ${currentView === "notes" || currentView === "boxNotes" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); openNotesTab(); }}>Note</button>
            </h2>
            <div className="flex gap-3 text-[#A7A7A7] shrink-0">
              <button type="button" disabled={!undoRef.current.length} onClick={(e) => { e.stopPropagation(); undo(); }} className="cursor-pointer hover:text-white transition-colors" aria-label="Undo"><Undo2 size={18} /></button>
              <button type="button" disabled={!redoRef.current.length} onClick={(e) => { e.stopPropagation(); redo(); }} className="cursor-pointer hover:text-white transition-colors" aria-label="Redo"><Redo2 size={18} /></button>
            </div>
          </div>

          {currentView === "boxes" && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="filter-row box-filter-row flex flex-wrap items-center gap-2.5 mb-7 relative z-20">
                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setIsActiveMenuOpen(!isActiveMenuOpen); setIsDateMenuOpen(false); setBoxDateCalendarTarget(null); }} className="flex items-center gap-1.5 px-6 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform">
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
                  <button type="button" onClick={(e) => { e.stopPropagation(); setIsDateMenuOpen(!isDateMenuOpen); setBoxDateCalendarTarget(null); setIsActiveMenuOpen(false); }} className="flex items-center gap-1.5 px-6 py-2 bg-transparent hover:border-white active:scale-95 text-white text-[13px] font-bold rounded-full border border-[#878787] transition-all">
                    {db.ui.boxFilter === "today" ? "Today" : db.ui.boxFilter === "7" ? "7 days" : db.ui.boxFilter === "15" ? "15 days" : db.ui.boxFilter === "30" ? "30 days" : db.ui.boxFilter === "all" ? "All" : "Custom"}
                  </button>
                  {isDateMenuOpen && (
                    <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 mt-2 w-[280px] max-w-[calc(100vw-2rem)] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100">
                      {[["today", "Today"], ["7", "7 days"], ["15", "15 days"], ["30", "30 days"], ["all", "All"]].map(([value, label]) => (
                        <button key={value} type="button" onClick={() => { setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilter: value } })); setBoxDateCalendarTarget(null); setIsDateMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors">{label}</button>
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
                        <div className="relative">
                          <div className={`flex h-[46px] w-full items-center gap-2 bg-[#111111] border rounded-[10px] px-3 text-[14px] text-white transition-colors ${boxDateCalendarTarget === "from" ? "border-[#FFD2D7]" : "border-[#333333]"}`}>
                            <DateTextInput
                              value={db.ui.boxFilterFrom || ""}
                              allowEmpty
                              ariaLabel="Start date"
                              onCommit={(date) => setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilterFrom: date } }))}
                              inputClassName="flex-1 text-[16px] font-medium leading-none"
                            />
                            <button type="button" onClick={(e) => { e.stopPropagation(); setBoxDateCalendarTarget(prev => prev === "from" ? null : "from"); }} className="h-8 w-8 shrink-0 grid place-items-center rounded-full text-[#A7A7A7] hover:text-[#FFD2D7] hover:bg-[#333333] transition-colors" aria-label="Open start date calendar">
                              <CalendarDays size={15} />
                            </button>
                          </div>
                          {boxDateCalendarTarget === "from" && (
                            <ActionDatePickerPanel
                              selectedDate={db.ui.boxFilterFrom || todayYMD()}
                              actionDays={db.actionDays}
                              align="left"
                              compact
                              placement="up"
                              onSelect={(date) => {
                                setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilterFrom: date } }));
                                setBoxDateCalendarTarget(null);
                              }}
                            />
                          )}
                        </div>
                        <div className="relative">
                          <div className={`flex h-[46px] w-full items-center gap-2 bg-[#111111] border rounded-[10px] px-3 text-[14px] text-white transition-colors ${boxDateCalendarTarget === "to" ? "border-[#FFD2D7]" : "border-[#333333]"}`}>
                            <DateTextInput
                              value={db.ui.boxFilterTo || ""}
                              allowEmpty
                              ariaLabel="End date"
                              onCommit={(date) => setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilterTo: date } }))}
                              inputClassName="flex-1 text-[16px] font-medium leading-none"
                            />
                            <button type="button" onClick={(e) => { e.stopPropagation(); setBoxDateCalendarTarget(prev => prev === "to" ? null : "to"); }} className="h-8 w-8 shrink-0 grid place-items-center rounded-full text-[#A7A7A7] hover:text-[#FFD2D7] hover:bg-[#333333] transition-colors" aria-label="Open end date calendar">
                              <CalendarDays size={15} />
                            </button>
                          </div>
                          {boxDateCalendarTarget === "to" && (
                            <ActionDatePickerPanel
                              selectedDate={db.ui.boxFilterTo || db.ui.boxFilterFrom || todayYMD()}
                              actionDays={db.actionDays}
                              align="left"
                              compact
                              placement="up"
                              onSelect={(date) => {
                                setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilterTo: date } }));
                                setBoxDateCalendarTarget(null);
                              }}
                            />
                          )}
                        </div>
                        <button type="button" onClick={() => { setDb(prev => markPendingSync({ ...prev, ui: { ...prev.ui, boxFilter: "custom" } })); setBoxDateCalendarTarget(null); setIsDateMenuOpen(false); }} className="justify-self-start text-[#FFD2D7] hover:text-white active:scale-95 text-[14px] font-bold underline underline-offset-4 decoration-[#FFD2D7] transition-all">
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
              <div className="filter-row action-filter-row flex items-center gap-2.5 mb-8 relative z-20">
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
                  <div className="flex items-center justify-center gap-1.5 min-w-0">
                    <DateTextInput
                      value={selectedDate}
                      ariaLabel="Action date"
                      onCommit={(date) => { selectActionDate(date); setIsActionCalendarOpen(false); }}
                      inputClassName="w-[92px] text-center text-[16px] font-bold leading-none"
                    />
                    {actionProgress ? <span className="text-[#A7A7A7] font-semibold text-[12px] whitespace-nowrap">{actionProgress.done}/{actionProgress.total}</span> : null}
                    <button type="button" aria-label="Open action date calendar" onClick={(e) => { e.stopPropagation(); setIsActionCalendarOpen(!isActionCalendarOpen); setIsActionsMenuOpen(false); }} className="h-8 w-8 shrink-0 grid place-items-center rounded-full text-[#FFD2D7] hover:text-white hover:bg-[#333333] transition-colors">
                      <CalendarDays size={14} />
                    </button>
                  </div>
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
              onOpenOrigin={openNoteOrigin}
              onSetView={(value) => setNotesUI("notesView", value)}
              onSetViewBy={setNotesViewBy}
              onToggleDate={toggleNoteDate}
              onOpenExport={openNotesExport}
              flashTarget={flashTarget}
            />
          )}

          {currentView === "boxNotes" && (
            <BoxNotesPanel
              state={db}
              boxId={selectedBoxNoteId}
              notes={notesForSelectedBox}
              onBack={() => revealBox(selectedBoxNoteId)}
              onCreateNote={createBoxLinkedNote}
              onOpenNote={openCentralNote}
              onDeleteNote={requestDeleteCentralNote}
              onToggleDate={toggleBoxNoteDate}
              flashTarget={flashTarget}
            />
          )}
        </main>

        {modal?.type === "boxNote" && <RichNoteModal modal={modal} state={db} onSave={saveBoxNote} syncStatus={syncStatus} syncLabel={syncLabel} onSyncNow={syncNow} />}
        {modal?.type === "actionNote" && <RichNoteModal modal={modal} state={db} onSave={saveActionNote} syncStatus={syncStatus} syncLabel={syncLabel} onSyncNow={syncNow} />}
        {modal?.type === "centralNote" && <RichNoteModal modal={modal} state={db} onSave={saveCentralNote} syncStatus={syncStatus} syncLabel={syncLabel} onSyncNow={syncNow} />}
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
