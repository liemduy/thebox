let idSequence = 0;
const runtimeUsedIds = new Set();
const HISTORY_LIMIT = 30;

function now() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cleanTitle(value) { return String(value || "").replace(/\s+/g, " ").trim() || "Untitled"; }
function cleanOptionalTitle(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function clampLevel(value) { return Math.max(1, Math.min(5, Number(value) || 1)); }
function timestampMs(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}
function validTimestamp(value) {
  return timestampMs(value) ? String(value) : "";
}
function rememberId(id) { if (id) runtimeUsedIds.add(String(id)); return String(id || ""); }
function uid(prefix = "id") {
  const safe = String(prefix || "id").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "id";
  let id = "";
  do {
    idSequence += 1;
    const random = window.crypto?.getRandomValues
      ? Array.from(window.crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, "0")).join("")
      : Math.random().toString(36).slice(2, 12);
    id = `${safe}_${Date.now()}_${String(idSequence).padStart(5, "0")}_${random}`;
  } while (runtimeUsedIds.has(id));
  runtimeUsedIds.add(id);
  return id;
}

function sanitizeHtml(input) {
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "BR", "DIV", "P", "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "TABLE", "TBODY", "THEAD", "TR", "TH", "TD"]);
  const indentable = new Set(["DIV", "P", "H1", "H2", "H3"]);
  const bulletStyles = new Set(["disc", "circle", "square"]);
  const orderedStyles = new Set(["decimal", "lower-alpha", "lower-roman"]);
  const template = document.createElement("template");
  template.innerHTML = String(input || "");
  function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ""));
          return;
        }
        [...child.attributes].forEach(attr => {
          if (attr.name === "data-indent" && indentable.has(child.tagName)) {
            const level = Math.max(0, Math.min(4, Number(attr.value) || 0));
            if (level > 0) child.setAttribute("data-indent", String(level));
            else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-size" && child.tagName === "P") {
            const size = String(attr.value || "").toLowerCase();
            if (size === "small") child.setAttribute("data-size", "small");
            else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-type" && child.tagName === "UL") {
            if (String(attr.value || "") === "task-list") child.setAttribute("data-type", "task-list");
            else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-list-style" && child.tagName === "UL") {
            const style = String(attr.value || "").toLowerCase();
            if (bulletStyles.has(style)) child.setAttribute("data-list-style", style);
            else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-list-style" && child.tagName === "OL") {
            const style = String(attr.value || "").toLowerCase();
            if (orderedStyles.has(style)) child.setAttribute("data-list-style", style);
            else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "start" && child.tagName === "OL") {
            const start = Math.max(1, Math.min(999, Number(attr.value) || 1));
            if (start > 1) child.setAttribute("start", String(start));
            else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-type" && child.tagName === "LI") {
            if (String(attr.value || "") === "task-item") child.setAttribute("data-type", "task-item");
            else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-checked" && child.tagName === "LI") {
            child.setAttribute("data-checked", String(attr.value || "") === "true" ? "true" : "false");
            return;
          }
          if (attr.name === "data-layout" && child.tagName === "TABLE") {
            child.setAttribute("data-layout", String(attr.value || "") === "auto" ? "auto" : "fixed");
            return;
          }
          child.removeAttribute(attr.name);
        });
        clean(child);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    });
  }
  clean(template.content);
  return template.innerHTML;
}

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = sanitizeHtml(html || "");
  const blockTags = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "TABLE", "TR", "TH", "TD"]);
  const chunks = [];
  function walk(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        chunks.push(child.textContent || "");
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (child.tagName === "BR") {
        chunks.push(" ");
        return;
      }
      const isBlock = blockTags.has(child.tagName);
      if (isBlock) chunks.push(" ");
      walk(child);
      if (isBlock) chunks.push(" ");
    });
  }
  walk(div);
  return chunks.join("").replace(/\s+/g, " ").trim();
}

function validNoteDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : todayYMD();
}

