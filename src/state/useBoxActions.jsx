function useBoxActions({ db, setDb, commit }) {
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

  return {
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
  };
}
