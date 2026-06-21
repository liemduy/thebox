function useActionEntries({
  selectedDate,
  setDb,
  commit,
  setModal,
  setCurrentView,
  setIsSearchOpen,
  flashAfterNavigation,
  upsertCentralNote
}) {
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
      day.restDay = false;
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

  function setActionRestDay(date = selectedDate, restDay = true) {
    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : todayYMD();
    commit(restDay ? "Mark rest day" : "Cancel rest day", state => {
      state.ui.selectedActionDate = ymd;
      state.ui.actionFilter = "all";
      let day = state.actionDays.find(item => item.date === ymd);
      const t = now();
      if (restDay) {
        if (!day) {
          day = { id: uid("day"), date: ymd, restDay: true, createdAt: t, updatedAt: t, nodes: [] };
          state.actionDays.push(day);
        } else {
          day.restDay = true;
          day.updatedAt = t;
        }
        return;
      }
      if (!day) return false;
      day.restDay = false;
      day.updatedAt = t;
      if (!Array.isArray(day.nodes) || !day.nodes.length) {
        state.actionDays = state.actionDays.filter(item => item.id !== day.id);
      }
    }, { sync: false });
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

  function saveActionNote({ dayId, nodeId, entryId, title, bodyHtml, keepOpen = false }) {
    let savedEntryId = entryId || null;
    commit("Save action note", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const t = now();
      node.entries = normalizeEntries(node);
      const entry = entryId ? node.entries.find(e => e.id === entryId) : null;
      savedEntryId = entry?.id || null;
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
    }, { sync: false, history: !keepOpen });
    if (keepOpen) {
      setModal(prev => prev?.type === "actionNote" ? { ...prev, entryId: savedEntryId || prev.entryId } : prev);
      return;
    }
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

  return {
    createActionsForDate,
    selectActionDate,
    setActionRestDay,
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
  };
}