function normalizeTag(value) {
  return String(value || "").replace(/^#/, "").trim().toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, "");
}

function tagsFromText(value) {
  const tags = new Set();
  String(value || "").replace(/(^|[\s([{])#([\p{L}\p{N}_-]{1,48})/gu, (_, prefix, tag) => {
    const cleaned = normalizeTag(tag);
    if (cleaned) tags.add(cleaned);
    return "";
  });
  return [...tags];
}

function normalizeTags(tags, title = "", bodyHtml = "", bodyText = "") {
  const out = new Set();
  (Array.isArray(tags) ? tags : []).forEach(tag => {
    const cleaned = normalizeTag(tag);
    if (cleaned) out.add(cleaned);
  });
  tagsFromText(`${title} ${htmlToText(bodyHtml)} ${bodyText}`).forEach(tag => out.add(tag));
  return [...out].sort();
}

function noteBodyText(note) {
  return String(note?.bodyText || htmlToText(note?.bodyHtml || "")).replace(/\s+/g, " ").trim();
}

function noteHasContent(note) {
  return Boolean(cleanOptionalTitle(note?.title || "") || noteBodyText(note));
}

function entryTagList(entry) {
  if (entry?.type === "note") return normalizeTags(entry.tags || [], entry.title || "", entry.bodyHtml || "");
  return normalizeTags(entry?.tags || [], entry?.text || "");
}

function boxNoteId(boxId) { return `boxnote_${boxId}`; }
function boxNoteLinkId(boxId) { return `link_box_${boxId}`; }
function actionNoteId(entryId) { return `actionnote_${entryId}`; }
function actionNoteLinkId(entryId) { return `link_action_${entryId}`; }

function defaultUI() {
  return {
    boxView: "active",
    boxFilter: "today",
    boxFilterFrom: "",
    boxFilterTo: "",
    showBoxDays: true,
    selectedActionDate: todayYMD(),
    actionFilter: "all",
    notesView: "linked",
    notesTag: "",
    notesDate: "all",
    notesTagsInput: "",
    notesDatesInput: "",
    selectedBoxNoteId: "",
    collapsedNoteDates: [],
    collapsedBoxNoteDates: [],
    collapsedBoxNodes: [],
    expandedBoxNodes: [],
    expandedBoxActionDays: [],
    collapsedActionNodes: [],
    boxCascadeModes: {},
    actionCascadeModes: {}
  };
}

function applyRouteToState(state, route) {
  const ui = route?.ui || {};
  Object.assign(state.ui, ui);
  if (route?.name === "actions" || route?.tab === "actions") syncSelectedActionDayWithBox(state);
  return state;
}

function seed() {
  const t = now();
  const content = uid("box");
  const sales = uid("box");
  const tiktok = uid("sub");
  const blog = uid("sub");
  const follow = uid("sub");
  return {
    version: 5,
    meta: { usedIds: [content, sales, tiktok, blog, follow] },
    boxNodes: [
      { id: content, parentId: null, level: 1, title: "Content", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: sales, parentId: null, level: 1, title: "Sales", sort: 2, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: tiktok, parentId: content, level: 2, title: "TikTok", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: blog, parentId: content, level: 2, title: "Blog", sort: 2, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: follow, parentId: sales, level: 2, title: "Follow up", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t }
    ],
    actionDays: [],
    notes: [],
    noteLinks: [],
    ui: defaultUI()
  };
}

function normalizeEntry(entry, index = 0) {
  const t = now();
  if (entry?.type === "note") {
    const title = cleanTitle(entry.title || entry.text || "Note");
    const bodyHtml = sanitizeHtml(entry.bodyHtml || entry.contentHtml || entry.body || "");
    return {
      id: rememberId(entry.id || uid("entry")),
      type: "note",
      title,
      bodyHtml,
      tags: normalizeTags(entry.tags || [], title, bodyHtml),
      sort: Number.isFinite(+entry.sort) ? +entry.sort : index + 1,
      createdAt: entry.createdAt || t,
      updatedAt: entry.updatedAt || t
    };
  }
  const text = cleanTitle(entry?.text || entry?.title || "Action");
  return {
    id: rememberId(entry?.id || uid("entry")),
    type: "action",
    text,
    tags: normalizeTags(entry?.tags || [], text),
    done: Boolean(entry?.done),
    sort: Number.isFinite(+entry?.sort) ? +entry.sort : index + 1,
    createdAt: entry?.createdAt || t,
    updatedAt: entry?.updatedAt || t
  };
}

function normalizeEntries(node) {
  if (Array.isArray(node?.entries) && node.entries.length) return node.entries.map(normalizeEntry);
  const legacy = sanitizeHtml(node?.contentHtml || "");
  return htmlToText(legacy) ? [normalizeEntry({ type: "note", title: "Note", bodyHtml: legacy })] : [];
}

function normalizeNote(note, index = 0) {
  const t = now();
  const bodyHtml = sanitizeHtml(note?.bodyHtml || note?.body_html || note?.contentHtml || note?.body || "");
  const title = cleanOptionalTitle(note?.title || "") || (noteBodyText({ bodyHtml }) ? "Untitled" : "");
  const bodyText = noteBodyText({ bodyHtml, bodyText: note?.bodyText || note?.body_text || "" });
  const createdAt = validTimestamp(note?.createdAt || note?.created_at) || t;
  const updatedAt = validTimestamp(note?.updatedAt || note?.updated_at) || createdAt;
  return {
    id: rememberId(note?.id || uid("note")),
    title,
    bodyHtml,
    bodyText,
    noteDate: validNoteDate(note?.noteDate || note?.note_date || String(createdAt).slice(0, 10)),
    tags: normalizeTags(note?.tags || [], title, bodyHtml, bodyText),
    pinnedAt: validTimestamp(note?.pinnedAt || note?.pinned_at) || null,
    archivedAt: validTimestamp(note?.archivedAt || note?.archived_at) || null,
    deletedAt: validTimestamp(note?.deletedAt || note?.deleted_at) || null,
    sort: Number.isFinite(+note?.sort) ? +note.sort : index + 1,
    createdAt,
    updatedAt,
    clientUpdatedAt: validTimestamp(note?.clientUpdatedAt || note?.client_updated_at) || updatedAt
  };
}

function normalizeNoteLink(link, index = 0) {
  const type = ["box", "action_node", "action_entry", "day"].includes(link?.linkType || link?.link_type)
    ? (link.linkType || link.link_type)
    : "box";
  return {
    id: rememberId(link?.id || uid("notelink")),
    noteId: rememberId(link?.noteId || link?.note_id || ""),
    linkType: type,
    boxNodeId: link?.boxNodeId || link?.box_node_id || null,
    actionDate: validYMD(link?.actionDate || link?.action_date) ? (link.actionDate || link.action_date) : null,
    actionNodeId: link?.actionNodeId || link?.action_node_id || null,
    actionEntryId: link?.actionEntryId || link?.action_entry_id || null,
    sort: Number.isFinite(+link?.sort) ? +link.sort : index + 1,
    createdAt: validTimestamp(link?.createdAt || link?.created_at) || now()
  };
}

function upsertNoteLink(state, link) {
  if (!link?.noteId) return;
  const normalized = normalizeNoteLink(link, state.noteLinks?.length || 0);
  const existing = (state.noteLinks || []).find(item => item.id === normalized.id);
  if (existing) Object.assign(existing, normalized);
  else state.noteLinks.push(normalized);
}

function upsertLegacyNote(state, note, link) {
  if (!note?.id || !noteHasContent(note)) return;
  const normalized = normalizeNote(note, state.notes?.length || 0);
  const existing = (state.notes || []).find(item => item.id === normalized.id);
  if (!existing) state.notes.push(normalized);
  upsertNoteLink(state, { ...link, noteId: normalized.id });
}

function ensureCentralNotes(state) {
  state.notes = Array.isArray(state.notes) ? state.notes : [];
  state.noteLinks = Array.isArray(state.noteLinks) ? state.noteLinks : [];
  (state.boxNodes || []).forEach(node => {
    if (!boxHasNote(node)) return;
    const noteId = boxNoteId(node.id);
    upsertLegacyNote(state, {
      id: noteId,
      title: cleanOptionalTitle(node.boxNoteTitle || "") || "Untitled",
      bodyHtml: node.boxNoteHtml || "",
      noteDate: validTimestamp(node.updatedAt) ? String(node.updatedAt).slice(0, 10) : todayYMD(),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      clientUpdatedAt: node.updatedAt
    }, {
      id: boxNoteLinkId(node.id),
      linkType: "box",
      boxNodeId: node.id
    });
  });
  (state.actionDays || []).forEach(day => {
    (day.nodes || []).forEach(node => {
      noteEntriesFor(node).forEach(entry => {
        if (!noteHasContent({ title: entry.title, bodyHtml: entry.bodyHtml })) return;
        const noteId = actionNoteId(entry.id);
        upsertLegacyNote(state, {
          id: noteId,
          title: noteTitle(entry),
          bodyHtml: entry.bodyHtml || "",
          noteDate: day.date,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          clientUpdatedAt: entry.updatedAt
        }, {
          id: actionNoteLinkId(entry.id),
          linkType: "action_entry",
          actionDate: day.date,
          actionNodeId: node.id,
          actionEntryId: entry.id,
          boxNodeId: node.sourceBoxNodeId || null
        });
      });
    });
  });
  const noteIds = new Set(state.notes.map(note => note.id));
  state.noteLinks = state.noteLinks.filter(link => noteIds.has(link.noteId));
  return state;
}

function collectStateIds(boxNodes, actionDays, notes = [], noteLinks = []) {
  const ids = new Set();
  (boxNodes || []).forEach(node => {
    if (node?.id) ids.add(node.id);
  });
  (actionDays || []).forEach(day => {
    if (day?.id) ids.add(day.id);
    (day?.nodes || []).forEach(node => {
      if (node?.id) ids.add(node.id);
      entriesFor(node).forEach(entry => {
        if (entry?.id) ids.add(entry.id);
      });
    });
  });
  (notes || []).forEach(note => { if (note?.id) ids.add(note.id); });
  (noteLinks || []).forEach(link => { if (link?.id) ids.add(link.id); });
  ids.forEach(id => runtimeUsedIds.add(id));
  return ids;
}

function normalizeMeta(meta, ids) {
  return {
    usedIds: [...ids],
    pendingSync: Boolean(meta?.pendingSync),
    localUpdatedAt: validTimestamp(meta?.localUpdatedAt),
    cloudUpdatedAt: validTimestamp(meta?.cloudUpdatedAt),
    lastSyncedAt: validTimestamp(meta?.lastSyncedAt)
  };
}

function markPendingSync(state, timestamp = now()) {
  const normalized = normalizeState(state);
  normalized.meta = {
    ...normalized.meta,
    pendingSync: true,
    localUpdatedAt: validTimestamp(timestamp) || now()
  };
  return normalized;
}

function markCloudSynced(state, timestamp = now()) {
  const syncedAt = validTimestamp(timestamp) || now();
  const normalized = normalizeState(state);
  normalized.meta = {
    ...normalized.meta,
    pendingSync: false,
    cloudUpdatedAt: syncedAt,
    lastSyncedAt: syncedAt
  };
  return normalized;
}

function shouldPreferLocal(localState, cloudState, cloudUpdatedAt = "") {
  if (!localState) return false;
  if (!cloudState) return true;
  if (localState.meta?.pendingSync) return true;
  const localTime = timestampMs(localState.meta?.localUpdatedAt);
  const cloudTime = Math.max(
    timestampMs(cloudUpdatedAt),
    timestampMs(cloudState.meta?.cloudUpdatedAt),
    timestampMs(cloudState.meta?.lastSyncedAt)
  );
  return localTime > cloudTime;
}

function normalizeState(parsed) {
  parsed = typeof migrateState === "function" ? migrateState(parsed) : parsed;
  if (!parsed || typeof parsed !== "object") return seed();
  const hasSourceNodes = Array.isArray(parsed.boxNodes) || Array.isArray(parsed.nodes);
  const fallback = hasSourceNodes ? null : seed();
  const ui = { ...defaultUI(), ...(parsed.ui || {}) };
  ui.boxCascadeModes = normalizeModeMap(ui.boxCascadeModes);
  ui.actionCascadeModes = normalizeModeMap(ui.actionCascadeModes);
  const sourceNodes = Array.isArray(parsed.boxNodes) ? parsed.boxNodes : Array.isArray(parsed.nodes) ? parsed.nodes : fallback.boxNodes;
  const boxNodes = sourceNodes.map((n, i) => ({
    id: rememberId(n.id || uid(n.parentId ? "sub" : "box")),
    parentId: n.parentId ?? null,
    level: clampLevel(n.level || (n.parentId ? 2 : 1)),
    title: cleanTitle(n.title || "Untitled"),
    boxNoteTitle: cleanOptionalTitle(n.boxNoteTitle || n.noteTitle || ""),
    boxNoteHtml: sanitizeHtml(n.boxNoteHtml || n.noteHtml || n.contentHtml || ""),
    archivedAt: n.archivedAt || (n.archived ? now() : null),
    doneAt: n.doneAt || (n.done ? now() : null),
    sort: Number.isFinite(+n.sort) ? +n.sort : i + 1,
    createdAt: n.createdAt || now(),
    updatedAt: n.updatedAt || now()
  }));
  const actionDays = Array.isArray(parsed.actionDays) ? parsed.actionDays.map(day => ({
    id: rememberId(day.id || uid("day")),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(day.date || "")) ? day.date : todayYMD(),
    createdAt: day.createdAt || now(),
    updatedAt: day.updatedAt || now(),
    nodes: Array.isArray(day.nodes) ? day.nodes.map((n, i) => ({
      id: rememberId(n.id || uid("actionnode")),
      parentId: n.parentId ?? null,
      level: clampLevel(n.level || (n.parentId ? 2 : 1)),
      title: cleanTitle(n.title || "Untitled"),
      archivedAt: n.archivedAt || null,
      sort: Number.isFinite(+n.sort) ? +n.sort : i + 1,
      sourceBoxNodeId: n.sourceBoxNodeId || n.templateId || n.boxNodeId || null,
      entries: normalizeEntries(n),
      done: Boolean(n.done),
      createdAt: n.createdAt || now(),
      updatedAt: n.updatedAt || now()
    })) : []
  })) : [];
  const notes = Array.isArray(parsed.notes) ? parsed.notes.map(normalizeNote) : [];
  const noteLinks = Array.isArray(parsed.noteLinks) ? parsed.noteLinks.map(normalizeNoteLink).filter(link => link.noteId) : [];
  const state = ensureCentralNotes({ version: CURRENT_STATE_VERSION, boxNodes, actionDays, notes, noteLinks, ui });
  const ids = collectStateIds(state.boxNodes, state.actionDays, state.notes, state.noteLinks);
  const normalized = { ...state, version: CURRENT_STATE_VERSION, meta: normalizeMeta(parsed.meta || {}, ids) };
  return typeof repairStateIntegrity === "function" ? repairStateIntegrity(normalized) : normalized;
}

function sanitizedState(state) {
  const normalized = normalizeState(clone(state));
  const clean = {
    version: CURRENT_STATE_VERSION,
    meta: normalizeMeta(normalized.meta || {}, new Set(normalized.meta?.usedIds || [])),
    boxNodes: normalized.boxNodes.map(n => ({ ...n, title: cleanTitle(n.title), boxNoteTitle: cleanOptionalTitle(n.boxNoteTitle || ""), boxNoteHtml: sanitizeHtml(n.boxNoteHtml || "") })),
    actionDays: normalized.actionDays.map(day => ({
      ...day,
      nodes: day.nodes.map(n => ({ ...n, title: cleanTitle(n.title), entries: normalizeEntries(n) }))
    })),
    notes: normalized.notes.map(note => normalizeNote(note)).filter(note => noteHasContent(note) || note.deletedAt),
    noteLinks: normalized.noteLinks.map(normalizeNoteLink).filter(link => link.noteId),
    ui: { ...defaultUI(), ...(normalized.ui || {}) }
  };
  return typeof repairStateIntegrity === "function" ? repairStateIntegrity(clean) : clean;
}

function mergeById(currentItems = [], importedItems = []) {
  const byId = new Map();
  currentItems.forEach(item => { if (item?.id) byId.set(item.id, item); });
  importedItems.forEach(item => { if (item?.id) byId.set(item.id, item); });
  return [...byId.values()];
}

function mergeActionDayNodes(currentNodes = [], importedNodes = []) {
  const keyOf = node => node?.sourceBoxNodeId ? `source:${node.sourceBoxNodeId}` : `id:${node?.id}`;
  const byKey = new Map();
  currentNodes.forEach(node => { if (node?.id) byKey.set(keyOf(node), node); });
  importedNodes.forEach(node => {
    if (!node?.id) return;
    const key = keyOf(node);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, node);
      return;
    }
    byKey.set(key, {
      ...existing,
      ...node,
      entries: mergeById(normalizeEntries(existing), normalizeEntries(node))
    });
  });
  return [...byKey.values()];
}

function mergeActionDays(currentDays = [], importedDays = []) {
  const byDate = new Map();
  currentDays.forEach(day => { if (day?.date) byDate.set(day.date, day); });
  importedDays.forEach(day => {
    if (!day?.date) return;
    const existing = byDate.get(day.date);
    if (!existing) {
      byDate.set(day.date, day);
      return;
    }
    byDate.set(day.date, {
      ...existing,
      ...day,
      nodes: mergeActionDayNodes(existing.nodes || [], day.nodes || [])
    });
  });
  return [...byDate.values()];
}

function mergeImportedState(current, imported) {
  const base = normalizeState(current);
  const incoming = normalizeState(imported);
  return normalizeState({
    ...base,
    boxNodes: mergeById(base.boxNodes, incoming.boxNodes),
    actionDays: mergeActionDays(base.actionDays, incoming.actionDays),
    notes: mergeById(base.notes, incoming.notes),
    noteLinks: mergeById(base.noteLinks, incoming.noteLinks),
    ui: base.ui,
    meta: base.meta
  });
}
