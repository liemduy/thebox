const { useEffect, useMemo, useRef, useState } = React;

const SUPABASE_URL = "https://mmtvezpwflqbpkilkooy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bvZguwM4vs7ZNPr9XRCcxw_gMm1DZpU";
const STORAGE_KEY = "idea-box-html-v13-action-notes";
const STATE_TABLE = "idea_box_states";
const LEGACY_KEYS = [
  "idea-box-html-v12-stable-ids",
  "idea-box-html-v10-action-days-db",
  "idea-box-html-v9-supabase",
  "idea-box-html-v8-supabase",
  "idea-box-html-v7-supabase",
  "idea-box-html-v6-actions",
  "idea-box-html-v4-clean-box",
  "idea-box-html-v3-inline-delete",
  "idea-box-html-v2-inline-format"
];

const sb = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

const CLOUD_READ_TIMEOUT_MS = 9000;
const CLOUD_WRITE_TIMEOUT_MS = 12000;

function withTimeout(promise, ms, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timerId));
}

const iconPaths = {
  MoreHorizontal: (<><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>),
  GripVertical: (<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>),
  ChevronRight: (<path d="m9 18 6-6-6-6"/>),
  ChevronDown: (<path d="m6 9 6 6 6-6"/>),
  ChevronLeft: (<path d="m15 18-6-6 6-6"/>),
  Plus: (<path d="M5 12h14M12 5v14"/>),
  Check: (<path d="M20 6 9 17l-5-5"/>),
  Search: (<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>),
  Undo2: (<><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>),
  Redo2: (<><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></>),
  PlusSquare: (<><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8M12 8v8"/></>),
  FileText: (<><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></>),
  Archive: (<><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/></>),
  CheckCircle: (<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></>),
  Trash2: (<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></>),
  X: (<path d="M18 6 6 18M6 6l12 12"/>),
  CalendarDays: (<><path d="M8 2v4M16 2v4M3 10h18"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></>),
  ClipboardList: (<><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/></>),
  Bold: (<><path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/></>),
  Italic: (<><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></>),
  Underline: (<><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="22" y2="22"/></>),
  Indent: (<><path d="M21 6H11M21 12H11M21 18H11M7 8l-4 4 4 4"/></>),
  List: (<><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></>),
  Download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></>),
  Upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></>),
  LogOut: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></>)
};

function makeIcon(name) {
  return function Icon({ size = 24, strokeWidth = 2, className = "", ...props }) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        {iconPaths[name]}
      </svg>
    );
  };
}

const MoreHorizontal = makeIcon("MoreHorizontal");
const GripVertical = makeIcon("GripVertical");
const ChevronRight = makeIcon("ChevronRight");
const ChevronDown = makeIcon("ChevronDown");
const ChevronLeft = makeIcon("ChevronLeft");
const Plus = makeIcon("Plus");
const Check = makeIcon("Check");
const Search = makeIcon("Search");
const Undo2 = makeIcon("Undo2");
const Redo2 = makeIcon("Redo2");
const PlusSquare = makeIcon("PlusSquare");
const FileText = makeIcon("FileText");
const Archive = makeIcon("Archive");
const CheckCircle = makeIcon("CheckCircle");
const Trash2 = makeIcon("Trash2");
const X = makeIcon("X");
const CalendarDays = makeIcon("CalendarDays");
const ClipboardList = makeIcon("ClipboardList");
const Bold = makeIcon("Bold");
const Italic = makeIcon("Italic");
const Underline = makeIcon("Underline");
const Indent = makeIcon("Indent");
const List = makeIcon("List");
const Download = makeIcon("Download");
const Upload = makeIcon("Upload");
const LogOut = makeIcon("LogOut");

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

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysYMD(ymd, offset) {
  const [y, m, d] = String(ymd || todayYMD()).split("-").map(Number);
  const date = new Date(Number.isFinite(y) ? y : new Date().getFullYear(), Number.isFinite(m) ? m - 1 : new Date().getMonth(), Number.isFinite(d) ? d : new Date().getDate());
  date.setDate(date.getDate() + Number(offset || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(ymd, long = false) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return String(ymd || "");
  const date = new Date(y, m - 1, d);
  if (long) return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const label = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  return ymd === todayYMD() ? `${label} (today)` : label;
}

function daysFromToday(ymd) {
  return Math.round((new Date(todayYMD() + "T00:00:00") - new Date(String(ymd) + "T00:00:00")) / 86400000);
}

function sanitizeHtml(input) {
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "BR", "DIV", "P", "UL", "OL", "LI", "H2", "H3", "BLOCKQUOTE"]);
  const template = document.createElement("template");
  template.innerHTML = String(input || "");
  function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ""));
          return;
        }
        [...child.attributes].forEach(attr => child.removeAttribute(attr.name));
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
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function defaultUI() {
  return {
    boxView: "active",
    boxFilter: "today",
    boxFilterFrom: "",
    boxFilterTo: "",
    showBoxDays: true,
    selectedActionDate: todayYMD(),
    actionFilter: "all",
    collapsedBoxNodes: [],
    expandedBoxNodes: [],
    expandedBoxActionDays: [],
    collapsedActionNodes: []
  };
}

const BOX_VIEW_VALUES = new Set(["active", "archived", "done"]);
const BOX_FILTER_VALUES = new Set(["today", "7", "15", "30", "all", "custom"]);
const ACTION_FILTER_VALUES = new Set(["all", "undone", "done", "notes"]);

function validYMD(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}
function boolParam(value, fallback = true) {
  if (value === "0" || value === "false" || value === "no") return false;
  if (value === "1" || value === "true" || value === "yes") return true;
  return fallback;
}
function parseBoxRouteParams(params) {
  const ui = {};
  const view = params.get("view");
  const range = params.get("range");
  if (BOX_VIEW_VALUES.has(view)) ui.boxView = view;
  if (BOX_FILTER_VALUES.has(range)) ui.boxFilter = range;
  if (params.has("showDays")) ui.showBoxDays = boolParam(params.get("showDays"), true);
  const from = params.get("from");
  const to = params.get("to");
  if (validYMD(from)) ui.boxFilterFrom = from;
  if (validYMD(to)) ui.boxFilterTo = to;
  return ui;
}
function parseActionRouteParams(params) {
  const ui = {};
  const date = params.get("date");
  const filter = params.get("filter");
  if (validYMD(date)) ui.selectedActionDate = date;
  if (ACTION_FILTER_VALUES.has(filter)) ui.actionFilter = filter;
  return ui;
}
function parseRouteHash(hash = window.location.hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const [pathRaw, queryRaw = ""] = raw.split("?");
  const path = pathRaw || "/boxes";
  const params = new URLSearchParams(queryRaw);
  const parts = path.split("/").filter(Boolean);
  const name = parts[0] || "boxes";
  if (name === "actions") return { name: "actions", ui: parseActionRouteParams(params) };
  if (name === "search") {
    const tab = params.get("tab") === "actions" ? "actions" : "boxes";
    return {
      name: "search",
      tab,
      query: params.get("q") || "",
      ui: tab === "actions" ? parseActionRouteParams(params) : parseBoxRouteParams(params)
    };
  }
  return { name: "boxes", ui: parseBoxRouteParams(params) };
}
function applyRouteToState(state, route) {
  const ui = route?.ui || {};
  Object.assign(state.ui, ui);
  if (route?.name === "actions" || route?.tab === "actions") syncSelectedActionDayWithBox(state);
  return state;
}
function routeView(route) {
  if (route?.name === "actions") return "actions";
  if (route?.name === "search") return route.tab === "actions" ? "actions" : "boxes";
  return "boxes";
}
function appendBoxRouteParams(params, ui) {
  params.set("view", BOX_VIEW_VALUES.has(ui.boxView) ? ui.boxView : "active");
  params.set("range", BOX_FILTER_VALUES.has(ui.boxFilter) ? ui.boxFilter : "today");
  params.set("showDays", ui.showBoxDays === false ? "0" : "1");
  if (ui.boxFilter === "custom") {
    if (validYMD(ui.boxFilterFrom)) params.set("from", ui.boxFilterFrom);
    if (validYMD(ui.boxFilterTo)) params.set("to", ui.boxFilterTo);
  }
}
function appendActionRouteParams(params, ui) {
  params.set("date", validYMD(ui.selectedActionDate) ? ui.selectedActionDate : todayYMD());
  params.set("filter", ACTION_FILTER_VALUES.has(ui.actionFilter) ? ui.actionFilter : "all");
}
function buildAppHash({ currentView, ui, isSearchOpen, searchQuery }) {
  const params = new URLSearchParams();
  if (isSearchOpen) {
    params.set("tab", currentView === "actions" ? "actions" : "boxes");
    if (String(searchQuery || "").trim()) params.set("q", String(searchQuery || "").trim());
    if (currentView === "actions") appendActionRouteParams(params, ui);
    else appendBoxRouteParams(params, ui);
    return `#/search?${params.toString()}`;
  }
  if (currentView === "actions") {
    appendActionRouteParams(params, ui);
    return `#/actions?${params.toString()}`;
  }
  appendBoxRouteParams(params, ui);
  return `#/boxes?${params.toString()}`;
}

