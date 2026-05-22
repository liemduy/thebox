function noteDbRow(userId, note) {
  const normalized = normalizeNote(note);
  return {
    user_id: userId,
    id: normalized.id,
    title: normalized.title,
    body_html: normalized.bodyHtml,
    body_text: normalized.bodyText,
    note_date: normalized.noteDate,
    tags: normalized.tags || [],
    pinned_at: normalized.pinnedAt,
    archived_at: normalized.archivedAt,
    deleted_at: normalized.deletedAt,
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
    client_updated_at: normalized.clientUpdatedAt
  };
}

function noteLinkDbRow(userId, link) {
  const normalized = normalizeNoteLink(link);
  return {
    user_id: userId,
    id: normalized.id,
    note_id: normalized.noteId,
    link_type: normalized.linkType,
    box_node_id: normalized.boxNodeId,
    action_date: normalized.actionDate,
    action_node_id: normalized.actionNodeId,
    action_entry_id: normalized.actionEntryId,
    created_at: normalized.createdAt
  };
}

function mergeNormalizedNotes(state, noteRows = [], linkRows = []) {
  const next = normalizeState(state);
  const byId = new Map((next.notes || []).map(note => [note.id, note]));
  (noteRows || []).map(normalizeNote).forEach(note => {
    if (!note.id) return;
    const existing = byId.get(note.id);
    const incomingTime = timestampMs(note.clientUpdatedAt || note.updatedAt);
    const existingTime = timestampMs(existing?.clientUpdatedAt || existing?.updatedAt);
    if (!existing || incomingTime >= existingTime) byId.set(note.id, note);
  });
  next.notes = [...byId.values()];
  const noteIds = new Set(next.notes.map(note => note.id));
  const linkById = new Map((next.noteLinks || []).filter(link => noteIds.has(link.noteId)).map(link => [link.id, link]));
  (linkRows || []).map(normalizeNoteLink).forEach(link => {
    if (link.id && noteIds.has(link.noteId)) linkById.set(link.id, link);
  });
  next.noteLinks = [...linkById.values()];
  return normalizeState(next);
}

async function loadNormalizedNoteTables(userId) {
  if (!sb || !userId || userId === "local") return null;
  try {
    const [notesResult, linksResult] = await Promise.all([
      withTimeout(sb.from(NOTES_TABLE).select("*").eq("user_id", userId), CLOUD_READ_TIMEOUT_MS, "Notes load"),
      withTimeout(sb.from(NOTE_LINKS_TABLE).select("*").eq("user_id", userId), CLOUD_READ_TIMEOUT_MS, "Note links load")
    ]);
    if (notesResult?.error || linksResult?.error) throw (notesResult?.error || linksResult?.error);
    return { notes: notesResult.data || [], links: linksResult.data || [] };
  } catch (error) {
    console.warn("Normalized notes table sync skipped", error);
    return null;
  }
}

async function pushNormalizedNoteTables(snapshot, user) {
  if (!sb || !user?.id || user.id === "local" || !navigator.onLine) return;
  try {
    const clean = sanitizedState(snapshot);
    const notes = (clean.notes || []).map(note => noteDbRow(user.id, note));
    const links = (clean.noteLinks || []).filter(link => (clean.notes || []).some(note => note.id === link.noteId)).map(link => noteLinkDbRow(user.id, link));
    const [existingNotesResult, existingLinksResult] = await Promise.all([
      withTimeout(sb.from(NOTES_TABLE).select("id").eq("user_id", user.id), CLOUD_READ_TIMEOUT_MS, "Notes mirror list"),
      withTimeout(sb.from(NOTE_LINKS_TABLE).select("id").eq("user_id", user.id), CLOUD_READ_TIMEOUT_MS, "Note links mirror list")
    ]);
    if (existingNotesResult?.error || existingLinksResult?.error) throw (existingNotesResult?.error || existingLinksResult?.error);

    const noteIds = new Set(notes.map(row => row.id));
    const linkIds = new Set(links.map(row => row.id));
    const staleLinkIds = (existingLinksResult.data || []).map(row => row.id).filter(id => !linkIds.has(id));
    const staleNoteIds = (existingNotesResult.data || []).map(row => row.id).filter(id => !noteIds.has(id));

    if (staleLinkIds.length) {
      const deleteLinks = await withTimeout(sb.from(NOTE_LINKS_TABLE).delete().eq("user_id", user.id).in("id", staleLinkIds), CLOUD_WRITE_TIMEOUT_MS, "Note links mirror prune");
      if (deleteLinks?.error) throw deleteLinks.error;
    }
    if (notes.length) {
      const notesResult = await withTimeout(sb.from(NOTES_TABLE).upsert(notes, { onConflict: "user_id,id" }), CLOUD_WRITE_TIMEOUT_MS, "Notes mirror");
      if (notesResult?.error) throw notesResult.error;
    }
    if (staleNoteIds.length) {
      const deleteNotes = await withTimeout(sb.from(NOTES_TABLE).delete().eq("user_id", user.id).in("id", staleNoteIds), CLOUD_WRITE_TIMEOUT_MS, "Notes mirror prune");
      if (deleteNotes?.error) throw deleteNotes.error;
    }
    if (links.length) {
      const linksResult = await withTimeout(sb.from(NOTE_LINKS_TABLE).upsert(links, { onConflict: "user_id,id" }), CLOUD_WRITE_TIMEOUT_MS, "Note links mirror");
      if (linksResult?.error) throw linksResult.error;
    }
  } catch (error) {
    console.warn("Normalized notes table sync skipped", error);
  }
}
