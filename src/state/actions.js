function actionDayHasEntriesForBoxSubtree(state, day, boxId) {
  const ids = new Set([boxId, ...descendantsOf(boxId, state.boxNodes).map(n => n.id)]);
  return (day.nodes || []).some(node => ids.has(node.sourceBoxNodeId) && entriesFor(node).length);
}

function syncActionDayWithBox(state, day) {
  if (!day) return false;
  const before = JSON.stringify((day.nodes || []).map(n => ({
    id: n.id, parentId: n.parentId, level: n.level, title: n.title, sourceBoxNodeId: n.sourceBoxNodeId, sort: n.sort, entryIds: entriesFor(n).map(e => e.id)
  })));
  const existingBySource = new Map();
  (day.nodes || []).forEach(node => { if (node.sourceBoxNodeId) existingBySource.set(node.sourceBoxNodeId, node); });
  const next = [];
  const t = now();
  function shouldInclude(box) {
    if (!boxIsInactive(box) && !boxIsArchived(box)) return true;
    return actionDayHasEntriesForBoxSubtree(state, day, box.id);
  }
  function cloneBox(box, parentCloneId) {
    if (!shouldInclude(box)) return null;
    const old = existingBySource.get(box.id);
    const actionNode = {
      id: rememberId(old?.id || uid("actionnode")),
      parentId: parentCloneId,
      level: box.level,
      title: cleanTitle(box.title),
      archivedAt: box.archivedAt || null,
      sort: Number.isFinite(+box.sort) ? +box.sort : childrenOf(box.parentId, state.boxNodes).indexOf(box) + 1,
      sourceBoxNodeId: box.id,
      entries: normalizeEntries(old || {}),
      done: Boolean(old?.done),
      createdAt: old?.createdAt || t,
      updatedAt: old?.updatedAt || t
    };
    next.push(actionNode);
    childrenOf(box.id, state.boxNodes).forEach(child => cloneBox(child, actionNode.id));
    return actionNode;
  }
  childrenOf(null, state.boxNodes).forEach(root => cloneBox(root, null));
  day.nodes = next;
  const after = JSON.stringify(day.nodes.map(n => ({
    id: n.id, parentId: n.parentId, level: n.level, title: n.title, sourceBoxNodeId: n.sourceBoxNodeId, sort: n.sort, entryIds: entriesFor(n).map(e => e.id)
  })));
  if (before !== after) {
    day.updatedAt = t;
    return true;
  }
  return false;
}

function syncSelectedActionDayWithBox(state) {
  const day = state.actionDays.find(item => item.date === (state.ui.selectedActionDate || todayYMD()));
  return day ? syncActionDayWithBox(state, day) : false;
}

function collectSearchResults(state, query, filters = { box: true, action: true, note: true }) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];
  const out = [];
  if (filters.box !== false) {
    state.boxNodes.forEach(node => {
      const note = `${node.boxNoteTitle || ""} ${htmlToText(node.boxNoteHtml || "")}`.trim();
      if (node.title.toLowerCase().includes(term) || note.toLowerCase().includes(term)) {
        out.push({ id: `box:${node.id}`, kind: "box", title: pathOf(node, state.boxNodes), text: note, boxId: node.id });
      }
    });
  }
  if (filters.action !== false) {
    state.actionDays.forEach(day => {
      day.nodes.forEach(node => {
        entriesFor(node, "action").forEach(entry => {
          const text = entryText(entry);
          if (node.title.toLowerCase().includes(term) || text.toLowerCase().includes(term)) {
            out.push({ id: `entry:${day.id}:${node.id}:${entry.id}`, kind: "act", meta: displayDate(day.date), title: pathOf(node, day.nodes), text, dayId: day.id, date: day.date, actionNodeId: node.id, entryId: entry.id });
          }
        });
      });
    });
  }
  if (filters.note !== false) {
    activeNotes(state).forEach(note => {
      const noteTags = noteTagList(note);
      const text = `${noteDisplayTitle(note)} ${noteBodyText(note)} ${noteTags.map(tag => `#${tag}`).join(" ")}`.toLowerCase();
      if (text.includes(term)) {
        const links = noteLinksFor(state, note.id);
        out.push({
          id: `note:${note.id}`,
          kind: "note",
          meta: links.length ? linkLabel(state, links[0]) : "free",
          title: noteDisplayTitle(note),
          text: notePreview(note) || noteTags.map(tag => `#${tag}`).join(" "),
          noteId: note.id
        });
      }
    });
  }
  return out.slice(0, 40);
}