function seed() {
  const t = now();
  const content = uid("box");
  const sales = uid("box");
  const tiktok = uid("sub");
  const blog = uid("sub");
  const follow = uid("sub");
  return {
    version: 4,
    meta: { usedIds: [content, sales, tiktok, blog, follow] },
    boxNodes: [
      { id: content, parentId: null, level: 1, title: "Content", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: sales, parentId: null, level: 1, title: "Sales", sort: 2, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: tiktok, parentId: content, level: 2, title: "TikTok", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: blog, parentId: content, level: 2, title: "Blog", sort: 2, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: follow, parentId: sales, level: 2, title: "Follow up", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t }
    ],
    actionDays: [],
    ui: defaultUI()
  };
}

function normalizeEntry(entry, index = 0) {
  const t = now();
  if (entry?.type === "note") {
    return {
      id: rememberId(entry.id || uid("entry")),
      type: "note",
      title: cleanTitle(entry.title || entry.text || "Note"),
      bodyHtml: sanitizeHtml(entry.bodyHtml || entry.contentHtml || entry.body || ""),
      sort: Number.isFinite(+entry.sort) ? +entry.sort : index + 1,
      createdAt: entry.createdAt || t,
      updatedAt: entry.updatedAt || t
    };
  }
  return {
    id: rememberId(entry?.id || uid("entry")),
    type: "action",
    text: cleanTitle(entry?.text || entry?.title || "Action"),
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

function collectStateIds(boxNodes, actionDays) {
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
  if (!parsed || typeof parsed !== "object") return seed();
  const hasSourceNodes = Array.isArray(parsed.boxNodes) || Array.isArray(parsed.nodes);
  const fallback = hasSourceNodes ? null : seed();
  const ui = { ...defaultUI(), ...(parsed.ui || {}) };
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
  const ids = collectStateIds(boxNodes, actionDays);
  return { version: 4, meta: normalizeMeta(parsed.meta || {}, ids), boxNodes, actionDays, ui };
}

function sanitizedState(state) {
  const normalized = normalizeState(clone(state));
  return {
    version: 4,
    meta: normalizeMeta(normalized.meta || {}, new Set(normalized.meta?.usedIds || [])),
    boxNodes: normalized.boxNodes.map(n => ({ ...n, title: cleanTitle(n.title), boxNoteTitle: cleanOptionalTitle(n.boxNoteTitle || ""), boxNoteHtml: sanitizeHtml(n.boxNoteHtml || "") })),
    actionDays: normalized.actionDays.map(day => ({
      ...day,
      nodes: day.nodes.map(n => ({ ...n, title: cleanTitle(n.title), entries: normalizeEntries(n) }))
    })),
    ui: { ...defaultUI(), ...(normalized.ui || {}) }
  };
}

function localKey(userId) { return userId ? `${STORAGE_KEY}:${userId}` : `${STORAGE_KEY}:guest`; }
function loadLocalForUser(userId) {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch { return null; }
}
function loadLegacyLocal() {
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch {}
  }
  return null;
}
function saveLocal(state, userId) {
  try { localStorage.setItem(localKey(userId), JSON.stringify(sanitizedState(state))); } catch {}
}

function childrenOf(parentId, nodes) {
  return (nodes || []).filter(n => (n.parentId ?? null) === (parentId ?? null)).sort((a, b) => (a.sort || 0) - (b.sort || 0));
}
function getNode(nodes, id) { return (nodes || []).find(n => n.id === id); }
function ancestorsOf(id, nodes) {
  const out = [];
  let cur = getNode(nodes, id);
  while (cur?.parentId) {
    cur = getNode(nodes, cur.parentId);
    if (cur) out.unshift(cur);
  }
  return out;
}
function descendantsOf(id, nodes) {
  const out = [];
  function walk(nodeId) { childrenOf(nodeId, nodes).forEach(child => { out.push(child); walk(child.id); }); }
  walk(id);
  return out;
}
function rootOf(node, nodes) {
  let cur = node;
  while (cur?.parentId) cur = getNode(nodes, cur.parentId);
  return cur;
}
function pathOf(node, nodes) { return [...ancestorsOf(node.id, nodes), node].map(n => n.title).join(" > "); }
function boxIsArchived(node) { return Boolean(node?.archivedAt); }
function boxIsDone(node) { return Boolean(node?.doneAt); }
function boxIsInactive(node) { return boxIsArchived(node) || (Number(node?.level || 1) === 1 && boxIsDone(node)); }
function entriesFor(node, type = null) {
  const entries = Array.isArray(node?.entries) ? node.entries.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)) : [];
  return type ? entries.filter(e => e.type === type) : entries;
}
function actionEntriesFor(node) { return entriesFor(node, "action"); }
function noteEntriesFor(node) { return entriesFor(node, "note"); }
function noteTitle(entry) { return cleanTitle(entry?.title || "Note"); }
function entryText(entry) { return entry?.type === "note" ? `${noteTitle(entry)} ${htmlToText(entry.bodyHtml || "")}` : (entry?.text || ""); }
function boxHasNote(node) { return Boolean(cleanOptionalTitle(node?.boxNoteTitle || "") || htmlToText(node?.boxNoteHtml || "")); }
function boxNoteLabel(node) { return cleanOptionalTitle(node?.boxNoteTitle || "") || "Note"; }
function progressForNodes(nodes) {
  const actions = (nodes || []).flatMap(n => actionEntriesFor(n));
  return { total: actions.length, done: actions.filter(e => e.done).length };
}

function boxRoots(state) {
  return childrenOf(null, state.boxNodes).filter(root => !boxIsArchived(root) && !boxIsDone(root));
}
function vaultRoots(state, view) {
  const roots = childrenOf(null, state.boxNodes);
  if (view === "archived") return roots.filter(boxIsArchived);
  if (view === "done") return roots.filter(boxIsDone);
  return roots.filter(root => !boxIsArchived(root) && !boxIsDone(root));
}
function shouldShowChildInView(node, view) {
  if (view === "active") return !boxIsArchived(node);
  return true;
}
function isBoxOpen(state, node) {
  if (Number(node.level || 1) === 1) return !(state.ui.collapsedBoxNodes || []).includes(node.id);
  return (state.ui.expandedBoxNodes || []).includes(node.id);
}
function toggleId(list, id) {
  const set = new Set(list || []);
  set.has(id) ? set.delete(id) : set.add(id);
  return [...set];
}
function floatingMenuMeta(trigger, estimatedHeight = 220) {
  const rect = trigger?.getBoundingClientRect?.();
  if (!rect) return { direction: "down", maxHeight: estimatedHeight };
  const bottomSpace = window.innerHeight - rect.bottom;
  const topSpace = rect.top;
  const direction = bottomSpace < estimatedHeight && topSpace > bottomSpace ? "up" : "down";
  const available = direction === "up" ? topSpace - 16 : bottomSpace - 16;
  return { direction, maxHeight: Math.max(112, Math.min(estimatedHeight, available)) };
}
function floatingMenuPositionClass(meta) {
  return meta?.direction === "up"
    ? "bottom-full mb-1.5 origin-bottom-right"
    : "top-full mt-1.5 origin-top-right";
}

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
  boxRoots(state).forEach(root => cloneBox(root, null));
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

