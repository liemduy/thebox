function useNoteActions({ db, commit, setModal, flashAfterNavigation, notesForView, showToast }) {
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

  function saveCentralNote({ noteId, title, bodyHtml, noteDate, link, keepOpen = false }) {
    let savedId = noteId;
    commit("Save note", state => {
      savedId = upsertCentralNote(state, { noteId, title, bodyHtml, noteDate, link });
      syncNoteToLinkedLegacy(state, savedId);
      state.ui.notesView = link ? "linked" : (state.ui.notesView || "free");
    }, { sync: false, history: !keepOpen });
    if (keepOpen) return;
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

  function saveBoxNote({ boxId, title, bodyHtml, keepOpen = false }) {
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
    }, { history: !keepOpen });
    if (!keepOpen) setModal(null);
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

  return {
    upsertCentralNote,
    saveCentralNote,
    deleteCentralNote,
    saveBoxNote,
    deleteBoxNote,
    exportAiNotes
  };
}
