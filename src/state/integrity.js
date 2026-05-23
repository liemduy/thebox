function actionNodeForLink(state, link) {
  if (!link?.actionDate || !link?.actionNodeId) return null;
  const day = (state.actionDays || []).find(item => item.date === link.actionDate);
  return day ? getNode(day.nodes || [], link.actionNodeId) : null;
}

function noteLinkTargetExists(state, link) {
  if (!link?.noteId) return false;
  if (link.linkType === "box") return Boolean(link.boxNodeId && getNode(state.boxNodes || [], link.boxNodeId));
  if (link.linkType === "day") return Boolean(link.actionDate && (state.actionDays || []).some(day => day.date === link.actionDate));
  if (link.linkType === "action_node") return Boolean(actionNodeForLink(state, link));
  if (link.linkType === "action_entry") {
    const node = actionNodeForLink(state, link);
    return Boolean(node && link.actionEntryId && entriesFor(node).some(entry => entry.id === link.actionEntryId));
  }
  return false;
}

function markNoteDeletedForIntegrity(note, timestamp = now()) {
  if (!note || note.deletedAt) return;
  note.deletedAt = timestamp;
  note.updatedAt = timestamp;
  note.clientUpdatedAt = timestamp;
}

function isStructuralLinkedNoteId(noteId) {
  return String(noteId || "").startsWith("boxnote_") || String(noteId || "").startsWith("actionnote_");
}

function repairStateIntegrity(state, options = {}) {
  const t = options.timestamp || now();
  state.boxNodes = Array.isArray(state.boxNodes) ? state.boxNodes : [];
  state.actionDays = Array.isArray(state.actionDays) ? state.actionDays : [];
  state.notes = Array.isArray(state.notes) ? state.notes : [];
  state.noteLinks = Array.isArray(state.noteLinks) ? state.noteLinks : [];
  state.ui = { ...defaultUI(), ...(state.ui || {}) };

  const noteById = new Map(state.notes.map(note => [note.id, note]).filter(([id]) => Boolean(id)));
  const validLinksById = new Map();
  const linkedNoteIds = new Set();

  state.noteLinks.forEach(rawLink => {
    const link = normalizeNoteLink(rawLink);
    const note = noteById.get(link.noteId);
    if (!note) return;
    if (note.deletedAt) return;
    if (!noteLinkTargetExists(state, link)) {
      if (isStructuralLinkedNoteId(link.noteId)) markNoteDeletedForIntegrity(note, t);
      return;
    }
    validLinksById.set(link.id, link);
    linkedNoteIds.add(link.noteId);
  });

  state.notes.forEach(note => {
    if (isStructuralLinkedNoteId(note.id) && !linkedNoteIds.has(note.id)) {
      markNoteDeletedForIntegrity(note, t);
    }
  });

  const activeNoteIds = new Set(state.notes.filter(note => !note.deletedAt).map(note => note.id));
  state.noteLinks = [...validLinksById.values()].filter(link => activeNoteIds.has(link.noteId));

  const boxIds = new Set(state.boxNodes.map(node => node.id));
  const actionNodeIds = new Set((state.actionDays || []).flatMap(day => (day.nodes || []).map(node => node.id)));
  state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => boxIds.has(id));
  state.ui.expandedBoxNodes = (state.ui.expandedBoxNodes || []).filter(id => boxIds.has(id));
  state.ui.collapsedActionNodes = (state.ui.collapsedActionNodes || []).filter(id => actionNodeIds.has(id));
  state.ui.boxCascadeModes = Object.fromEntries(Object.entries(normalizeModeMap(state.ui.boxCascadeModes)).filter(([id]) => boxIds.has(id)));
  state.ui.actionCascadeModes = Object.fromEntries(Object.entries(normalizeModeMap(state.ui.actionCascadeModes)).filter(([id]) => actionNodeIds.has(id)));
  return state;
}

function stateIntegrityReport(state) {
  const normalized = normalizeState(state);
  const noteIds = new Set((normalized.notes || []).map(note => note.id));
  const invalidLinks = (normalized.noteLinks || []).filter(link => !noteIds.has(link.noteId) || !noteLinkTargetExists(normalized, link));
  const structuralGhostNotes = (normalized.notes || []).filter(note => !note.deletedAt && isStructuralLinkedNoteId(note.id) && !noteIsLinked(normalized, note.id));
  return {
    invalidLinks: invalidLinks.length,
    structuralGhostNotes: structuralGhostNotes.length,
    orphanUiBoxIds: (normalized.ui.collapsedBoxNodes || []).filter(id => !getNode(normalized.boxNodes, id)).length + (normalized.ui.expandedBoxNodes || []).filter(id => !getNode(normalized.boxNodes, id)).length
  };
}