function visibleEntriesFor(node, filter) {
  const entries = entriesFor(node);
  if (filter === "undone") return entries.filter(e => e.type === "action" && !e.done);
  if (filter === "done") return entries.filter(e => e.type === "action" && e.done);
  if (filter === "notes") return entries.filter(e => e.type === "note");
  return entries;
}
function hasVisibleAction(node, nodes, filter) {
  const self = filter === "all" ? true : visibleEntriesFor(node, filter).length > 0;
  return self || childrenOf(node.id, nodes).some(child => hasVisibleAction(child, nodes, filter));
}

function dateInBoxFilter(date, ui) {
  const f = ui.boxFilter || "today";
  if (f === "all") return true;
  if (f === "custom") {
    const from = ui.boxFilterFrom || "0000-01-01";
    const to = ui.boxFilterTo || "9999-12-31";
    return date >= from && date <= to;
  }
  const diff = daysFromToday(date);
  if (f === "today") return diff === 0;
  const days = Number(f);
  return Number.isFinite(days) ? diff >= 0 && diff <= days : true;
}

function rootHasEntriesOnDay(state, rootBox, day) {
  const ids = new Set([rootBox.id, ...descendantsOf(rootBox.id, state.boxNodes).map(n => n.id)]);
  return (day.nodes || []).some(actionNode => ids.has(actionNode.sourceBoxNodeId) && entriesFor(actionNode).length);
}

function summariesForRoot(state, rootBox) {
  return (state.actionDays || [])
    .filter(day => dateInBoxFilter(day.date, state.ui) && rootHasEntriesOnDay(state, rootBox, day))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map(day => ({ day, progress: progressForNodes(day.nodes.filter(n => rootOf(getNode(state.boxNodes, n.sourceBoxNodeId) || {}, state.boxNodes)?.id === rootBox.id)) }));
}

function actionTimelineForBox(state, boxNode) {
  return (state.actionDays || [])
    .filter(day => dateInBoxFilter(day.date, state.ui))
    .map(day => {
      const items = [];
      (day.nodes || []).forEach(actionNode => {
        if (actionNode.sourceBoxNodeId !== boxNode.id) return;
        entriesFor(actionNode).forEach(entry => {
          items.push({
            entry,
            actionNode
          });
        });
      });
      return items.length ? { day, items } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const distance = Math.abs(daysFromToday(b.day.date)) - Math.abs(daysFromToday(a.day.date));
      return distance || a.day.date.localeCompare(b.day.date);
    })
    .slice(0, 8);
}

function collectSearchResults(state, query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];
  const out = [];
  state.boxNodes.forEach(node => {
    const note = `${node.boxNoteTitle || ""} ${htmlToText(node.boxNoteHtml || "")}`.trim();
    if (node.title.toLowerCase().includes(term) || note.toLowerCase().includes(term)) {
      out.push({ id: `box:${node.id}`, kind: "box", title: pathOf(node, state.boxNodes), text: note, boxId: node.id });
    }
  });
  state.actionDays.forEach(day => {
    day.nodes.forEach(node => {
      entriesFor(node).forEach(entry => {
        const text = entryText(entry);
        if (node.title.toLowerCase().includes(term) || text.toLowerCase().includes(term)) {
          out.push({ id: `entry:${day.id}:${node.id}:${entry.id}`, kind: entry.type === "note" ? "note" : "action", meta: displayDate(day.date), title: pathOf(node, day.nodes), text, dayId: day.id, date: day.date, actionNodeId: node.id, entryId: entry.id });
        }
      });
    });
  });
  return out.slice(0, 40);
}

