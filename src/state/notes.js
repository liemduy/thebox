function noteTitle(entry) { return cleanTitle(entry?.title || "Note"); }
function entryText(entry) {
  const base = entry?.type === "note"
    ? `${noteTitle(entry)} ${htmlToText(entry.bodyHtml || "")}`.trim()
    : String(entry?.text || "").trim();
  const inlineTags = new Set(tagsFromText(base));
  const extraTags = entryTagList(entry).filter(tag => !inlineTags.has(tag)).map(tag => `#${tag}`).join(" ");
  return `${base} ${extraTags}`.trim();
}
function boxHasNote(node) { return Boolean(cleanOptionalTitle(node?.boxNoteTitle || "") || htmlToText(node?.boxNoteHtml || "")); }
function boxNoteLabel(node) { return cleanOptionalTitle(node?.boxNoteTitle || "") || "Note"; }
function getNote(state, noteId) { return (state.notes || []).find(note => note.id === noteId); }
function noteLinksFor(state, noteId) { return (state.noteLinks || []).filter(link => link.noteId === noteId); }
function noteIsLinked(state, noteId) { return noteLinksFor(state, noteId).length > 0; }
function noteDisplayTitle(note) { return cleanOptionalTitle(note?.title || "") || "Untitled"; }
function notePreview(note) { return noteBodyText(note).slice(0, 140); }
function activeNoteById(state, noteId) {
  const note = getNote(state, noteId);
  return note && !note.deletedAt && !note.archivedAt && noteHasContent(note) ? note : null;
}
function noteBoxLinkInfo(state, noteId) {
  const link = noteLinksFor(state, noteId).find(item => item.linkType === "box" && item.boxNodeId);
  const box = link ? getNode(state.boxNodes || [], link.boxNodeId) : null;
  return box ? { link, box, level: clampLevel(box.level || (box.parentId ? 2 : 1)) } : null;
}
function activeNotes(state) { return (state.notes || []).filter(note => !note.deletedAt && !note.archivedAt && noteHasContent(note)); }
function boxNoteLinksFor(state, boxId) {
  return (state.noteLinks || [])
    .filter(link => link.linkType === "box" && link.boxNodeId === boxId)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
}
function boxNotesFor(state, boxId) {
  const seen = new Set();
  return boxNoteLinksFor(state, boxId)
    .map(link => activeNoteById(state, link.noteId))
    .filter(note => {
      if (!note || seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    })
    .sort((a, b) => b.noteDate.localeCompare(a.noteDate) || timestampMs(b.updatedAt) - timestampMs(a.updatedAt));
}
function boxNoteCount(state, boxId) { return boxNotesFor(state, boxId).length; }
function notePrimaryOrigin(state, noteId) {
  const links = noteLinksFor(state, noteId);
  const boxLink = links.find(link => link.linkType === "box" && link.boxNodeId && getNode(state.boxNodes || [], link.boxNodeId));
  if (boxLink) {
    return {
      type: "box",
      boxId: boxLink.boxNodeId,
      box: getNode(state.boxNodes || [], boxLink.boxNodeId),
      link: boxLink
    };
  }
  const actionEntryLink = links.find(link => {
    if (link.linkType !== "action_entry" || !link.actionDate || !link.actionNodeId) return false;
    const day = (state.actionDays || []).find(item => item.date === link.actionDate);
    const node = day ? getNode(day.nodes || [], link.actionNodeId) : null;
    return Boolean(day && node);
  });
  if (actionEntryLink) {
    const day = (state.actionDays || []).find(item => item.date === actionEntryLink.actionDate);
    const node = day ? getNode(day.nodes || [], actionEntryLink.actionNodeId) : null;
    return {
      type: "action_entry",
      date: actionEntryLink.actionDate,
      actionNodeId: actionEntryLink.actionNodeId,
      entryId: actionEntryLink.actionEntryId || null,
      day,
      node,
      link: actionEntryLink
    };
  }
  const actionNodeLink = links.find(link => {
    if (link.linkType !== "action_node" || !link.actionDate || !link.actionNodeId) return false;
    const day = (state.actionDays || []).find(item => item.date === link.actionDate);
    return Boolean(day && getNode(day.nodes || [], link.actionNodeId));
  });
  if (actionNodeLink) {
    const day = (state.actionDays || []).find(item => item.date === actionNodeLink.actionDate);
    const node = day ? getNode(day.nodes || [], actionNodeLink.actionNodeId) : null;
    return { type: "action_node", date: actionNodeLink.actionDate, actionNodeId: actionNodeLink.actionNodeId, day, node, link: actionNodeLink };
  }
  const dayLink = links.find(link => link.linkType === "day" && link.actionDate && (state.actionDays || []).some(item => item.date === link.actionDate));
  return dayLink ? { type: "day", date: dayLink.actionDate, day: (state.actionDays || []).find(item => item.date === dayLink.actionDate), link: dayLink } : null;
}
function noteTagList(note) {
  return normalizeTags(note?.tags || [], note?.title || "", note?.bodyHtml || "", note?.bodyText || "");
}
function allNoteTags(state) {
  return [...new Set(activeNotes(state).flatMap(noteTagList))].sort();
}
function linkLabel(state, link) {
  if (!link) return "Free note";
  if (link.linkType === "box" && link.boxNodeId) {
    const box = getNode(state.boxNodes, link.boxNodeId);
    return box ? pathOf(box, state.boxNodes) : "Box";
  }
  if ((link.linkType === "action_entry" || link.linkType === "action_node") && link.actionDate) {
    const day = state.actionDays.find(item => item.date === link.actionDate);
    const node = day && link.actionNodeId ? getNode(day.nodes, link.actionNodeId) : null;
    return `${displayDate(link.actionDate)}${node ? ` - ${pathOf(node, day.nodes)}` : ""}`;
  }
  if (link.linkType === "day" && link.actionDate) return displayDate(link.actionDate);
  return "Linked note";
}
function noteInDateFilter(note, filter) {
  const value = filter || "all";
  if (value === "all") return true;
  const diff = daysFromToday(note.noteDate);
  if (value === "today") return diff === 0;
  const days = Number(value);
  return Number.isFinite(days) ? diff >= 0 && diff <= days : true;
}
function parseUserDate(value) {
  const raw = String(value || "").trim();
  if (validYMD(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, d, m, y] = match;
  const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return validYMD(date) ? date : "";
}
function parseExportDateFilters(input) {
  return String(input || "").split(",").map(part => part.trim()).filter(Boolean).map(part => {
    const range = part.split(/\s+-\s+/);
    if (range.length === 2) {
      const from = parseUserDate(range[0]);
      const to = parseUserDate(range[1]);
      return from && to ? { type: "range", from: from <= to ? from : to, to: from <= to ? to : from } : null;
    }
    const date = parseUserDate(part);
    return date ? { type: "date", date } : null;
  }).filter(Boolean);
}
function noteMatchesExportDates(note, filters) {
  if (!filters.length) return true;
  return filters.some(filter => filter.type === "date" ? note.noteDate === filter.date : note.noteDate >= filter.from && note.noteDate <= filter.to);
}
function exportTagsFromInput(input) {
  return [...new Set(String(input || "").split(",").map(normalizeTag).filter(Boolean))];
}
function filteredNotes(state) {
  const view = state.ui.notesView || "linked";
  const tags = exportTagsFromInput(state.ui.notesTagsInput || state.ui.notesTag || "");
  const dateFilters = parseExportDateFilters(state.ui.notesDatesInput || "");
  return activeNotes(state)
    .filter(note => view === "all" || (view === "linked" ? noteIsLinked(state, note.id) : !noteIsLinked(state, note.id)))
    .filter(note => !tags.length || tags.every(tag => noteTagList(note).includes(tag)))
    .filter(note => dateFilters.length ? noteMatchesExportDates(note, dateFilters) : noteInDateFilter(note, state.ui.notesDate || "all"))
    .sort((a, b) => {
      const pin = timestampMs(b.pinnedAt) - timestampMs(a.pinnedAt);
      if (pin) return pin;
      return b.noteDate.localeCompare(a.noteDate) || timestampMs(b.updatedAt) - timestampMs(a.updatedAt);
    });
}
function groupNotesByDate(notes) {
  const groups = new Map();
  notes.forEach(note => {
    const date = note.noteDate || todayYMD();
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(note);
  });
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}
function syncNoteToLinkedLegacy(state, noteId, deleted = false) {
  const note = getNote(state, noteId);
  const links = noteLinksFor(state, noteId);
  links.forEach(link => {
    if (link.linkType === "box" && link.boxNodeId) {
      if (noteId !== boxNoteId(link.boxNodeId)) return;
      const box = getNode(state.boxNodes, link.boxNodeId);
      if (!box) return;
      box.boxNoteTitle = deleted ? "" : cleanOptionalTitle(note?.title || "");
      box.boxNoteHtml = deleted ? "" : sanitizeHtml(note?.bodyHtml || "");
      box.updatedAt = now();
    }
    if (link.linkType === "action_entry" && link.actionDate && link.actionNodeId && link.actionEntryId) {
      const day = state.actionDays.find(item => item.date === link.actionDate);
      const node = day ? getNode(day.nodes, link.actionNodeId) : null;
      if (!day || !node) return;
      node.entries = normalizeEntries(node);
      if (deleted) {
        node.entries = node.entries.filter(entry => entry.id !== link.actionEntryId);
      } else {
        const entry = node.entries.find(item => item.id === link.actionEntryId);
        if (entry && entry.type === "note") {
          entry.title = cleanOptionalTitle(note?.title || "") || "Note";
          entry.bodyHtml = sanitizeHtml(note?.bodyHtml || "");
          entry.updatedAt = now();
        }
      }
      node.updatedAt = now();
      day.updatedAt = now();
    }
  });
}