function MenuItem({ icon, label, danger = false, accent = false, divider = false, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2.5 px-3 py-2.5 text-[14px] text-left transition-colors w-full ${divider ? "border-b border-[#3E3E3E]" : ""} ${danger ? "text-red-400 hover:bg-[#3E3E3E] hover:text-red-300 font-medium" : accent ? "text-[#FFD2D7] hover:bg-[#3E3E3E] font-bold" : "text-white hover:bg-[#3E3E3E]"}`}>
      <span className={danger || accent ? "" : "text-[#A7A7A7]"}>{icon}</span>
      {label}
    </button>
  );
}

function Header({ syncStatus, syncLabel, isSearchOpen, setIsSearchOpen, isHeaderMenuOpen, setIsHeaderMenuOpen, onSyncNow, onExport, onImportClick, onSignOut, fileInputRef, onImportFile }) {
  const syncText = syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Local" : syncStatus === "error" ? "Error" : "Saved";
  const syncColor = syncStatus === "saved"
    ? "#FFD2D7"
    : syncStatus === "error"
      ? "#fb7185"
      : syncStatus === "saving"
        ? "#FFD2D7"
        : "#666666";
  return (
    <header className="app-header flex justify-between items-center p-5 border-b border-[#333333] bg-[#0a0a0a] relative z-40">
      <div className="flex items-center gap-3">
        <div className="relative w-[40px] h-[40px] flex items-center justify-center bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]">
          <span className="font-black text-[20px] text-[#111] tracking-tighter">LP</span>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-black rounded-full border-2 border-[#FFD2D7]" />
        </div>
        <h1 className="font-extrabold text-[20px] tracking-tight text-white flex items-baseline gap-1.5">
          Liem's <span className="text-[#FFD2D7] font-medium text-[17px] italic font-serif">Planner</span>
        </h1>
      </div>
      <div className="flex gap-4 text-[#A7A7A7] items-center">
        <button type="button" onClick={(e) => { e.stopPropagation(); onSyncNow(); }} title={syncLabel || syncText} aria-label={syncLabel || syncText} className="transition-transform hover:scale-110 active:scale-95" style={{ color: syncColor }}>
          {syncStatus === "saving" ? <MoreHorizontal size={20} className="animate-pulse" /> : <Check size={20} />}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setIsSearchOpen(!isSearchOpen); }} className={`transition-colors outline-none ${isSearchOpen ? "text-[#FFD2D7]" : "hover:text-white"}`} aria-label="Search">
          <Search size={20} />
        </button>
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); setIsHeaderMenuOpen(!isHeaderMenuOpen); }} className={`p-1.5 rounded-full transition-colors ${isHeaderMenuOpen ? "bg-[#222] text-white" : "hover:text-white"}`} aria-label="Tools">
            <MoreHorizontal size={20} />
          </button>
          {isHeaderMenuOpen && (
            <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-48 bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#333333] p-1.5 animate-in fade-in zoom-in-95 duration-100 z-50">
              <button type="button" onClick={onExport} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><Download size={16} /> Export JSON</button>
              <button type="button" onClick={onImportClick} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><Upload size={16} /> Import JSON</button>
              <div className="h-px bg-[#333] my-1" />
              <button type="button" onClick={onSignOut} className="flex items-center gap-3 w-full px-3 py-2.5 text-red-400 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><LogOut size={16} /> Log out</button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} onChange={onImportFile} className="hidden" type="file" accept="application/json" />
      </div>
    </header>
  );
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({ text, query, className = "" }) {
  const source = String(text || "");
  const term = String(query || "").trim();
  if (!term) return <span className={className}>{source}</span>;
  const parts = source.split(new RegExp(`(${escapeRegExp(term)})`, "ig"));
  return (
    <span className={className}>
      {parts.map((part, index) => part.toLowerCase() === term.toLowerCase()
        ? <mark key={index} className="search-hit bg-transparent">{part}</mark>
        : <React.Fragment key={index}>{part}</React.Fragment>
      )}
    </span>
  );
}

function SearchPanel({ isOpen, query, setQuery, results, onOpenResult }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className={`bg-[#111111] border-b border-[#333333] overflow-hidden transition-all duration-300 ease-in-out z-30 relative ${isOpen ? "max-h-72 opacity-100 py-3 px-5" : "max-h-0 opacity-0 py-0 px-5 border-transparent"}`}>
      <div className="flex items-center bg-[#0a0a0a] rounded-full px-3 py-1.5 border border-[#333333] focus-within:border-[#FFD2D7] transition-colors">
        <Search size={16} className="text-[#A7A7A7] mr-2" />
        <input type="text" placeholder="Search boxes, actions, notes..." value={query} onChange={(e) => setQuery(e.target.value)} className="bg-transparent border-none outline-none text-white text-[14px] w-full placeholder:text-[#666666]" />
      </div>
      {query.trim() && (
        <div className="mt-3 max-h-44 overflow-auto thin-scroll flex flex-col gap-1">
          {results.length ? results.map(result => (
            <button key={result.id} type="button" onClick={() => onOpenResult(result)} className="text-left px-3 py-2 rounded-xl hover:bg-[#1A1A1A] transition-colors">
              <span className="text-[11px] uppercase tracking-wider text-[#FFD2D7] font-extrabold">{result.kind}{result.meta ? <span className="text-[#777] normal-case tracking-normal font-bold"> - {result.meta}</span> : null}</span>
              <strong className="block text-[14px] text-white truncate"><HighlightText text={result.title} query={query} /></strong>
              {result.text ? <em className="block text-[12px] text-[#A7A7A7] not-italic truncate"><HighlightText text={result.text} query={query} /></em> : null}
            </button>
          )) : <div className="text-[#A7A7A7] text-[13px] px-3 py-2">No results.</div>}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ node }) {
  if (boxIsArchived(node)) return <span className="ml-2 text-[10px] uppercase tracking-wider bg-[#2D2D2D] text-[#A7A7A7] px-1.5 py-[2px] rounded">archived</span>;
  if (boxIsDone(node)) return <span className="ml-2 text-[10px] uppercase tracking-wider bg-[#FFD2D7] text-black px-1.5 py-[2px] rounded">done</span>;
  return null;
}

function BoxActionTimeline({ boxId, groups, isRoot, expandedKeys, onToggleDay, onOpenActionDate }) {
  if (!groups.length) return null;
  return (
    <div className={`flex flex-col gap-2 pb-2 pr-4 ${isRoot ? "ml-[42px]" : "ml-[36px]"}`}>
      {groups.map(({ day, items }) => {
        const actions = items.filter(item => item.entry.type === "action");
        const done = actions.filter(item => item.entry.done).length;
        const key = `${boxId}:${day.date}`;
        const expanded = (expandedKeys || []).includes(key);
        return (
          <div key={day.id} className="rounded-[12px] bg-[#101010] border border-white/[0.04] overflow-hidden">
            <button type="button" onClick={() => onToggleDay(boxId, day.date)} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#171717] transition-colors">
              <span className="flex items-center gap-1.5 min-w-0">
                {expanded ? <ChevronDown size={14} className="text-[#A7A7A7] shrink-0" /> : <ChevronRight size={14} className="text-[#A7A7A7] shrink-0" />}
                <span className="text-[12px] font-extrabold text-[#FFD2D7] truncate">{displayDate(day.date)}</span>
              </span>
              {actions.length ? <span className="text-[11px] text-[#A7A7A7] font-bold shrink-0">{done}/{actions.length}</span> : <span className="text-[11px] text-[#A7A7A7] font-bold shrink-0">{items.length} note</span>}
            </button>
            {expanded && <div className="px-2 pb-2 flex flex-col gap-1">
              {items.map(({ entry, actionNode, sourceTitle }) => (
                <button key={`${actionNode.id}:${entry.id}`} type="button" onClick={() => onOpenActionDate(day.date, actionNode.id, entry.id)} className="group flex items-start gap-2 rounded-[9px] px-2 py-1.5 text-left hover:bg-[#1A1A1A] transition-colors">
                  {entry.type === "note" ? (
                    <span className="mt-[2px] px-1.5 py-[2px] bg-[#FFD2D7] text-black text-[9px] font-extrabold tracking-wider uppercase rounded-[4px] shrink-0">Note</span>
                  ) : (
                    <span className={`mt-[3px] w-[15px] h-[15px] rounded-[4px] border-[1.5px] grid place-items-center shrink-0 ${entry.done ? "bg-[#FFD2D7] border-[#FFD2D7] text-black" : "border-[#555] text-transparent"}`}>
                      <Check size={10} strokeWidth={3.5} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] leading-snug truncate ${entry.type === "action" && entry.done ? "text-[#666] line-through" : "text-[#CCCCCC] group-hover:text-white"}`}>
                      {entry.type === "note" ? noteTitle(entry) : entry.text}
                    </span>
                  </span>
                </button>
              ))}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

function BoxTreeItem({ state, node, level, view, menuOpenId, setMenuOpenId, menuPlacements, openNodeMenu, handlers, dragState, setDragState, flashTarget }) {
  const children = childrenOf(node.id, state.boxNodes).filter(child => shouldShowChildInView(child, view));
  const open = isBoxOpen(state, node);
  const isRoot = level === 0;
  const inactive = boxIsInactive(node) || boxIsArchived(node);
  const showBoxDays = state.ui.showBoxDays !== false;
  const timeline = showBoxDays ? actionTimelineForBox(state, node) : [];
  const hasNote = boxHasNote(node);
  const hasBody = children.length > 0 || timeline.length > 0;
  const menuId = `box:${node.id}`;
  const menuOpen = menuOpenId === menuId;
  const menuMeta = menuPlacements?.[menuId] || { direction: "down", maxHeight: inactive ? 72 : 248 };
  const dragging = dragState?.id === node.id;
  const dropTarget = dragState?.overId === node.id;
  const pointerDragRef = useRef(null);

  function setDragOver(targetId) {
    if (!targetId || targetId === node.id) {
      pointerDragRef.current = pointerDragRef.current ? { ...pointerDragRef.current, overId: null } : null;
      setDragState(prev => prev?.id === node.id ? { ...prev, overId: null } : prev);
      return;
    }
    const target = getNode(state.boxNodes, targetId);
    if (!target || (target.parentId ?? null) !== (node.parentId ?? null)) return;
    pointerDragRef.current = pointerDragRef.current ? { ...pointerDragRef.current, overId: targetId } : null;
    setDragState(prev => prev?.id === node.id ? { ...prev, overId: targetId } : prev);
  }

  function sameLevelDropIdFromPoint(x, y) {
    let boxEl = document.elementFromPoint(x, y)?.closest?.("[data-box-node-id]");
    while (boxEl) {
      const targetId = boxEl.getAttribute("data-box-node-id");
      const target = getNode(state.boxNodes, targetId);
      if (target && targetId !== node.id && (target.parentId ?? null) === (node.parentId ?? null)) return targetId;
      boxEl = boxEl.parentElement?.closest?.("[data-box-node-id]");
    }
    return null;
  }

  function onTouchDragStart(e) {
    if (inactive || e.pointerType === "mouse" || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { id: node.id, parentId: node.parentId ?? null, overId: null, pointerId: e.pointerId };
    pointerDragRef.current = start;
    document.body.classList.add("touch-dragging");
    setMenuOpenId(null);
    setDragState(start);

    const move = (event) => {
      if (!pointerDragRef.current || event.pointerId !== pointerDragRef.current.pointerId) return;
      event.preventDefault();
      setDragOver(sameLevelDropIdFromPoint(event.clientX, event.clientY));
    };
    const finish = (event) => {
      if (!pointerDragRef.current || event.pointerId !== pointerDragRef.current.pointerId) return;
      event.preventDefault();
      const overId = pointerDragRef.current.overId;
      pointerDragRef.current = null;
      document.body.classList.remove("touch-dragging");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      if (overId && overId !== node.id) handlers.reorderBox(node.id, overId);
      setDragState(null);
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish, { passive: false });
    document.addEventListener("pointercancel", finish, { passive: false });
  }

  function onDrop(e) {
    e.preventDefault();
    if (!dragState || dragState.id === node.id || dragState.parentId !== (node.parentId ?? null)) return;
    handlers.reorderBox(dragState.id, node.id);
    setDragState(null);
  }

  return (
    <div
      data-box-node-id={node.id}
      className={`flex flex-col w-full ${flashTarget?.type === "box" && flashTarget.id === node.id ? "flash-target" : ""} ${menuOpen ? "relative z-50" : ""} ${dragging ? "dragging-row" : ""} ${dropTarget ? "drop-target" : ""}`}
      onDragOver={(e) => {
        if (dragState?.id && dragState.id !== node.id && dragState.parentId === (node.parentId ?? null)) {
          e.preventDefault();
          setDragState(prev => prev?.overId === node.id ? prev : { ...prev, overId: node.id });
        }
      }}
      onDrop={onDrop}
    >
      <div className={`flex items-center px-4 hover:bg-white/[0.04] transition-colors relative ${isRoot ? "py-3.5" : "py-2.5 border-t border-white/[0.05]"}`}>
        <button
          type="button"
          draggable={!inactive}
          onPointerDown={onTouchDragStart}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => { e.stopPropagation(); e.dataTransfer?.setData("text/plain", node.id); setDragState({ id: node.id, parentId: node.parentId ?? null, overId: null }); }}
          onDragEnd={() => setDragState(null)}
          onClick={(e) => e.stopPropagation()}
          className={`drag-handle ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"} mr-3 cursor-grab active:cursor-grabbing hover:text-white shrink-0 h-8 w-5 grid place-items-center`}
          aria-label="Drag"
        >
          <GripVertical size={isRoot ? 20 : 16} />
        </button>

        <div className={`flex-1 min-w-0 pr-2 ${isRoot ? "font-extrabold text-[20.5px] tracking-tight text-[#FFD2D7]" : `font-medium text-[15px] ${boxIsDone(node) ? "text-[#666] line-through" : "text-[#E0E0E0]"}`}`}>
          <div
            contentEditable={!inactive}
            suppressContentEditableWarning
            spellCheck="false"
            data-placeholder={isRoot ? "Box title" : "Sub-box title"}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
            onBlur={(e) => handlers.renameBox(node.id, e.currentTarget.textContent)}
            className="outline-none truncate min-h-[1.25em]"
          >
            {node.title}
          </div>
        </div>
        <StatusBadge node={node} />

        <div className={`flex items-center gap-1 shrink-0 ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"}`}>
          <button type="button" onClick={(e) => { e.stopPropagation(); handlers.toggleBoxOpen(node.id); }} className="h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white hover:bg-[#444444]" aria-label="Collapse or expand">
            {open ? <ChevronDown size={isRoot ? 21 : 18} /> : <ChevronRight size={isRoot ? 21 : 18} />}
          </button>
          <div className="relative">
            <button type="button" onClick={(e) => openNodeMenu(menuId, e, inactive ? 72 : 248)} className={`h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white ${menuOpen ? "bg-[#444444] text-white" : "hover:bg-[#444444]"}`} aria-label="Box menu">
              <MoreHorizontal size={isRoot ? 21 : 18} />
            </button>
            {menuOpen && (
              <div data-floating-menu-id={menuId} data-menu-direction={menuMeta.direction} onClick={e => e.stopPropagation()} style={{ maxHeight: `${menuMeta.maxHeight}px` }} className={`absolute right-0 ${floatingMenuPositionClass(menuMeta)} w-44 bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] z-50 py-1.5 flex flex-col overflow-x-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}>
                {inactive ? (
                  <MenuItem icon={<CheckCircle size={16} />} label="restore" onClick={() => { setMenuOpenId(null); handlers.restoreBox(node.id); }} />
                ) : (
                  <>
                    <MenuItem icon={<PlusSquare size={16} />} label="+ sub" onClick={() => { setMenuOpenId(null); handlers.addSub(node.id); }} />
                    <MenuItem icon={<FileText size={16} />} label={hasNote ? "view notes" : "+ notes"} accent={hasNote} onClick={() => { setMenuOpenId(null); handlers.openBoxNote(node.id); }} />
                    <MenuItem icon={<CheckCircle size={16} />} label="done" onClick={() => { setMenuOpenId(null); handlers.doneBox(node.id); }} />
                    <MenuItem icon={<Archive size={16} />} label="archive" divider onClick={() => { setMenuOpenId(null); handlers.archiveBox(node.id); }} />
                    <MenuItem icon={<Trash2 size={16} />} label="remove" danger onClick={() => { setMenuOpenId(null); handlers.deleteBox(node.id); }} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {hasBody && open && (
        <div className="w-full flex flex-col">
          <BoxActionTimeline boxId={node.id} groups={timeline} isRoot={isRoot} expandedKeys={state.ui.expandedBoxActionDays || []} onToggleDay={handlers.toggleBoxTimelineDay} onOpenActionDate={handlers.openActionDate} />
          {children.length > 0 && (
            <div className="ml-5 border-l-[1.5px] border-white/[0.05] pl-1 my-0.5">
              {children.map(child => (
                <BoxTreeItem key={child.id} state={state} node={child} level={level + 1} view={view} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId} menuPlacements={menuPlacements} openNodeMenu={openNodeMenu} handlers={handlers} dragState={dragState} setDragState={setDragState} flashTarget={flashTarget} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntryRow({ day, node, entry, handlers, flashTarget }) {
  const rowFlash = flashTarget?.type === "entry" && flashTarget.id === entry.id;
  if (entry.type === "note") {
    return (
      <div data-action-entry-id={entry.id} className={`flex items-start py-1.5 px-3 hover:bg-[#1A1A1A] rounded-[10px] transition-colors group ${rowFlash ? "flash-target" : ""}`}>
        <button type="button" onClick={() => handlers.openActionNote(day.id, node.id, entry.id)} className="flex items-start flex-1 min-w-0 text-left">
          <div className="mt-[1px] px-1.5 py-[2px] bg-[#FFD2D7] text-black text-[9px] font-extrabold tracking-wider uppercase rounded-[4px] mr-3 shrink-0">Note</div>
          <span className="text-[14px] font-bold text-[#CCCCCC] group-hover:text-white leading-snug truncate">{noteTitle(entry)}</span>
        </button>
        <button type="button" onClick={() => handlers.deleteEntry(day.id, node.id, entry.id)} className="text-[#666] hover:text-red-300 p-1"><Trash2 size={14} /></button>
      </div>
    );
  }
  return (
    <div data-action-entry-id={entry.id} className={`flex items-start py-1.5 px-3 hover:bg-[#1A1A1A] rounded-[10px] transition-colors group ${rowFlash ? "flash-target" : ""}`}>
      <button type="button" onClick={() => handlers.toggleEntry(day.id, node.id, entry.id)} className={`mt-[2px] w-[16px] h-[16px] rounded-[4.5px] border-[1.5px] flex items-center justify-center mr-3 shrink-0 transition-all duration-200 ${entry.done ? "bg-[#FFD2D7] border-[#FFD2D7] text-black" : "border-[#555555] group-hover:border-[#A7A7A7] text-transparent"}`}>
        <Check size={11} strokeWidth={3.5} className={entry.done ? "opacity-100 scale-100" : "opacity-0 scale-50"} />
      </button>
      <div
        contentEditable
        suppressContentEditableWarning
        spellCheck="true"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        onBlur={(e) => handlers.renameEntry(day.id, node.id, entry.id, e.currentTarget.textContent)}
        className={`flex-1 min-w-0 outline-none text-[14.5px] leading-snug transition-colors ${entry.done ? "text-[#555555] line-through" : "text-[#CCCCCC] group-hover:text-white"}`}
      >
        {entry.text}
      </div>
      <button type="button" onClick={() => handlers.deleteEntry(day.id, node.id, entry.id)} className="text-[#666] hover:text-red-300 p-1 ml-2"><Trash2 size={14} /></button>
    </div>
  );
}

function ActionTreeItem({ state, day, node, level, menuOpenId, setMenuOpenId, menuPlacements, openNodeMenu, handlers, flashTarget }) {
  const filter = state.ui.actionFilter || "all";
  if (!hasVisibleAction(node, day.nodes, filter)) return null;
  const open = !(state.ui.collapsedActionNodes || []).includes(node.id);
  const children = childrenOf(node.id, day.nodes).filter(child => hasVisibleAction(child, day.nodes, filter));
  const entries = visibleEntriesFor(node, filter);
  const sourceBox = getNode(state.boxNodes, node.sourceBoxNodeId);
  const inactive = sourceBox ? boxIsInactive(sourceBox) || boxIsArchived(sourceBox) : false;
  const menuId = `action:${day.id}:${node.id}`;
  const menuOpen = menuOpenId === menuId;
  const menuMeta = menuPlacements?.[menuId] || { direction: "down", maxHeight: 116 };
  const isRoot = level === 0;

  return (
    <div data-action-node-id={node.id} className={`flex flex-col w-full ${flashTarget?.type === "action" && flashTarget.id === node.id ? "flash-target" : ""} ${menuOpen ? "relative z-50" : ""}`}>
      <div className={`flex items-center px-4 hover:bg-white/[0.04] transition-colors relative ${isRoot ? "py-3.5" : "py-2.5 border-t border-white/[0.05]"}`}>
        <div className={`${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"} mr-3 shrink-0 h-8 w-5 grid place-items-center`}>
          <GripVertical size={isRoot ? 20 : 16} />
        </div>
        <div className={`flex-1 min-w-0 pr-2 ${isRoot ? "font-extrabold text-[20.5px] tracking-tight text-[#FFD2D7]" : "font-medium text-[15px] text-[#E0E0E0]"}`}>
          <span className={`block truncate ${inactive ? "text-[#666] line-through" : ""}`}>{node.title}</span>
        </div>
        <StatusBadge node={sourceBox} />
        <div className={`flex items-center gap-1 shrink-0 ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"}`}>
          <button type="button" onClick={(e) => { e.stopPropagation(); handlers.toggleActionOpen(node.id); }} className="h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white hover:bg-[#444444]" aria-label="Collapse or expand">
            {open ? <ChevronDown size={isRoot ? 21 : 18} /> : <ChevronRight size={isRoot ? 21 : 18} />}
          </button>
          <div className="relative">
            <button type="button" onClick={(e) => openNodeMenu(menuId, e, 116)} className={`h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white ${menuOpen ? "bg-[#444444] text-white" : "hover:bg-[#444444]"}`} aria-label="Action menu">
              <MoreHorizontal size={isRoot ? 21 : 18} />
            </button>
            {menuOpen && (
              <div data-floating-menu-id={menuId} data-menu-direction={menuMeta.direction} onClick={e => e.stopPropagation()} style={{ maxHeight: `${menuMeta.maxHeight}px` }} className={`absolute right-0 ${floatingMenuPositionClass(menuMeta)} w-44 bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] z-50 py-1.5 flex flex-col overflow-x-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}>
                <MenuItem icon={<CheckCircle size={16} />} label="+ action" onClick={() => { setMenuOpenId(null); handlers.openActionLines(day.id, node.id); }} />
                <MenuItem icon={<FileText size={16} />} label="+ notes" onClick={() => { setMenuOpenId(null); handlers.openActionNote(day.id, node.id, null); }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="w-full flex flex-col">
          {entries.length > 0 && (
            <div className={`flex flex-col gap-[1px] pt-1 pb-1 pr-4 ${isRoot ? "ml-[42px]" : "ml-[36px]"}`}>
              {entries.map(entry => <EntryRow key={entry.id} day={day} node={node} entry={entry} handlers={handlers} flashTarget={flashTarget} />)}
            </div>
          )}
          {children.length > 0 && (
            <div className={`ml-5 border-l-[1.5px] border-white/[0.05] pl-1 ${entries.length ? "mb-0.5 mt-1" : "my-0.5"}`}>
              {children.map(child => <ActionTreeItem key={child.id} state={state} day={day} node={child} level={level + 1} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId} menuPlacements={menuPlacements} openNodeMenu={openNodeMenu} handlers={handlers} flashTarget={flashTarget} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RichNoteModal({ modal, state, onClose, onSave, onDelete }) {
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const isBoxNote = modal.type === "boxNote";
  const box = isBoxNote ? getNode(state.boxNodes, modal.boxId) : null;
  const day = !isBoxNote ? state.actionDays.find(d => d.id === modal.dayId) : null;
  const actionNode = day ? getNode(day.nodes, modal.nodeId) : null;
  const entry = actionNode && modal.entryId ? entriesFor(actionNode).find(e => e.id === modal.entryId) : null;
  const initialHtml = isBoxNote ? (box?.boxNoteHtml || "") : (entry?.bodyHtml || "");
  const initialTitle = isBoxNote ? (box?.boxNoteTitle || "") : (entry?.title || "");
  const canDelete = Boolean(onDelete && (isBoxNote ? boxHasNote(box) : entry));

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(initialHtml);
    if (titleRef.current) titleRef.current.value = initialTitle;
    setTimeout(() => (titleRef.current || editorRef.current)?.focus(), 40);
  }, [modal]);

  function editorRange() {
    const editor = editorRef.current;
    if (!editor) return null;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return null;
    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? { editor, selection, range } : null;
  }

  function selectInserted(selection, node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function replaceSelectionWith(node) {
    const context = editorRange();
    if (!context) return;
    const { editor, selection, range } = context;
    range.deleteContents();
    range.insertNode(node);
    editor.normalize();
    selectInserted(selection, node);
  }

  function wrapInline(tagName) {
    const context = editorRange();
    if (!context) return;
    const { editor, selection, range } = context;
    const el = document.createElement(tagName);
    if (range.collapsed) {
      el.appendChild(document.createTextNode("text"));
      range.insertNode(el);
    } else {
      try {
        range.surroundContents(el);
      } catch {
        el.appendChild(range.extractContents());
        range.insertNode(el);
      }
    }
    editor.normalize();
    selectInserted(selection, el);
  }

  function wrapBlock(tagName) {
    const context = editorRange();
    if (!context) return;
    const { range } = context;
    const el = document.createElement(tagName);
    if (range.collapsed) el.textContent = tagName === "h3" ? "Heading" : "Quote";
    else el.appendChild(range.extractContents());
    replaceSelectionWith(el);
  }

  function insertList() {
    const context = editorRange();
    if (!context) return;
    const text = context.range.toString().trim();
    const lines = (text ? text.split(/\n+/) : ["List item"]).map(line => cleanTitle(line || "List item"));
    const ul = document.createElement("ul");
    lines.forEach(line => {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    });
    replaceSelectionWith(ul);
  }

  function applyFormat(format) {
    if (format === "bold") return wrapInline("strong");
    if (format === "italic") return wrapInline("em");
    if (format === "underline") return wrapInline("u");
    if (format === "indent") return wrapBlock("blockquote");
    if (format === "list") return insertList();
    if (format === "heading") return wrapBlock("h3");
  }

  function save() {
    const html = sanitizeHtml(editorRef.current?.innerHTML || "");
    if (isBoxNote) onSave({ boxId: modal.boxId, title: titleRef.current?.value || "", bodyHtml: html });
    else onSave({ dayId: modal.dayId, nodeId: modal.nodeId, entryId: modal.entryId || null, title: titleRef.current?.value || "Note", bodyHtml: html });
  }

  function deleteNote() {
    if (!canDelete) return;
    if (!window.confirm("Delete this note?")) return;
    if (isBoxNote) onDelete({ boxId: modal.boxId });
    else onDelete({ dayId: modal.dayId, nodeId: modal.nodeId, entryId: modal.entryId });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-28 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#1A1A1A] border border-[#323232] rounded-[24px] w-full max-w-[340px] p-5 shadow-2xl animate-in zoom-in-95 duration-200 relative z-10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-[18px] text-white">{isBoxNote ? "Box notes" : modal.entryId ? "Edit note" : "Add note"}</h3>
          <div className="flex items-center gap-2">
            {canDelete && (
              <button type="button" onClick={deleteNote} className="text-[#666] hover:text-red-300 transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full" aria-label="Delete note"><Trash2 size={18} /></button>
            )}
            <button type="button" onClick={onClose} className="text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full" aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <input ref={titleRef} type="text" placeholder="Note title" defaultValue={initialTitle} className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white text-[15px] font-bold outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors mb-3" />
        <div ref={editorRef} contentEditable suppressContentEditableWarning spellCheck="true" data-placeholder="Write your note here..." className="rich-editor min-h-[150px] max-h-[260px] overflow-auto thin-scroll w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-[#E0E0E0] text-[14px] leading-relaxed outline-none focus:border-[#FFD2D7] transition-colors mb-5" />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-[#2D2D2D] hover:bg-[#3E3E3E] text-white font-bold py-3.5 rounded-[12px] transition-colors">Cancel</button>
          <button type="button" onClick={save} className="flex-1 bg-[#FFD2D7] hover:scale-[1.02] active:scale-95 text-black font-bold py-3.5 rounded-[12px] transition-transform">Done</button>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()} onMouseDown={e => e.preventDefault()} className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] bg-[#232323] border border-[#3E3E3E] rounded-[14px] px-5 py-3.5 flex items-center justify-between shadow-2xl z-50">
        <div className="flex gap-4 text-[#A7A7A7]">
          <button type="button" onClick={() => applyFormat("bold")} className="hover:text-[#FFD2D7] transition-colors"><Bold size={18} /></button>
          <button type="button" onClick={() => applyFormat("italic")} className="hover:text-[#FFD2D7] transition-colors"><Italic size={18} /></button>
          <button type="button" onClick={() => applyFormat("underline")} className="hover:text-[#FFD2D7] transition-colors"><Underline size={18} /></button>
          <button type="button" onClick={() => applyFormat("indent")} className="hover:text-[#FFD2D7] transition-colors"><Indent size={18} /></button>
          <button type="button" onClick={() => applyFormat("list")} className="hover:text-[#FFD2D7] transition-colors"><List size={18} /></button>
        </div>
        <button type="button" onClick={() => applyFormat("heading")} className="text-[#A7A7A7] hover:text-[#FFD2D7] transition-colors font-serif font-bold text-[16px] leading-none tracking-tight">Aa</button>
      </div>
    </div>
  );
}

function ActionLinesModal({ modal, onClose, onSave }) {
  const textareaRef = useRef(null);
  useEffect(() => { setTimeout(() => textareaRef.current?.focus(), 40); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#1A1A1A] border border-[#323232] rounded-[24px] w-full max-w-[340px] p-5 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-[18px] text-white">Add actions</h3>
          <button type="button" onClick={onClose} className="text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full"><X size={18} /></button>
        </div>
        <textarea ref={textareaRef} placeholder="Type each action on a new line..." rows={8} className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-4 text-[#E0E0E0] text-[14px] leading-relaxed outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors resize-none mb-6" />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-[#2D2D2D] hover:bg-[#3E3E3E] text-white font-bold py-3.5 rounded-[12px] transition-colors">Cancel</button>
          <button type="button" onClick={() => onSave(modal.dayId, modal.nodeId, textareaRef.current?.value || "")} className="flex-1 bg-[#FFD2D7] hover:scale-[1.02] active:scale-95 text-black font-bold py-3.5 rounded-[12px] transition-transform">Done</button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ authView, authBusy, authMessage, onAuth, onSwitchView }) {
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const newPasswordRef = useRef(null);
  const isReset = authView === "updatePassword";
  return (
    <div className="min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12 selection:bg-[#FFD2D7] selection:text-black">
      <div className="w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] overflow-hidden min-h-screen sm:min-h-[850px] relative flex flex-col shadow-2xl">
        <div className="p-5 border-b border-[#333333] flex items-center gap-3">
          <div className="relative w-[40px] h-[40px] flex items-center justify-center bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]">
            <span className="font-black text-[20px] text-[#111] tracking-tighter">LP</span>
          </div>
          <h1 className="font-extrabold text-[20px] tracking-tight">Liem's <span className="text-[#FFD2D7] font-medium text-[17px] italic font-serif">Planner</span></h1>
        </div>
        <main className="p-5 flex-1 flex flex-col justify-center">
          <div className="bg-[#141414] border border-white/[0.05] rounded-[24px] p-5">
            <h2 className="text-[2.4rem] leading-[1.05] font-extrabold tracking-tighter mb-3">{isReset ? "New password" : "Login"}</h2>
            <p className="text-[#A7A7A7] text-[14px] mb-6">{isReset ? "Create a new password for this workspace." : "Use your Supabase account to sync boxes and actions."}</p>
            {isReset ? (
              <form onSubmit={(e) => { e.preventDefault(); onAuth("update-password", { password: newPasswordRef.current?.value || "" }); }} className="flex flex-col gap-3">
                <input ref={newPasswordRef} type="password" placeholder="New password" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]" />
                <button disabled={authBusy} className="bg-[#FFD2D7] text-black font-bold py-3.5 rounded-[12px]">Update password</button>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); onAuth("login", { email: emailRef.current?.value || "", password: passwordRef.current?.value || "" }); }} className="flex flex-col gap-3">
                <input ref={emailRef} type="email" placeholder="Email" autoComplete="email" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]" />
                <input ref={passwordRef} type="password" placeholder="Password" autoComplete="current-password" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]" />
                <button disabled={authBusy} className="bg-[#FFD2D7] text-black font-bold py-3.5 rounded-[12px]">Login</button>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" disabled={authBusy} onClick={() => onAuth("signup", { email: emailRef.current?.value || "", password: passwordRef.current?.value || "" })} className="bg-[#2D2D2D] text-white font-bold py-3 rounded-[12px]">Sign up</button>
                  <button type="button" disabled={authBusy} onClick={() => onAuth("forgot", { email: emailRef.current?.value || "" })} className="bg-[#2D2D2D] text-white font-bold py-3 rounded-[12px]">Forgot</button>
                </div>
              </form>
            )}
            {authMessage ? <div className="mt-4 text-[13px] text-[#FFD2D7]">{authMessage}</div> : null}
            {!sb && <div className="mt-4 text-[12px] text-[#A7A7A7]">Supabase script is not loaded. The app can still run locally in this browser.</div>}
          </div>
        </main>
      </div>
    </div>
  );
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
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPlacements, setMenuPlacements] = useState({});
  const [isActiveMenuOpen, setIsActiveMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [flashTarget, setFlashTarget] = useState(null);
  const [syncStatus, setSyncStatus] = useState(navigator.onLine ? "saved" : "offline");
  const [syncLabel, setSyncLabel] = useState(navigator.onLine ? "Saved" : "Offline");
  const [historyTick, setHistoryTick] = useState(0);
  const [dragState, setDragState] = useState(null);
  const fileInputRef = useRef(null);
  const dateInputRef = useRef(null);
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
  const searchResults = useMemo(() => collectSearchResults(db, searchQuery), [db, searchQuery]);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }

  function closeFloating() {
    setIsHeaderMenuOpen(false);
    setActiveMenu(null);
    setMenuPlacements({});
    setIsActiveMenuOpen(false);
    setIsDateMenuOpen(false);
    setIsActionsMenuOpen(false);
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
          next = shouldPreferLocal(localState, cloudState, cloudUpdatedAt)
            ? markPendingSync(localState, localState?.meta?.localUpdatedAt || now())
            : cloudState;
        } else if (localState && userId !== "local") {
          next = markPendingSync(localState, localState.meta?.localUpdatedAt || now());
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
    db.ui.actionFilter
  ]);

  useEffect(() => {
    if (!flashTarget) return;
    const safeId = window.CSS?.escape ? window.CSS.escape(flashTarget.id) : String(flashTarget.id).replace(/"/g, '\\"');
    const selector = flashTarget.type === "entry"
      ? `[data-action-entry-id="${safeId}"]`
      : flashTarget.type === "action"
        ? `[data-action-node-id="${safeId}"]`
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
      const currentLocal = loadLocalForUser(user.id);
      if (!currentLocal || timestampMs(currentLocal.meta?.localUpdatedAt) <= timestampMs(cloudSnapshot.meta?.localUpdatedAt)) {
        saveLocal(cloudSnapshot, user.id);
      }
      setSyncStatus("saved");
      setSyncLabel("Saved");
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
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      saveLocal(db, currentUser.id);
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      return;
    }
    saveLocal(db, currentUser.id);
    setSyncStatus(navigator.onLine ? "saving" : "offline");
    setSyncLabel(navigator.onLine ? "Saving" : "Local saved");
    clearTimeout(saveTimerRef.current);
    clearTimeout(cloudTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveLocal(db, currentUser.id), 120);
    cloudTimerRef.current = setTimeout(() => pushCloudState(db, currentUser), 850);
  }, [db, currentUser?.id]);

  useEffect(() => {
    const online = () => { setSyncStatus("saving"); setSyncLabel("Saving"); pushCloudState(db, currentUser); };
    const offline = () => { setSyncStatus("offline"); setSyncLabel("Local saved"); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
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
      const result = await withTimeout(
        action === "signup" ? sb.auth.signUp({ email, password }) : sb.auth.signInWithPassword({ email, password }),
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
      if (node.level === 1) next.ui.collapsedBoxNodes = toggleId(next.ui.collapsedBoxNodes, id);
      else next.ui.expandedBoxNodes = toggleId(next.ui.expandedBoxNodes, id);
      return next;
    });
  }

  function toggleBoxTimelineDay(boxId, date) {
    setDb(prev => {
      const next = normalizeState(clone(prev));
      next.ui.expandedBoxActionDays = toggleId(next.ui.expandedBoxActionDays || [], `${boxId}:${date}`);
      return next;
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
      state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(x => !ids.has(x));
      state.ui.expandedBoxNodes = (state.ui.expandedBoxNodes || []).filter(x => !ids.has(x));
      state.actionDays.forEach(day => {
        day.nodes = day.nodes.filter(n => !ids.has(n.sourceBoxNodeId));
      });
    }, { sync: false });
  }

  function saveBoxNote({ boxId, title, bodyHtml }) {
    commit("Save box note", state => {
      const node = getNode(state.boxNodes, boxId);
      if (!node) return false;
      node.boxNoteTitle = cleanOptionalTitle(title || "");
      node.boxNoteHtml = sanitizeHtml(bodyHtml || "");
      node.updatedAt = now();
    });
    setModal(null);
  }

  function deleteBoxNote({ boxId }) {
    commit("Delete box note", state => {
      const node = getNode(state.boxNodes, boxId);
      if (!node || !boxHasNote(node)) return false;
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
      return next;
    });
  }

  function toggleActionOpen(id) {
    setDb(prev => {
      const next = normalizeState(clone(prev));
      next.ui.collapsedActionNodes = toggleId(next.ui.collapsedActionNodes, id);
      return next;
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
      return state;
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
      if (entry) {
        entry.title = cleanTitle(title || "Note");
        entry.bodyHtml = sanitizeHtml(bodyHtml || "");
        entry.updatedAt = t;
      } else {
        node.entries.push(normalizeEntry({ type: "note", title: title || "Note", bodyHtml, createdAt: t, updatedAt: t }, node.entries.length));
      }
      node.updatedAt = t;
      day.updatedAt = t;
      state.ui.actionFilter = "all";
      state.ui.collapsedActionNodes = (state.ui.collapsedActionNodes || []).filter(id => id !== nodeId);
    }, { sync: false });
    setModal(null);
  }

  function deleteActionNote({ dayId, nodeId, entryId }) {
    if (!entryId) { setModal(null); return; }
    commit("Delete action note", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      const entry = node ? entriesFor(node).find(e => e.id === entryId) : null;
      if (!day || !node || !entry || entry.type !== "note") return false;
      node.entries = normalizeEntries(node).filter(e => e.id !== entryId);
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
      node.entries = [];
      node.updatedAt = now();
      day.updatedAt = now();
    }, { sync: false });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(sanitizedState(db), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liems-planner-backup-${todayYMD()}.json`;
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
      const next = normalizeState(JSON.parse(text));
      commit("Import JSON", state => {
        state.version = next.version;
        state.meta = next.meta;
        state.boxNodes = next.boxNodes;
        state.actionDays = next.actionDays;
        state.ui = next.ui;
      }, { sync: false });
      showToast("Imported JSON");
    } catch (error) {
      console.warn(error);
      showToast("Invalid JSON file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openSearchResult(result) {
    if (result.boxId) {
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
        return state;
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
        return state;
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
          onImportFile={(e) => importJson(e.target.files?.[0])}
          onSignOut={signOut}
          fileInputRef={fileInputRef}
        />

        <SearchPanel isOpen={isSearchOpen} query={searchQuery} setQuery={setSearchQuery} results={searchResults} onOpenResult={openSearchResult} />

        <main className="app-main p-5 flex-1 flex flex-col pb-24">
          <div className="flex justify-between items-end mb-7 mt-1">
            <h2 className="view-title text-[2.5rem] leading-[1.1] font-extrabold tracking-tighter">
              <button type="button" className={`cursor-pointer transition-colors ${currentView === "boxes" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); setCurrentView("boxes"); }}>Boxes</button>
              <span className="text-[#3E3E3E] mx-1.5 font-light">/</span>
              <button type="button" className={`cursor-pointer transition-colors ${currentView === "actions" ? "text-white" : "text-[#555555]"}`} onClick={(e) => { e.stopPropagation(); setCurrentView("actions"); }}>Actions</button>
            </h2>
            <div className="flex gap-3 text-[#A7A7A7] mb-2">
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
                        <button key={opt} type="button" onClick={() => { setDb(prev => ({ ...prev, ui: { ...prev.ui, boxView: opt } })); setIsActiveMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors capitalize">{opt}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setIsDateMenuOpen(!isDateMenuOpen); setIsActiveMenuOpen(false); }} className="flex items-center gap-1.5 px-6 py-2 bg-transparent hover:border-white active:scale-95 text-white text-[13px] font-bold rounded-full border border-[#878787] transition-all">
                    {db.ui.boxFilter === "today" ? "Today" : db.ui.boxFilter === "7" ? "7 days" : db.ui.boxFilter === "15" ? "15 days" : db.ui.boxFilter === "30" ? "30 days" : db.ui.boxFilter === "all" ? "All" : "Custom"}
                  </button>
                  {isDateMenuOpen && (
                    <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 mt-2 w-[180px] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100">
                      {[["today", "Today"], ["7", "7 days"], ["15", "15 days"], ["30", "30 days"], ["all", "All"]].map(([value, label]) => (
                        <button key={value} type="button" onClick={() => { setDb(prev => ({ ...prev, ui: { ...prev.ui, boxFilter: value } })); setIsDateMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors">{label}</button>
                      ))}
                      <label className="border-t border-[#3E3E3E] mt-1 flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#3E3E3E] transition-colors cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={db.ui.showBoxDays !== false}
                          onChange={(e) => setDb(prev => ({ ...prev, ui: { ...prev.ui, showBoxDays: e.target.checked } }))}
                          className="h-4 w-4 accent-[#FFD2D7] cursor-pointer"
                        />
                        Show days
                      </label>
                      <div className="border-t border-[#3E3E3E] mt-1 pt-2 px-3 pb-2">
                        <div className="text-[11px] text-[#A7A7A7] uppercase tracking-wider font-bold mb-2">Custom range</div>
                        <input type="date" value={db.ui.boxFilterFrom || ""} onChange={(e) => setDb(prev => ({ ...prev, ui: { ...prev.ui, boxFilter: "custom", boxFilterFrom: e.target.value } }))} className="mb-2 w-full bg-[#111] border border-[#333] rounded-lg px-2 py-1.5 text-[13px] text-white" />
                        <input type="date" value={db.ui.boxFilterTo || ""} onChange={(e) => setDb(prev => ({ ...prev, ui: { ...prev.ui, boxFilter: "custom", boxFilterTo: e.target.value } }))} className="w-full bg-[#111] border border-[#333] rounded-lg px-2 py-1.5 text-[13px] text-white" />
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
                        <button key={opt} type="button" onClick={() => { setDb(prev => ({ ...prev, ui: { ...prev.ui, actionFilter: opt } })); setIsActionsMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors capitalize">{opt}</button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative flex items-center justify-between bg-transparent border border-[#555555] rounded-full px-4 py-1.5 hover:border-white transition-colors group flex-1">
                  <button type="button" onClick={() => selectActionDate(addDaysYMD(selectedDate, -1))} className="text-[#A7A7A7] group-hover:text-white transition-colors"><ChevronLeft size={16} /></button>
                  <button type="button" onClick={() => { if (dateInputRef.current?.showPicker) dateInputRef.current.showPicker(); else dateInputRef.current?.click(); }} className="flex items-center gap-2 text-white font-bold text-[13px]">
                    {displayDate(selectedDate, true)} {actionProgress ? <span className="text-[#A7A7A7] font-semibold">{actionProgress.done}/{actionProgress.total}</span> : null} <CalendarDays size={14} className="text-[#FFD2D7]" />
                  </button>
                  <button type="button" onClick={() => selectActionDate(addDaysYMD(selectedDate, 1))} className="text-[#A7A7A7] group-hover:text-white transition-colors"><ChevronRight size={16} /></button>
                  <input ref={dateInputRef} className="native-date" type="date" value={selectedDate} onChange={(e) => selectActionDate(e.target.value)} />
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
        </main>

        {modal?.type === "boxNote" && <RichNoteModal modal={modal} state={db} onClose={() => setModal(null)} onSave={saveBoxNote} onDelete={deleteBoxNote} />}
        {modal?.type === "actionNote" && <RichNoteModal modal={modal} state={db} onClose={() => setModal(null)} onSave={saveActionNote} onDelete={deleteActionNote} />}
        {modal?.type === "actionLines" && <ActionLinesModal modal={modal} onClose={() => setModal(null)} onSave={addActionEntries} />}
        {toast && <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[60] bg-[#1A1A1A] border border-[#444] text-white text-[13px] font-bold px-4 py-3 rounded-full shadow-2xl">{toast}</div>}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
