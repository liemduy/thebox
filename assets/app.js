(function attachPlannerCore(global) {
  const BOX_VIEW_VALUES = new Set(["active", "archived", "done"]);
  const BOX_FILTER_VALUES = new Set(["today", "7", "15", "30", "all", "custom"]);
  const ACTION_FILTER_VALUES = new Set(["all", "undone", "done", "notes"]);
  const NOTES_VIEW_VALUES = new Set(["linked", "free", "all"]);
  const NOTES_DATE_VALUES = new Set(["all", "today", "7", "30"]);
  const BACKUP_KIND = "liems-planner-backup";
  const BACKUP_VERSION = 2;

  function todayYMD(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDaysYMD(ymd, offset) {
    const [y, m, d] = String(ymd || todayYMD()).split("-").map(Number);
    const fallback = new Date();
    const date = new Date(
      Number.isFinite(y) ? y : fallback.getFullYear(),
      Number.isFinite(m) ? m - 1 : fallback.getMonth(),
      Number.isFinite(d) ? d : fallback.getDate()
    );
    date.setDate(date.getDate() + Number(offset || 0));
    return todayYMD(date);
  }

  function displayDate(ymd, long = false, today = todayYMD()) {
    const [y, m, d] = String(ymd || "").split("-").map(Number);
    if (!y || !m || !d) return String(ymd || "");
    const date = new Date(y, m - 1, d);
    if (long) return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const label = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    return ymd === today ? `${label} (today)` : label;
  }

  function daysFromToday(ymd, today = todayYMD()) {
    return Math.round((new Date(`${today}T00:00:00`) - new Date(`${String(ymd)}T00:00:00`)) / 86400000);
  }

  function normalizeModeMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, mode]) => mode === "expanding" || mode === "collapsing"));
  }

  function validYMD(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function boolParam(value, fallback = true) {
    if (value === "0" || value === "false" || value === "no") return false;
    if (value === "1" || value === "true" || value === "yes") return true;
    return fallback;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function boxNoteId(boxId) { return `boxnote_${boxId}`; }
  function boxNoteLinkId(boxId) { return `link_box_${boxId}`; }
  function actionNoteId(entryId) { return `actionnote_${entryId}`; }
  function actionNoteLinkId(entryId) { return `link_action_${entryId}`; }

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

  function parseNotesRouteParams(params) {
    const ui = {
      notesView: "linked",
      notesDate: "all",
      notesTag: "",
      notesTagsInput: "",
      notesDatesInput: ""
    };
    const view = params.get("view");
    const date = params.get("date");
    const tags = params.get("tags");
    const legacyTag = params.get("tag");
    const dates = params.get("dates");
    if (NOTES_VIEW_VALUES.has(view)) ui.notesView = view;
    if (NOTES_DATE_VALUES.has(date)) ui.notesDate = date;
    if (tags !== null) ui.notesTagsInput = tags;
    else if (legacyTag !== null) ui.notesTagsInput = legacyTag;
    if (legacyTag !== null) ui.notesTag = legacyTag;
    if (dates !== null) ui.notesDatesInput = dates;
    return ui;
  }

  function parseBoxNotesRouteParams(params, parts = []) {
    const box = params.get("box") || parts[1] || "";
    return { selectedBoxNoteId: box };
  }

  function parseRouteHash(hash = global.location?.hash || "") {
    const raw = String(hash || "").replace(/^#/, "");
    const [pathRaw, queryRaw = ""] = raw.split("?");
    const path = pathRaw || "/boxes";
    const params = new URLSearchParams(queryRaw);
    const parts = path.split("/").filter(Boolean);
    const name = parts[0] || "boxes";
    if (name === "actions") return { name: "actions", ui: parseActionRouteParams(params) };
    if (name === "notes") return { name: "notes", ui: parseNotesRouteParams(params) };
    if (name === "box-notes") return { name: "box-notes", ui: parseBoxNotesRouteParams(params, parts) };
    if (name === "search") {
      const tab = params.get("tab") === "actions" ? "actions" : params.get("tab") === "notes" ? "notes" : "boxes";
      return {
        name: "search",
        tab,
        query: params.get("q") || "",
        ui: tab === "actions" ? parseActionRouteParams(params) : tab === "notes" ? parseNotesRouteParams(params) : parseBoxRouteParams(params)
      };
    }
    return { name: "boxes", ui: parseBoxRouteParams(params) };
  }

  function routeView(route) {
    if (route?.name === "actions") return "actions";
    if (route?.name === "notes") return "notes";
    if (route?.name === "box-notes") return "boxNotes";
    if (route?.name === "search") return route.tab === "actions" ? "actions" : route.tab === "notes" ? "notes" : "boxes";
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

  function appendNotesRouteParams(params, ui) {
    params.set("view", NOTES_VIEW_VALUES.has(ui.notesView) ? ui.notesView : "linked");
    const tagsInput = String(ui.notesTagsInput || ui.notesTag || "").trim();
    const datesInput = String(ui.notesDatesInput || "").trim();
    const presetDate = NOTES_DATE_VALUES.has(ui.notesDate) ? ui.notesDate : "all";
    if (tagsInput) params.set("tags", tagsInput);
    if (datesInput) params.set("dates", datesInput);
    else if (presetDate !== "all") params.set("date", presetDate);
  }

  function buildAppHash({ currentView, ui, isSearchOpen, searchQuery }) {
    const params = new URLSearchParams();
    if (isSearchOpen) {
      const tab = currentView === "actions" ? "actions" : (currentView === "notes" || currentView === "boxNotes") ? "notes" : "boxes";
      params.set("tab", tab);
      if (String(searchQuery || "").trim()) params.set("q", String(searchQuery || "").trim());
      if (currentView === "actions") appendActionRouteParams(params, ui);
      else if (currentView === "notes" || currentView === "boxNotes") appendNotesRouteParams(params, ui);
      else appendBoxRouteParams(params, ui);
      return `#/search?${params.toString()}`;
    }
    if (currentView === "actions") {
      appendActionRouteParams(params, ui);
      return `#/actions?${params.toString()}`;
    }
    if (currentView === "notes") {
      appendNotesRouteParams(params, ui);
      return `#/notes?${params.toString()}`;
    }
    if (currentView === "boxNotes") {
      if (ui.selectedBoxNoteId) params.set("box", ui.selectedBoxNoteId);
      const query = params.toString();
      return query ? `#/box-notes?${query}` : "#/box-notes";
    }
    appendBoxRouteParams(params, ui);
    return `#/boxes?${params.toString()}`;
  }

  function childrenOf(parentId, nodes) {
    return (nodes || []).filter(n => (n.parentId ?? null) === (parentId ?? null)).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  function getNode(nodes, id) {
    return (nodes || []).find(n => n.id === id);
  }

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
    function walk(nodeId) {
      childrenOf(nodeId, nodes).forEach(child => {
        out.push(child);
        walk(child.id);
      });
    }
    walk(id);
    return out;
  }

  function rootOf(node, nodes) {
    let cur = node;
    while (cur?.parentId) cur = getNode(nodes, cur.parentId);
    return cur;
  }

  function pathOf(node, nodes) {
    return [...ancestorsOf(node.id, nodes), node].map(n => n.title).join(" > ");
  }

  function boxIsArchived(node) {
    return Boolean(node?.archivedAt);
  }

  function boxIsDone(node) {
    return Boolean(node?.doneAt);
  }

  function boxIsInactive(node) {
    return boxIsArchived(node) || (Number(node?.level || 1) === 1 && boxIsDone(node));
  }

  function entriesFor(node, type = null) {
    const entries = Array.isArray(node?.entries) ? node.entries.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)) : [];
    return type ? entries.filter(e => e.type === type) : entries;
  }

  function actionEntriesFor(node) {
    return entriesFor(node, "action");
  }

  function noteEntriesFor(node) {
    return entriesFor(node, "note");
  }

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

  function setBoxOpen(state, node, open) {
    if (Number(node.level || 1) === 1) {
      const collapsed = new Set(state.ui.collapsedBoxNodes || []);
      open ? collapsed.delete(node.id) : collapsed.add(node.id);
      state.ui.collapsedBoxNodes = [...collapsed];
    } else {
      const expanded = new Set(state.ui.expandedBoxNodes || []);
      open ? expanded.add(node.id) : expanded.delete(node.id);
      state.ui.expandedBoxNodes = [...expanded];
    }
  }

  function isActionOpen(state, node) {
    return !(state.ui.collapsedActionNodes || []).includes(node.id);
  }

  function setActionOpen(state, node, open) {
    const collapsed = new Set(state.ui.collapsedActionNodes || []);
    open ? collapsed.delete(node.id) : collapsed.add(node.id);
    state.ui.collapsedActionNodes = [...collapsed];
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

  function markActionNoteMirrorDeleted(state, entryId, timestamp = new Date().toISOString()) {
    const noteId = actionNoteId(entryId);
    const next = clone(state || {});
    next.notes = Array.isArray(next.notes) ? next.notes.map(note => {
      if (note?.id !== noteId) return note;
      return {
        ...note,
        deletedAt: timestamp,
        updatedAt: timestamp,
        clientUpdatedAt: timestamp
      };
    }) : [];
    next.noteLinks = Array.isArray(next.noteLinks) ? next.noteLinks.filter(link => link?.noteId !== noteId) : [];
    return next;
  }

  function backupSummary(data) {
    const state = data?.data && data?.kind === BACKUP_KIND ? data.data : data;
    const boxNodes = Array.isArray(state?.boxNodes) ? state.boxNodes : [];
    const actionDays = Array.isArray(state?.actionDays) ? state.actionDays : [];
    const notes = Array.isArray(state?.notes) ? state.notes : [];
    const noteLinks = Array.isArray(state?.noteLinks) ? state.noteLinks : [];
    const actionEntries = actionDays.reduce((sum, day) => sum + (day.nodes || []).reduce((nodeSum, node) => nodeSum + entriesFor(node, "action").length, 0), 0);
    const actionNotes = actionDays.reduce((sum, day) => sum + (day.nodes || []).reduce((nodeSum, node) => nodeSum + entriesFor(node, "note").length, 0), 0);
    return {
      boxes: boxNodes.length,
      actionDays: actionDays.length,
      actionEntries,
      actionNotes,
      notes: notes.length,
      noteLinks: noteLinks.length
    };
  }

  function createBackupEnvelope(data, options = {}) {
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      appVersion: options.appVersion || String(data?.version || ""),
      exportedAt: options.exportedAt || new Date().toISOString(),
      summary: backupSummary(data),
      data
    };
  }

  function readBackupEnvelope(input) {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (parsed?.kind === BACKUP_KIND && parsed.version === BACKUP_VERSION && parsed.data && typeof parsed.data === "object") {
      return { data: parsed.data, envelope: parsed, legacy: false, summary: parsed.summary || backupSummary(parsed.data) };
    }
    if (parsed && typeof parsed === "object") {
      return { data: parsed, envelope: null, legacy: true, summary: backupSummary(parsed) };
    }
    throw new Error("Invalid planner backup");
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

  function cascadeMaxDepth(node, getChildren, hasOwnContent = () => false) {
    const children = getChildren(node);
    if (children.length) return 1 + Math.max(0, ...children.map(child => cascadeMaxDepth(child, getChildren, hasOwnContent)));
    return hasOwnContent(node) ? 1 : 0;
  }

  function cascadeOpenDepth(node, getChildren, isOpen, hasOwnContent = () => false) {
    if (!isOpen(node)) return 0;
    const children = getChildren(node);
    if (!children.length) return 1;
    const expandable = children.filter(child => cascadeMaxDepth(child, getChildren, hasOwnContent) > 0);
    if (!expandable.length) return 1;
    return 1 + Math.min(...expandable.map(child => cascadeOpenDepth(child, getChildren, isOpen, hasOwnContent)));
  }

  function closeCascade(node, getChildren, setOpen) {
    setOpen(node, false);
    getChildren(node).forEach(child => closeCascade(child, getChildren, setOpen));
  }

  function applyCascadeDepth(node, targetDepth, getChildren, setOpen) {
    if (targetDepth <= 0) {
      closeCascade(node, getChildren, setOpen);
      return;
    }
    setOpen(node, true);
    getChildren(node).forEach(child => {
      if (targetDepth > 1) applyCascadeDepth(child, targetDepth - 1, getChildren, setOpen);
      else closeCascade(child, getChildren, setOpen);
    });
  }

  function cascadePlan(currentDepth, maxDepth, mode) {
    if (maxDepth <= 0) {
      return { direction: currentDepth > 0 ? "collapse" : "expand", deep: false, nextDepth: currentDepth > 0 ? 0 : 1, nextMode: "expanding" };
    }
    const shouldCollapse = mode === "collapsing" || currentDepth >= maxDepth;
    if (shouldCollapse) {
      const nextDepth = Math.max(0, currentDepth - 1);
      return { direction: "collapse", deep: currentDepth > 1, nextDepth, nextMode: nextDepth > 0 ? "collapsing" : "expanding" };
    }
    const nextDepth = Math.min(maxDepth, currentDepth + 1);
    return { direction: "expand", deep: currentDepth > 0, nextDepth, nextMode: nextDepth >= maxDepth ? "collapsing" : "expanding" };
  }

  const api = {
    BOX_VIEW_VALUES,
    BOX_FILTER_VALUES,
    ACTION_FILTER_VALUES,
    NOTES_VIEW_VALUES,
    NOTES_DATE_VALUES,
    todayYMD,
    addDaysYMD,
    displayDate,
    daysFromToday,
    normalizeModeMap,
    validYMD,
    boolParam,
    BACKUP_KIND,
    BACKUP_VERSION,
    boxNoteId,
    boxNoteLinkId,
    actionNoteId,
    actionNoteLinkId,
    parseBoxRouteParams,
    parseActionRouteParams,
    parseNotesRouteParams,
    parseBoxNotesRouteParams,
    parseRouteHash,
    routeView,
    appendBoxRouteParams,
    appendActionRouteParams,
    appendNotesRouteParams,
    buildAppHash,
    childrenOf,
    getNode,
    ancestorsOf,
    descendantsOf,
    rootOf,
    pathOf,
    boxIsArchived,
    boxIsDone,
    boxIsInactive,
    entriesFor,
    actionEntriesFor,
    noteEntriesFor,
    progressForNodes,
    boxRoots,
    vaultRoots,
    shouldShowChildInView,
    isBoxOpen,
    setBoxOpen,
    isActionOpen,
    setActionOpen,
    visibleEntriesFor,
    hasVisibleAction,
    dateInBoxFilter,
    rootHasEntriesOnDay,
    summariesForRoot,
    markActionNoteMirrorDeleted,
    backupSummary,
    createBackupEnvelope,
    readBackupEnvelope,
    actionTimelineForBox,
    cascadeMaxDepth,
    cascadeOpenDepth,
    closeCascade,
    applyCascadeDepth,
    cascadePlan
  };

  global.LiemsPlannerCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);


function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useEffect,
  useMemo,
  useRef,
  useState
} = React;
const SUPABASE_URL = "https://mmtvezpwflqbpkilkooy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bvZguwM4vs7ZNPr9XRCcxw_gMm1DZpU";
const STORAGE_KEY = "idea-box-html-v13-action-notes";
const STATE_TABLE = "idea_box_states";
const NOTES_TABLE = "idea_notes";
const NOTE_LINKS_TABLE = "idea_note_links";
const APP_BUILD_ID = "2026-05-26-note-editor-polish";
const APP_CACHE_NAME = "idea-box-v97-note-editor-polish";
const FORCE_LOCAL_MODE = new URLSearchParams(window.location.search).has("local");
const LEGACY_KEYS = ["idea-box-html-v12-stable-ids", "idea-box-html-v10-action-days-db", "idea-box-html-v9-supabase", "idea-box-html-v8-supabase", "idea-box-html-v7-supabase", "idea-box-html-v6-actions", "idea-box-html-v4-clean-box", "idea-box-html-v3-inline-delete", "idea-box-html-v2-inline-format"];
const sb = !FORCE_LOCAL_MODE && window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;
const CLOUD_READ_TIMEOUT_MS = 9000;
const CLOUD_WRITE_TIMEOUT_MS = 12000;
const SNAPSHOT_WARN_BYTES = 3_500_000;
let lastSnapshotSizeWarningAt = 0;
const {
  todayYMD,
  addDaysYMD,
  displayDate,
  daysFromToday,
  normalizeModeMap,
  validYMD,
  createBackupEnvelope,
  readBackupEnvelope,
  BACKUP_VERSION,
  parseRouteHash,
  routeView,
  buildAppHash,
  childrenOf,
  getNode,
  ancestorsOf,
  descendantsOf,
  rootOf,
  pathOf,
  boxIsArchived,
  boxIsDone,
  boxIsInactive,
  entriesFor,
  actionEntriesFor,
  noteEntriesFor,
  progressForNodes,
  boxRoots,
  vaultRoots,
  shouldShowChildInView,
  isBoxOpen,
  setBoxOpen,
  isActionOpen,
  setActionOpen,
  visibleEntriesFor,
  hasVisibleAction,
  dateInBoxFilter,
  rootHasEntriesOnDay,
  summariesForRoot,
  actionTimelineForBox,
  cascadeMaxDepth,
  cascadeOpenDepth,
  applyCascadeDepth,
  cascadePlan
} = window.LiemsPlannerCore;
function withTimeout(promise, ms, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timerId));
}
function useAuthSession({
  setCurrentUser,
  setBooting,
  hydrateUserState,
  hydratedRef
}) {
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authView, setAuthView] = useState("login");
  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!sb) {
        const localUser = {
          id: "local",
          email: "local"
        };
        setCurrentUser(localUser);
        await hydrateUserState(localUser);
        return;
      }
      try {
        const {
          data,
          error
        } = await withTimeout(sb.auth.getSession(), CLOUD_READ_TIMEOUT_MS, "Session check");
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
    return () => {
      alive = false;
    };
  }, []);
  async function handleAuth(action, payload) {
    if (!sb) {
      const localUser = {
        id: "local",
        email: "local"
      };
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
        const {
          error
        } = await withTimeout(sb.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + location.pathname
        }), CLOUD_READ_TIMEOUT_MS, "Password reset");
        if (error) throw error;
        setAuthMessage("Check email to reset password");
        return;
      }
      if (action === "update-password") {
        if (password.length < 6) throw new Error("Password must have at least 6 characters");
        const {
          error
        } = await withTimeout(sb.auth.updateUser({
          password
        }), CLOUD_READ_TIMEOUT_MS, "Password update");
        if (error) throw error;
        setAuthView("login");
        setAuthMessage("Password updated");
        return;
      }
      if (!email || !password) throw new Error("Enter email and password");
      if (password.length < 6) throw new Error("Password must have at least 6 characters");
      const redirectTo = `${location.origin}${location.pathname}`;
      const result = await withTimeout(action === "signup" ? sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo
        }
      }) : sb.auth.signInWithPassword({
        email,
        password
      }), CLOUD_READ_TIMEOUT_MS, action === "signup" ? "Sign up" : "Login");
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
      try {
        await sb.auth.signOut({
          scope: "local"
        });
      } catch {}
    }
  }
  return {
    authBusy,
    authMessage,
    authView,
    setAuthView,
    handleAuth,
    signOut
  };
}
const iconPaths = {
  MoreHorizontal: React.createElement(React.Fragment, null, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), React.createElement("circle", {
    cx: "19",
    cy: "12",
    r: "1"
  }), React.createElement("circle", {
    cx: "5",
    cy: "12",
    r: "1"
  })),
  User: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M19 21a7 7 0 0 0-14 0"
  }), React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "4"
  })),
  GripVertical: React.createElement(React.Fragment, null, React.createElement("circle", {
    cx: "12",
    cy: "5",
    r: "1"
  }), React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), React.createElement("circle", {
    cx: "12",
    cy: "19",
    r: "1"
  })),
  ChevronRight: React.createElement("path", {
    d: "m9 18 6-6-6-6"
  }),
  ChevronDown: React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }),
  ChevronsRight: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "m6 17 5-5-5-5"
  }), React.createElement("path", {
    d: "m13 17 5-5-5-5"
  })),
  ChevronsDown: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "m7 6 5 5 5-5"
  }), React.createElement("path", {
    d: "m7 13 5 5 5-5"
  })),
  ChevronLeft: React.createElement("path", {
    d: "m15 18-6-6 6-6"
  }),
  Plus: React.createElement("path", {
    d: "M5 12h14M12 5v14"
  }),
  Check: React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }),
  Search: React.createElement(React.Fragment, null, React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), React.createElement("path", {
    d: "m21 21-4.35-4.35"
  })),
  Undo2: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M9 14 4 9l5-5"
  }), React.createElement("path", {
    d: "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"
  })),
  Redo2: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "m15 14 5-5-5-5"
  }), React.createElement("path", {
    d: "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"
  })),
  PlusSquare: React.createElement(React.Fragment, null, React.createElement("rect", {
    width: "18",
    height: "18",
    x: "3",
    y: "3",
    rx: "2"
  }), React.createElement("path", {
    d: "M8 12h8M12 8v8"
  })),
  FileText: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
  }), React.createElement("path", {
    d: "M14 2v6h6M16 13H8M16 17H8M10 9H8"
  })),
  Notebook: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
  }), React.createElement("path", {
    d: "M8 2v20M8 6H4M8 10H4M8 14H4M8 18H4M12 7h4M12 11h4"
  })),
  MapPin: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0"
  }), React.createElement("circle", {
    cx: "12",
    cy: "10",
    r: "3"
  })),
  Archive: React.createElement(React.Fragment, null, React.createElement("rect", {
    width: "20",
    height: "5",
    x: "2",
    y: "3",
    rx: "1"
  }), React.createElement("path", {
    d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"
  })),
  CheckCircle: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M22 11.08V12a10 10 0 1 1-5.93-9.14"
  }), React.createElement("path", {
    d: "m9 11 3 3L22 4"
  })),
  Trash2: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"
  })),
  X: React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }),
  CalendarDays: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M8 2v4M16 2v4M3 10h18"
  }), React.createElement("rect", {
    width: "18",
    height: "18",
    x: "3",
    y: "4",
    rx: "2"
  }), React.createElement("path", {
    d: "M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"
  })),
  ClipboardList: React.createElement(React.Fragment, null, React.createElement("rect", {
    width: "8",
    height: "4",
    x: "8",
    y: "2",
    rx: "1"
  }), React.createElement("path", {
    d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
  }), React.createElement("path", {
    d: "M12 11h4M12 16h4M8 11h.01M8 16h.01"
  })),
  CheckSquare: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M8 12.5 10.5 15 16 9"
  }), React.createElement("rect", {
    x: "3.5",
    y: "3.5",
    width: "17",
    height: "17",
    rx: "3"
  })),
  Table2: React.createElement(React.Fragment, null, React.createElement("rect", {
    x: "3.5",
    y: "4.5",
    width: "17",
    height: "15",
    rx: "1.5"
  }), React.createElement("path", {
    d: "M3.5 9.5h17M3.5 14.5h17M10 4.5v15M16 4.5v15"
  })),
  Bold: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M6 4h8a4 4 0 0 1 0 8H6z"
  }), React.createElement("path", {
    d: "M6 12h9a4 4 0 0 1 0 8H6z"
  })),
  Italic: React.createElement(React.Fragment, null, React.createElement("line", {
    x1: "19",
    x2: "10",
    y1: "4",
    y2: "4"
  }), React.createElement("line", {
    x1: "14",
    x2: "5",
    y1: "20",
    y2: "20"
  }), React.createElement("line", {
    x1: "15",
    x2: "9",
    y1: "4",
    y2: "20"
  })),
  Underline: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M6 4v6a6 6 0 0 0 12 0V4"
  }), React.createElement("line", {
    x1: "4",
    x2: "20",
    y1: "22",
    y2: "22"
  })),
  Indent: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M21 6H11M21 12H11M21 18H11M7 8l-4 4 4 4"
  })),
  IndentIncrease: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M21 6H11M21 12H11M21 18H11M3 8l4 4-4 4"
  })),
  Quote: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M6 5v14"
  }), React.createElement("path", {
    d: "M11 8h8"
  }), React.createElement("path", {
    d: "M11 12h6"
  }), React.createElement("path", {
    d: "M11 16h8"
  })),
  List: React.createElement(React.Fragment, null, React.createElement("line", {
    x1: "8",
    x2: "21",
    y1: "6",
    y2: "6"
  }), React.createElement("line", {
    x1: "8",
    x2: "21",
    y1: "12",
    y2: "12"
  }), React.createElement("line", {
    x1: "8",
    x2: "21",
    y1: "18",
    y2: "18"
  }), React.createElement("line", {
    x1: "3",
    x2: "3.01",
    y1: "6",
    y2: "6"
  }), React.createElement("line", {
    x1: "3",
    x2: "3.01",
    y1: "12",
    y2: "12"
  }), React.createElement("line", {
    x1: "3",
    x2: "3.01",
    y1: "18",
    y2: "18"
  })),
  Download: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), React.createElement("polyline", {
    points: "7 10 12 15 17 10"
  }), React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "15",
    y2: "3"
  })),
  Upload: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), React.createElement("polyline", {
    points: "17 8 12 3 7 8"
  }), React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "3",
    y2: "15"
  })),
  LogOut: React.createElement(React.Fragment, null, React.createElement("path", {
    d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
  }), React.createElement("polyline", {
    points: "16 17 21 12 16 7"
  }), React.createElement("line", {
    x1: "21",
    x2: "9",
    y1: "12",
    y2: "12"
  }))
};
function makeIcon(name) {
  return function Icon({
    size = 24,
    strokeWidth = 2,
    className = "",
    ...props
  }) {
    return React.createElement("svg", _extends({
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className: className
    }, props), iconPaths[name]);
  };
}
const MoreHorizontal = makeIcon("MoreHorizontal");
const User = makeIcon("User");
const GripVertical = makeIcon("GripVertical");
const ChevronRight = makeIcon("ChevronRight");
const ChevronDown = makeIcon("ChevronDown");
const ChevronsRight = makeIcon("ChevronsRight");
const ChevronsDown = makeIcon("ChevronsDown");
const ChevronLeft = makeIcon("ChevronLeft");
const Plus = makeIcon("Plus");
const Check = makeIcon("Check");
const Search = makeIcon("Search");
const Undo2 = makeIcon("Undo2");
const Redo2 = makeIcon("Redo2");
const PlusSquare = makeIcon("PlusSquare");
const FileText = makeIcon("FileText");
const Notebook = makeIcon("Notebook");
const MapPin = makeIcon("MapPin");
const Archive = makeIcon("Archive");
const CheckCircle = makeIcon("CheckCircle");
const Trash2 = makeIcon("Trash2");
const X = makeIcon("X");
const CalendarDays = makeIcon("CalendarDays");
const ClipboardList = makeIcon("ClipboardList");
const CheckSquare = makeIcon("CheckSquare");
const Table2 = makeIcon("Table2");
const Bold = makeIcon("Bold");
const Italic = makeIcon("Italic");
const Underline = makeIcon("Underline");
const Indent = makeIcon("Indent");
const IndentIncrease = makeIcon("IndentIncrease");
const Quote = makeIcon("Quote");
const List = makeIcon("List");
const Download = makeIcon("Download");
const Upload = makeIcon("Upload");
const LogOut = makeIcon("LogOut");
const DEFAULT_WORKSPACE_NAME = "Liem's Planner";
const LOGO_STYLE_COUNT = 15;
function normalizeWorkspaceName(value, options = {}) {
  const compact = String(value || "").replace(/\s+/g, " ").trimStart().slice(0, 21);
  const words = compact.split(" ").filter(Boolean).slice(0, 2);
  const trailingSpace = !options.final && compact.endsWith(" ") && words.length < 2;
  return `${words.join(" ")}${trailingSpace ? " " : ""}`;
}
function workspaceInitials(name) {
  const words = normalizeWorkspaceName(name || DEFAULT_WORKSPACE_NAME, {
    final: true
  }).split(" ").filter(Boolean);
  const letters = words.length > 1 ? `${words[0][0] || ""}${words[1][0] || ""}` : String(words[0] || DEFAULT_WORKSPACE_NAME).slice(0, 2);
  return letters.toUpperCase() || "LP";
}
function workspaceNameParts(name) {
  const words = normalizeWorkspaceName(name || DEFAULT_WORKSPACE_NAME, {
    final: true
  }).split(" ").filter(Boolean);
  return {
    first: words[0] || "Liem's",
    second: words[1] || ""
  };
}
function logoStyleIndex(style) {
  return Math.abs(Number(style) || 0) % LOGO_STYLE_COUNT;
}
function logoStyleClass(style) {
  const index = logoStyleIndex(style);
  return ["bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] text-[#111] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]", "bg-[#111111] border border-[#FFD2D7] text-[#FFD2D7] rounded-[12px] shadow-[inset_0_4px_0_rgba(255,210,215,0.18)]", "bg-[#151515] border border-[#3d3d3d] text-white rounded-[10px]", "bg-[#FFD2D7] text-black rounded-[9px] shadow-[0_8px_18px_rgba(255,210,215,0.16)]", "bg-[#101010] border border-[#444444] text-white rounded-[12px] shadow-[inset_0_-7px_0_rgba(255,210,215,0.10)]", "bg-transparent border border-dashed border-[#FFD2D7] text-[#FFD2D7] rounded-[8px]", "bg-[#FFD2D7] text-black rounded-[5px_12px_12px_12px]", "bg-[#101010] border border-[#343434] text-[#FFD2D7] rounded-[12px] shadow-[inset_0_0_0_1px_rgba(255,210,215,0.08)]", "bg-[#F2F2F2] text-black rounded-[10px] shadow-[4px_4px_0_#2D2D2D]", "bg-[#111111] border border-[#FFD2D7] text-white rounded-[14px]", "bg-[#151515] border border-[#3E3E3E] text-white rounded-[12px]", "bg-[#F7DDE1] text-black rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.28)]", "bg-[#101010] border border-[#3A3A3A] text-[#FFD2D7] rounded-[6px]", "bg-[#0a0a0a] border border-[#555555] text-white rounded-[12px]", "bg-black border border-[#FFD2D7] text-[#FFD2D7] rounded-[10px] shadow-[0_0_18px_rgba(255,210,215,0.18)]"][index];
}
function LogoDecoration({
  style
}) {
  const index = Math.abs(Number(style) || 0) % LOGO_STYLE_COUNT;
  if (index === 0) return React.createElement("span", {
    className: "absolute -top-1 -right-1 w-3 h-3 bg-black rounded-full border-2 border-[#FFD2D7]"
  });
  if (index === 1) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-2 right-2 top-[7px] h-px bg-[#FFD2D7]/60"
  }), React.createElement("span", {
    className: "absolute left-[9px] top-[4px] h-[6px] w-[3px] rounded-full bg-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute right-[9px] top-[4px] h-[6px] w-[3px] rounded-full bg-[#FFD2D7]"
  }));
  if (index === 2) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-[5px] top-[8px] h-[3px] w-[3px] rounded-full bg-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute left-[5px] top-[16px] h-[3px] w-[3px] rounded-full bg-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute left-[5px] top-[24px] h-[3px] w-[3px] rounded-full bg-[#FFD2D7]"
  }));
  if (index === 3) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute right-[7px] top-[8px] h-[7px] w-[7px] border border-black rounded-[2px]"
  }), React.createElement("span", {
    className: "absolute right-[8px] top-[9px] h-[4px] w-[6px] border-b-2 border-l-2 border-black rotate-[-35deg]"
  }));
  if (index === 4) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-1/2 top-[-3px] h-[9px] w-[17px] -translate-x-1/2 rounded-b-[5px] border border-[#FFD2D7]/70 bg-[#0a0a0a]"
  }), React.createElement("span", {
    className: "absolute left-1/2 top-[2px] h-px w-[10px] -translate-x-1/2 bg-[#FFD2D7]/70"
  }));
  if (index === 5) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-[7px] top-[7px] h-[5px] w-[5px] border-l border-t border-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute right-[7px] bottom-[7px] h-[5px] w-[5px] border-r border-b border-[#FFD2D7]"
  }));
  if (index === 6) return React.createElement("span", {
    className: "absolute left-[6px] top-[-1px] h-[8px] w-[17px] rounded-t-[5px] bg-[#FFD2D7] border border-black/10"
  });
  if (index === 7) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-[9px] right-[9px] top-[12px] h-px bg-[#FFD2D7]/25"
  }), React.createElement("span", {
    className: "absolute left-[9px] right-[9px] top-[20px] h-px bg-[#FFD2D7]/25"
  }), React.createElement("span", {
    className: "absolute left-[9px] right-[9px] top-[28px] h-px bg-[#FFD2D7]/25"
  }), React.createElement("span", {
    className: "absolute left-[17px] top-[8px] bottom-[8px] w-px bg-[#FFD2D7]/20"
  }));
  if (index === 8) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute -right-[4px] top-[5px] h-[31px] w-[31px] rounded-[9px] border border-[#555555] -z-10"
  }), React.createElement("span", {
    className: "absolute -right-[2px] top-[3px] h-[33px] w-[33px] rounded-[9px] border border-[#777777] -z-10"
  }));
  if (index === 9) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-[-3px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[#0a0a0a] border border-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute right-[-3px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[#0a0a0a] border border-[#FFD2D7]"
  }));
  if (index === 10) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-[9px] top-[8px] bottom-[8px] w-px bg-[#FFD2D7]/65"
  }), React.createElement("span", {
    className: "absolute left-[7px] top-[10px] h-[5px] w-[5px] rounded-full bg-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute left-[7px] bottom-[10px] h-[5px] w-[5px] rounded-full bg-[#FFD2D7]"
  }));
  if (index === 11) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute inset-[6px] rounded-full border border-black/15"
  }), React.createElement("span", {
    className: "absolute bottom-[6px] h-px w-[16px] bg-black/20"
  }));
  if (index === 12) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-0 top-0 bottom-0 w-[5px] bg-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute left-[11px] right-[7px] top-[11px] h-px bg-[#FFD2D7]/35"
  }), React.createElement("span", {
    className: "absolute left-[11px] right-[7px] bottom-[11px] h-px bg-[#FFD2D7]/35"
  }));
  if (index === 13) return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute left-[6px] top-[6px] h-[6px] w-[6px] border-l border-t border-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute right-[6px] top-[6px] h-[6px] w-[6px] border-r border-t border-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute left-[6px] bottom-[6px] h-[6px] w-[6px] border-l border-b border-[#FFD2D7]"
  }), React.createElement("span", {
    className: "absolute right-[6px] bottom-[6px] h-[6px] w-[6px] border-r border-b border-[#FFD2D7]"
  }));
  return React.createElement(React.Fragment, null, React.createElement("span", {
    className: "absolute inset-[5px] rounded-[7px] border border-[#FFD2D7]/30"
  }), React.createElement("span", {
    className: "absolute -bottom-[2px] left-1/2 h-[3px] w-[18px] -translate-x-1/2 rounded-full bg-[#FFD2D7]/60 blur-[1px]"
  }));
}
function BrandLogo({
  name,
  style,
  onClick,
  className = "w-[40px] h-[40px]",
  textClassName = "text-[18px]",
  ariaLabel = "Workspace logo",
  title = "Workspace logo"
}) {
  const content = React.createElement(React.Fragment, null, React.createElement(LogoDecoration, {
    style: style
  }), React.createElement("span", {
    className: `relative z-10 font-black tracking-tighter ${textClassName}`
  }, workspaceInitials(name)));
  const classes = `relative isolate shrink-0 flex items-center justify-center transition-all ${className} ${logoStyleClass(style)}`;
  if (onClick) {
    return React.createElement("button", {
      type: "button",
      onClick: onClick,
      className: `${classes} active:scale-95`,
      "aria-label": ariaLabel,
      title: title
    }, content);
  }
  return React.createElement("div", {
    className: classes,
    "aria-label": ariaLabel,
    title: title
  }, content);
}
function Header({
  workspaceName,
  logoStyle,
  onWorkspaceNameChange,
  onCycleLogoStyle,
  syncStatus,
  syncLabel,
  isSearchOpen,
  setIsSearchOpen,
  isHeaderMenuOpen,
  setIsHeaderMenuOpen,
  onSyncNow,
  onExport,
  onImportClick,
  onSignOut,
  fileInputRef,
  onImportFile
}) {
  const displayName = normalizeWorkspaceName(workspaceName, {
    final: true
  }) || DEFAULT_WORKSPACE_NAME;
  const [draftName, setDraftName] = useState(displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const titleInputRef = useRef(null);
  useEffect(() => setDraftName(displayName), [displayName]);
  useEffect(() => {
    if (!isEditingName) return;
    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 20);
  }, [isEditingName]);
  const syncText = syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Local" : syncStatus === "error" ? "Error" : "Saved";
  const syncColor = syncStatus === "saved" ? "#FFD2D7" : syncStatus === "error" ? "#fb7185" : syncStatus === "saving" ? "#FFD2D7" : "#666666";
  function commitWorkspaceName() {
    const next = normalizeWorkspaceName(draftName, {
      final: true
    }) || DEFAULT_WORKSPACE_NAME;
    setDraftName(next);
    setIsEditingName(false);
    if (next !== displayName) onWorkspaceNameChange?.(next);
  }
  function cancelWorkspaceNameEdit() {
    setDraftName(displayName);
    setIsEditingName(false);
  }
  function startWorkspaceNameEdit(event) {
    event.stopPropagation();
    setDraftName(displayName);
    setIsEditingName(true);
  }
  const titleParts = workspaceNameParts(displayName);
  return React.createElement("header", {
    className: "app-header flex justify-between items-center p-5 border-b border-[#333333] bg-[#0a0a0a] relative z-40"
  }, React.createElement("div", {
    className: "flex items-center gap-3 min-w-0"
  }, React.createElement(BrandLogo, {
    name: displayName,
    style: logoStyle,
    onClick: e => {
      e.stopPropagation();
      onCycleLogoStyle?.();
    },
    className: "w-[40px] h-[40px]",
    textClassName: "text-[18px]",
    ariaLabel: "Change logo style",
    title: "Change logo style"
  }), React.createElement("div", {
    className: "min-w-0"
  }, isEditingName ? React.createElement("input", {
    ref: titleInputRef,
    value: draftName,
    onChange: e => setDraftName(normalizeWorkspaceName(e.target.value)),
    onBlur: commitWorkspaceName,
    onKeyDown: e => {
      if (e.key === "Enter") e.currentTarget.blur();
      if (e.key === "Escape") cancelWorkspaceNameEdit();
    },
    onClick: e => e.stopPropagation(),
    maxLength: 21,
    "aria-label": "Workspace name",
    className: "block w-full max-w-[168px] bg-transparent border-none outline-none p-0 text-white font-extrabold text-[19px] leading-tight tracking-tight truncate focus:text-[#FFD2D7]"
  }) : React.createElement("button", {
    type: "button",
    onClick: startWorkspaceNameEdit,
    "aria-label": "Workspace name",
    className: "workspace-title-display flex max-w-[168px] items-baseline gap-1.5 text-left leading-tight truncate"
  }, React.createElement("span", {
    className: "truncate font-extrabold text-[19px] tracking-tight text-[#FFD2D7]"
  }, titleParts.first), titleParts.second ? React.createElement("span", {
    className: "workspace-title-second shrink-0 text-[#FFD2D7] font-medium text-[16px] italic font-serif"
  }, titleParts.second) : null), React.createElement("div", {
    className: "text-[#777777] italic text-[11px] leading-tight font-semibold"
  }, "\u2014thebox"))), React.createElement("div", {
    className: "flex gap-4 text-[#A7A7A7] items-center shrink-0"
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      onSyncNow();
    },
    title: syncLabel || syncText,
    "aria-label": syncLabel || syncText,
    className: "transition-transform hover:scale-110 active:scale-95",
    style: {
      color: syncColor
    }
  }, syncStatus === "saving" ? React.createElement(MoreHorizontal, {
    size: 20,
    className: "animate-pulse"
  }) : React.createElement(Check, {
    size: 20
  })), React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setIsSearchOpen(!isSearchOpen);
    },
    className: `transition-colors outline-none ${isSearchOpen ? "text-[#FFD2D7]" : "hover:text-white"}`,
    "aria-label": "Search"
  }, React.createElement(Search, {
    size: 20
  })), React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setIsHeaderMenuOpen(!isHeaderMenuOpen);
    },
    className: `p-1.5 rounded-full transition-colors ${isHeaderMenuOpen ? "bg-[#222] text-white" : "hover:text-white"}`,
    "aria-label": "Account"
  }, React.createElement(User, {
    size: 20
  })), isHeaderMenuOpen && React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "absolute right-0 top-full mt-2 w-48 bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#333333] p-1.5 animate-in fade-in zoom-in-95 duration-100 z-50"
  }, React.createElement("button", {
    type: "button",
    onClick: onExport,
    className: "flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"
  }, React.createElement(Download, {
    size: 16
  }), " Export JSON"), React.createElement("button", {
    type: "button",
    onClick: onImportClick,
    className: "flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"
  }, React.createElement(Upload, {
    size: 16
  }), " Import JSON"), React.createElement("div", {
    className: "h-px bg-[#333] my-1"
  }), React.createElement("button", {
    type: "button",
    onClick: onSignOut,
    className: "flex items-center gap-3 w-full px-3 py-2.5 text-red-400 hover:bg-[#333] rounded-lg transition-colors text-[14px]"
  }, React.createElement(LogOut, {
    size: 16
  }), " Log out"))), React.createElement("input", {
    ref: fileInputRef,
    onChange: onImportFile,
    className: "hidden",
    type: "file",
    accept: "application/json"
  })));
}
const CURRENT_STATE_VERSION = 5;
function stateVersionOf(value) {
  const version = Number(value?.version || 0);
  return Number.isFinite(version) && version > 0 ? version : 0;
}
function cloneForMigration(value) {
  if (!value || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {
      ...value
    };
  }
}
function migrateToV5(state) {
  const next = cloneForMigration(state);
  if (!next || typeof next !== "object") return next;
  if (!Array.isArray(next.boxNodes) && Array.isArray(next.nodes)) next.boxNodes = next.nodes;
  if (!Array.isArray(next.boxNodes)) next.boxNodes = [];
  if (!Array.isArray(next.actionDays)) next.actionDays = [];
  if (!Array.isArray(next.notes)) next.notes = [];
  if (!Array.isArray(next.noteLinks)) next.noteLinks = [];
  if (!next.ui || typeof next.ui !== "object" || Array.isArray(next.ui)) next.ui = {};
  if (!next.meta || typeof next.meta !== "object" || Array.isArray(next.meta)) next.meta = {};
  next.version = CURRENT_STATE_VERSION;
  return next;
}
function migrateState(raw) {
  if (!raw || typeof raw !== "object") return raw;
  let next = cloneForMigration(raw);
  const version = stateVersionOf(next);
  if (version < CURRENT_STATE_VERSION) next = migrateToV5(next);
  if (stateVersionOf(next) < CURRENT_STATE_VERSION) next.version = CURRENT_STATE_VERSION;
  return next;
}
let idSequence = 0;
const runtimeUsedIds = new Set();
const HISTORY_LIMIT = 30;
function now() {
  return new Date().toISOString();
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function cleanTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || "Untitled";
}
function cleanOptionalTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function clampLevel(value) {
  return Math.max(1, Math.min(5, Number(value) || 1));
}
function safeNoteColor(value) {
  const raw = String(value || "").trim();
  const hex = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const value = hex[1].length === 3 ? hex[1].split("").map(char => char + char).join("") : hex[1];
    return `#${value.toLowerCase()}`;
  }
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,\/.0-9]+)?\)$/i);
  if (!rgb) return "";
  const parts = rgb.slice(1, 4).map(part => Math.max(0, Math.min(255, Number(part) || 0)));
  return `#${parts.map(part => part.toString(16).padStart(2, "0")).join("")}`;
}
function noteColorFromStyle(value) {
  const match = String(value || "").match(/color\s*:\s*([^;]+)/i);
  return safeNoteColor(match?.[1] || "");
}
function timestampMs(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}
function validTimestamp(value) {
  return timestampMs(value) ? String(value) : "";
}
function rememberId(id) {
  if (id) runtimeUsedIds.add(String(id));
  return String(id || "");
}
function uid(prefix = "id") {
  const safe = String(prefix || "id").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "id";
  let id = "";
  do {
    idSequence += 1;
    const random = window.crypto?.getRandomValues ? Array.from(window.crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, "0")).join("") : Math.random().toString(36).slice(2, 12);
    id = `${safe}_${Date.now()}_${String(idSequence).padStart(5, "0")}_${random}`;
  } while (runtimeUsedIds.has(id));
  runtimeUsedIds.add(id);
  return id;
}
function sanitizeHtml(input) {
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "BR", "DIV", "P", "SPAN", "UL", "OL", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "TABLE", "TBODY", "THEAD", "TR", "TH", "TD"]);
  const indentable = new Set(["DIV", "P", "H1", "H2", "H3"]);
  const listable = new Set(["UL", "OL"]);
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
            if (level > 0) child.setAttribute("data-indent", String(level));else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-size" && child.tagName === "P") {
            const size = String(attr.value || "").toLowerCase();
            if (size === "small") child.setAttribute("data-size", "small");else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-note-color" && child.tagName === "SPAN") {
            const color = safeNoteColor(attr.value);
            if (color) {
              child.setAttribute("data-note-color", color);
              child.setAttribute("style", `color: ${color}`);
            } else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "style" && child.tagName === "SPAN") {
            const color = noteColorFromStyle(attr.value);
            if (color) {
              child.setAttribute("data-note-color", color);
              child.setAttribute("style", `color: ${color}`);
            } else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-type" && child.tagName === "UL") {
            if (String(attr.value || "") === "task-list") child.setAttribute("data-type", "task-list");else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-list-depth" && listable.has(child.tagName)) {
            const depth = Math.max(0, Math.min(4, Number(attr.value) || 0));
            if (depth > 0) child.setAttribute("data-list-depth", String(depth));else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-list-style" && child.tagName === "UL") {
            const style = String(attr.value || "").toLowerCase();
            if (bulletStyles.has(style)) child.setAttribute("data-list-style", style);else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-list-style" && child.tagName === "OL") {
            const style = String(attr.value || "").toLowerCase();
            if (orderedStyles.has(style)) child.setAttribute("data-list-style", style);else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "start" && child.tagName === "OL") {
            const start = Math.max(1, Math.min(999, Number(attr.value) || 1));
            if (start > 1) child.setAttribute("start", String(start));else child.removeAttribute(attr.name);
            return;
          }
          if (attr.name === "data-type" && child.tagName === "LI") {
            if (String(attr.value || "") === "task-item") child.setAttribute("data-type", "task-item");else child.removeAttribute(attr.name);
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
function boxNoteId(boxId) {
  return `boxnote_${boxId}`;
}
function boxNoteLinkId(boxId) {
  return `link_box_${boxId}`;
}
function actionNoteId(entryId) {
  return `actionnote_${entryId}`;
}
function actionNoteLinkId(entryId) {
  return `link_action_${entryId}`;
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
    notesView: "linked",
    notesTag: "",
    notesDate: "all",
    notesTagsInput: "",
    notesDatesInput: "",
    selectedBoxNoteId: "",
    workspaceName: "Liem's Planner",
    logoStyle: 0,
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
    meta: {
      usedIds: [content, sales, tiktok, blog, follow]
    },
    boxNodes: [{
      id: content,
      parentId: null,
      level: 1,
      title: "Content",
      sort: 1,
      boxNoteTitle: "",
      boxNoteHtml: "",
      archivedAt: null,
      doneAt: null,
      createdAt: t,
      updatedAt: t
    }, {
      id: sales,
      parentId: null,
      level: 1,
      title: "Sales",
      sort: 2,
      boxNoteTitle: "",
      boxNoteHtml: "",
      archivedAt: null,
      doneAt: null,
      createdAt: t,
      updatedAt: t
    }, {
      id: tiktok,
      parentId: content,
      level: 2,
      title: "TikTok",
      sort: 1,
      boxNoteTitle: "",
      boxNoteHtml: "",
      archivedAt: null,
      doneAt: null,
      createdAt: t,
      updatedAt: t
    }, {
      id: blog,
      parentId: content,
      level: 2,
      title: "Blog",
      sort: 2,
      boxNoteTitle: "",
      boxNoteHtml: "",
      archivedAt: null,
      doneAt: null,
      createdAt: t,
      updatedAt: t
    }, {
      id: follow,
      parentId: sales,
      level: 2,
      title: "Follow up",
      sort: 1,
      boxNoteTitle: "",
      boxNoteHtml: "",
      archivedAt: null,
      doneAt: null,
      createdAt: t,
      updatedAt: t
    }],
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
  return htmlToText(legacy) ? [normalizeEntry({
    type: "note",
    title: "Note",
    bodyHtml: legacy
  })] : [];
}
function normalizeNote(note, index = 0) {
  const t = now();
  const bodyHtml = sanitizeHtml(note?.bodyHtml || note?.body_html || note?.contentHtml || note?.body || "");
  const title = cleanOptionalTitle(note?.title || "") || (noteBodyText({
    bodyHtml
  }) ? "Untitled" : "");
  const bodyText = noteBodyText({
    bodyHtml,
    bodyText: note?.bodyText || note?.body_text || ""
  });
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
  const type = ["box", "action_node", "action_entry", "day"].includes(link?.linkType || link?.link_type) ? link.linkType || link.link_type : "box";
  return {
    id: rememberId(link?.id || uid("notelink")),
    noteId: rememberId(link?.noteId || link?.note_id || ""),
    linkType: type,
    boxNodeId: link?.boxNodeId || link?.box_node_id || null,
    actionDate: validYMD(link?.actionDate || link?.action_date) ? link.actionDate || link.action_date : null,
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
  if (existing) Object.assign(existing, normalized);else state.noteLinks.push(normalized);
}
function upsertLegacyNote(state, note, link) {
  if (!note?.id || !noteHasContent(note)) return;
  const normalized = normalizeNote(note, state.notes?.length || 0);
  const existing = (state.notes || []).find(item => item.id === normalized.id);
  if (!existing) state.notes.push(normalized);
  upsertNoteLink(state, {
    ...link,
    noteId: normalized.id
  });
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
        if (!noteHasContent({
          title: entry.title,
          bodyHtml: entry.bodyHtml
        })) return;
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
  (notes || []).forEach(note => {
    if (note?.id) ids.add(note.id);
  });
  (noteLinks || []).forEach(link => {
    if (link?.id) ids.add(link.id);
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
  const cloudTime = Math.max(timestampMs(cloudUpdatedAt), timestampMs(cloudState.meta?.cloudUpdatedAt), timestampMs(cloudState.meta?.lastSyncedAt));
  return localTime > cloudTime;
}
function normalizeState(parsed) {
  parsed = typeof migrateState === "function" ? migrateState(parsed) : parsed;
  if (!parsed || typeof parsed !== "object") return seed();
  const hasSourceNodes = Array.isArray(parsed.boxNodes) || Array.isArray(parsed.nodes);
  const fallback = hasSourceNodes ? null : seed();
  const ui = {
    ...defaultUI(),
    ...(parsed.ui || {})
  };
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
  const state = ensureCentralNotes({
    version: CURRENT_STATE_VERSION,
    boxNodes,
    actionDays,
    notes,
    noteLinks,
    ui
  });
  const ids = collectStateIds(state.boxNodes, state.actionDays, state.notes, state.noteLinks);
  const normalized = {
    ...state,
    version: CURRENT_STATE_VERSION,
    meta: normalizeMeta(parsed.meta || {}, ids)
  };
  return typeof repairStateIntegrity === "function" ? repairStateIntegrity(normalized) : normalized;
}
function sanitizedState(state) {
  const normalized = normalizeState(clone(state));
  const clean = {
    version: CURRENT_STATE_VERSION,
    meta: normalizeMeta(normalized.meta || {}, new Set(normalized.meta?.usedIds || [])),
    boxNodes: normalized.boxNodes.map(n => ({
      ...n,
      title: cleanTitle(n.title),
      boxNoteTitle: cleanOptionalTitle(n.boxNoteTitle || ""),
      boxNoteHtml: sanitizeHtml(n.boxNoteHtml || "")
    })),
    actionDays: normalized.actionDays.map(day => ({
      ...day,
      nodes: day.nodes.map(n => ({
        ...n,
        title: cleanTitle(n.title),
        entries: normalizeEntries(n)
      }))
    })),
    notes: normalized.notes.map(note => normalizeNote(note)).filter(note => noteHasContent(note) || note.deletedAt),
    noteLinks: normalized.noteLinks.map(normalizeNoteLink).filter(link => link.noteId),
    ui: {
      ...defaultUI(),
      ...(normalized.ui || {})
    }
  };
  return typeof repairStateIntegrity === "function" ? repairStateIntegrity(clean) : clean;
}
function mergeById(currentItems = [], importedItems = []) {
  const byId = new Map();
  currentItems.forEach(item => {
    if (item?.id) byId.set(item.id, item);
  });
  importedItems.forEach(item => {
    if (item?.id) byId.set(item.id, item);
  });
  return [...byId.values()];
}
function mergeActionDayNodes(currentNodes = [], importedNodes = []) {
  const keyOf = node => node?.sourceBoxNodeId ? `source:${node.sourceBoxNodeId}` : `id:${node?.id}`;
  const byKey = new Map();
  currentNodes.forEach(node => {
    if (node?.id) byKey.set(keyOf(node), node);
  });
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
  currentDays.forEach(day => {
    if (day?.date) byDate.set(day.date, day);
  });
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
function localKey(userId) {
  return userId ? `${STORAGE_KEY}:${userId}` : `${STORAGE_KEY}:guest`;
}
function loadLocalForUser(userId) {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
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
  try {
    const payload = JSON.stringify(sanitizedState(state));
    maybeWarnLargeSnapshot(payload);
    localStorage.setItem(localKey(userId), payload);
  } catch {}
}
function snapshotPayloadBytes(payload) {
  try {
    return new Blob([payload]).size;
  } catch {
    return String(payload || "").length;
  }
}
function maybeWarnLargeSnapshot(payload) {
  const bytes = snapshotPayloadBytes(payload);
  if (bytes < SNAPSHOT_WARN_BYTES) return;
  const t = Date.now();
  if (t - lastSnapshotSizeWarningAt < 60000) return;
  lastSnapshotSizeWarningAt = t;
  console.warn(`Planner snapshot is ${(bytes / 1048576).toFixed(2)}MB. Long-term storage should move daily action entries out of the full snapshot.`);
}
function canUseCloudSync(user, online = navigator.onLine) {
  return Boolean(sb && user?.id && user.id !== "local" && online);
}
async function loadCloudWorkspace(userId) {
  if (!sb || !userId || userId === "local") return null;
  const {
    data,
    error
  } = await withTimeout(sb.from(STATE_TABLE).select("data,updated_at").eq("user_id", userId).maybeSingle(), CLOUD_READ_TIMEOUT_MS, "Workspace load");
  if (error) throw error;
  if (!data?.data) return null;
  return {
    data: data.data,
    updatedAt: data.updated_at
  };
}
async function saveCloudWorkspace(userId, snapshot, updatedAt) {
  if (!sb || !userId || userId === "local") return {
    skipped: true
  };
  const result = await withTimeout(sb.from(STATE_TABLE).upsert({
    user_id: userId,
    data: snapshot,
    updated_at: updatedAt
  }, {
    onConflict: "user_id"
  }), CLOUD_WRITE_TIMEOUT_MS, "Workspace save");
  if (result?.error) throw result.error;
  return result || {
    ok: true
  };
}
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
    const [notesResult, linksResult] = await Promise.all([withTimeout(sb.from(NOTES_TABLE).select("*").eq("user_id", userId), CLOUD_READ_TIMEOUT_MS, "Notes load"), withTimeout(sb.from(NOTE_LINKS_TABLE).select("*").eq("user_id", userId), CLOUD_READ_TIMEOUT_MS, "Note links load")]);
    if (notesResult?.error || linksResult?.error) throw notesResult?.error || linksResult?.error;
    return {
      notes: notesResult.data || [],
      links: linksResult.data || []
    };
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
    const [existingNotesResult, existingLinksResult] = await Promise.all([withTimeout(sb.from(NOTES_TABLE).select("id").eq("user_id", user.id), CLOUD_READ_TIMEOUT_MS, "Notes mirror list"), withTimeout(sb.from(NOTE_LINKS_TABLE).select("id").eq("user_id", user.id), CLOUD_READ_TIMEOUT_MS, "Note links mirror list")]);
    if (existingNotesResult?.error || existingLinksResult?.error) throw existingNotesResult?.error || existingLinksResult?.error;
    const noteIds = new Set(notes.map(row => row.id));
    const linkIds = new Set(links.map(row => row.id));
    const staleLinkIds = (existingLinksResult.data || []).map(row => row.id).filter(id => !linkIds.has(id));
    const staleNoteIds = (existingNotesResult.data || []).map(row => row.id).filter(id => !noteIds.has(id));
    if (staleLinkIds.length) {
      const deleteLinks = await withTimeout(sb.from(NOTE_LINKS_TABLE).delete().eq("user_id", user.id).in("id", staleLinkIds), CLOUD_WRITE_TIMEOUT_MS, "Note links mirror prune");
      if (deleteLinks?.error) throw deleteLinks.error;
    }
    if (notes.length) {
      const notesResult = await withTimeout(sb.from(NOTES_TABLE).upsert(notes, {
        onConflict: "user_id,id"
      }), CLOUD_WRITE_TIMEOUT_MS, "Notes mirror");
      if (notesResult?.error) throw notesResult.error;
    }
    if (staleNoteIds.length) {
      const deleteNotes = await withTimeout(sb.from(NOTES_TABLE).delete().eq("user_id", user.id).in("id", staleNoteIds), CLOUD_WRITE_TIMEOUT_MS, "Notes mirror prune");
      if (deleteNotes?.error) throw deleteNotes.error;
    }
    if (links.length) {
      const linksResult = await withTimeout(sb.from(NOTE_LINKS_TABLE).upsert(links, {
        onConflict: "user_id,id"
      }), CLOUD_WRITE_TIMEOUT_MS, "Note links mirror");
      if (linksResult?.error) throw linksResult.error;
    }
  } catch (error) {
    console.warn("Normalized notes table sync skipped", error);
  }
}
function noteTitle(entry) {
  return cleanTitle(entry?.title || "Note");
}
function entryText(entry) {
  const base = entry?.type === "note" ? `${noteTitle(entry)} ${htmlToText(entry.bodyHtml || "")}`.trim() : String(entry?.text || "").trim();
  const inlineTags = new Set(tagsFromText(base));
  const extraTags = entryTagList(entry).filter(tag => !inlineTags.has(tag)).map(tag => `#${tag}`).join(" ");
  return `${base} ${extraTags}`.trim();
}
function boxHasNote(node) {
  return Boolean(cleanOptionalTitle(node?.boxNoteTitle || "") || htmlToText(node?.boxNoteHtml || ""));
}
function boxNoteLabel(node) {
  return cleanOptionalTitle(node?.boxNoteTitle || "") || "Note";
}
function getNote(state, noteId) {
  return (state.notes || []).find(note => note.id === noteId);
}
function noteLinksFor(state, noteId) {
  return (state.noteLinks || []).filter(link => link.noteId === noteId);
}
function noteIsLinked(state, noteId) {
  return noteLinksFor(state, noteId).length > 0;
}
function noteDisplayTitle(note) {
  return cleanOptionalTitle(note?.title || "") || "Untitled";
}
function notePreview(note) {
  return noteBodyText(note).slice(0, 140);
}
function activeNoteById(state, noteId) {
  const note = getNote(state, noteId);
  return note && !note.deletedAt && !note.archivedAt && noteHasContent(note) ? note : null;
}
function noteBoxLinkInfo(state, noteId) {
  const link = noteLinksFor(state, noteId).find(item => item.linkType === "box" && item.boxNodeId);
  const box = link ? getNode(state.boxNodes || [], link.boxNodeId) : null;
  return box ? {
    link,
    box,
    level: clampLevel(box.level || (box.parentId ? 2 : 1))
  } : null;
}
function activeNotes(state) {
  return (state.notes || []).filter(note => !note.deletedAt && !note.archivedAt && noteHasContent(note));
}
function boxNoteLinksFor(state, boxId) {
  return (state.noteLinks || []).filter(link => link.linkType === "box" && link.boxNodeId === boxId).sort((a, b) => (a.sort || 0) - (b.sort || 0));
}
function boxNotesFor(state, boxId) {
  const seen = new Set();
  return boxNoteLinksFor(state, boxId).map(link => activeNoteById(state, link.noteId)).filter(note => {
    if (!note || seen.has(note.id)) return false;
    seen.add(note.id);
    return true;
  }).sort((a, b) => b.noteDate.localeCompare(a.noteDate) || timestampMs(b.updatedAt) - timestampMs(a.updatedAt));
}
function boxNoteCount(state, boxId) {
  return boxNotesFor(state, boxId).length;
}
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
    return {
      type: "action_node",
      date: actionNodeLink.actionDate,
      actionNodeId: actionNodeLink.actionNodeId,
      day,
      node,
      link: actionNodeLink
    };
  }
  const dayLink = links.find(link => link.linkType === "day" && link.actionDate && (state.actionDays || []).some(item => item.date === link.actionDate));
  return dayLink ? {
    type: "day",
    date: dayLink.actionDate,
    day: (state.actionDays || []).find(item => item.date === dayLink.actionDate),
    link: dayLink
  } : null;
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
      return from && to ? {
        type: "range",
        from: from <= to ? from : to,
        to: from <= to ? to : from
      } : null;
    }
    const date = parseUserDate(part);
    return date ? {
      type: "date",
      date
    } : null;
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
  return activeNotes(state).filter(note => view === "all" || (view === "linked" ? noteIsLinked(state, note.id) : !noteIsLinked(state, note.id))).filter(note => !tags.length || tags.every(tag => noteTagList(note).includes(tag))).filter(note => dateFilters.length ? noteMatchesExportDates(note, dateFilters) : noteInDateFilter(note, state.ui.notesDate || "all")).sort((a, b) => {
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
  return [...groups.entries()].map(([date, items]) => ({
    date,
    items
  }));
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
  state.ui = {
    ...defaultUI(),
    ...(state.ui || {})
  };
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
function useBoxActions({
  db,
  setDb,
  commit
}) {
  function createRootBox() {
    commit("Create box", state => {
      const t = now();
      state.ui.boxView = "active";
      state.boxNodes.push({
        id: uid("box"),
        parentId: null,
        level: 1,
        title: "Untitled",
        sort: childrenOf(null, state.boxNodes).length + 1,
        boxNoteTitle: "",
        boxNoteHtml: "",
        archivedAt: null,
        doneAt: null,
        createdAt: t,
        updatedAt: t
      });
    });
  }
  function addSub(targetId) {
    commit("Create sub", state => {
      const target = getNode(state.boxNodes, targetId);
      if (!target || boxIsInactive(target)) return false;
      const t = now();
      const isRootTarget = target.level === 1;
      const parentId = isRootTarget ? target.id : target.parentId ?? null;
      const level = isRootTarget ? target.level + 1 : target.level;
      if (level > 5) return false;
      const siblings = childrenOf(parentId, state.boxNodes);
      const child = {
        id: uid("sub"),
        parentId,
        level,
        title: "Untitled",
        sort: siblings.length + 1,
        boxNoteTitle: "",
        boxNoteHtml: "",
        archivedAt: null,
        doneAt: null,
        createdAt: t,
        updatedAt: t
      };
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
      if (isRootTarget) state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => id !== target.id);else {
        const parent = getNode(state.boxNodes, parentId);
        if (parent?.level === 1) state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => id !== parent.id);else if (parent?.id) state.ui.expandedBoxNodes = [...new Set([...(state.ui.expandedBoxNodes || []), parent.id])];
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
    }, {
      sync: false
    });
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
      next.ui.boxCascadeModes = {
        ...normalizeModeMap(next.ui.boxCascadeModes),
        [id]: plan.nextMode
      };
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
    }, {
      sync: false
    });
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
      next.forEach((n, index) => {
        n.sort = index + 1;
        n.updatedAt = now();
      });
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
function useNoteActions({
  db,
  commit,
  setModal,
  flashAfterNavigation,
  notesForView,
  showToast
}) {
  function upsertCentralNote(state, {
    noteId,
    title,
    bodyHtml,
    noteDate,
    link
  }) {
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
    if (existing) Object.assign(existing, cleanNote, {
      id,
      createdAt: existing.createdAt || cleanNote.createdAt
    });else state.notes.push(cleanNote);
    if (link) upsertNoteLink(state, {
      ...link,
      noteId: id
    });
    return id;
  }
  function saveCentralNote({
    noteId,
    title,
    bodyHtml,
    noteDate,
    link
  }) {
    let savedId = noteId;
    commit("Save note", state => {
      savedId = upsertCentralNote(state, {
        noteId,
        title,
        bodyHtml,
        noteDate,
        link
      });
      syncNoteToLinkedLegacy(state, savedId);
      state.ui.notesView = link ? "linked" : state.ui.notesView || "free";
    }, {
      sync: false
    });
    setModal(null);
    if (savedId) flashAfterNavigation({
      type: "note",
      id: savedId
    });
  }
  function deleteCentralNote({
    noteId
  }) {
    if (!noteId) {
      setModal(null);
      return;
    }
    commit("Delete note", state => {
      const note = getNote(state, noteId);
      if (!note) return false;
      syncNoteToLinkedLegacy(state, noteId, true);
      note.deletedAt = now();
      note.updatedAt = note.deletedAt;
      note.clientUpdatedAt = note.deletedAt;
      state.noteLinks = (state.noteLinks || []).filter(link => link.noteId !== noteId);
    }, {
      sync: false
    });
    setModal(null);
  }
  function saveBoxNote({
    boxId,
    title,
    bodyHtml
  }) {
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
        link: {
          id: boxNoteLinkId(boxId),
          linkType: "box",
          boxNodeId: boxId
        }
      });
    });
    setModal(null);
  }
  function deleteBoxNote({
    boxId
  }) {
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
      return [`# ${noteDisplayTitle(note)}`, "", `Date: ${note.noteDate}`, `Type: ${links.length ? "Linked" : "Free"}`, links.length ? `Linked: ${links.join("; ")}` : "", tags ? `Tags: ${tags}` : "", "", noteBodyText(note) || "(empty)", ""].filter(line => line !== "").join("\n");
    }).join("\n---\n\n");
    const blob = new Blob([markdown], {
      type: "text/markdown"
    });
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
        day = {
          id: uid("day"),
          date: ymd,
          createdAt: t,
          updatedAt: t,
          nodes: []
        };
        state.actionDays.push(day);
      }
      syncActionDayWithBox(state, day);
    }, {
      sync: false
    });
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
      next.ui.actionCascadeModes = {
        ...normalizeModeMap(next.ui.actionCascadeModes),
        [id]: plan.nextMode
      };
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
    if (entryId) flashAfterNavigation({
      type: "entry",
      id: entryId
    });else if (actionNodeId) flashAfterNavigation({
      type: "action",
      id: actionNodeId
    });
  }
  function addActionEntries(dayId, nodeId, lines) {
    const cleaned = String(lines || "").split(/\n+/).map(cleanTitle).filter(Boolean);
    if (!cleaned.length) {
      setModal(null);
      return;
    }
    commit("Add actions", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const t = now();
      node.entries = normalizeEntries(node);
      cleaned.forEach(text => node.entries.push(normalizeEntry({
        type: "action",
        text,
        createdAt: t,
        updatedAt: t
      }, node.entries.length)));
      node.updatedAt = t;
      day.updatedAt = t;
      state.ui.actionFilter = "all";
      state.ui.collapsedActionNodes = (state.ui.collapsedActionNodes || []).filter(id => id !== nodeId);
    }, {
      sync: false
    });
    setModal(null);
  }
  function saveActionNote({
    dayId,
    nodeId,
    entryId,
    title,
    bodyHtml
  }) {
    commit("Save action note", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const t = now();
      node.entries = normalizeEntries(node);
      const entry = entryId ? node.entries.find(e => e.id === entryId) : null;
      let savedEntryId = entry?.id || null;
      if (entry) {
        entry.title = cleanTitle(title || "Note");
        entry.bodyHtml = sanitizeHtml(bodyHtml || "");
        entry.tags = entryTagList(entry);
        entry.updatedAt = t;
      } else {
        const nextEntry = normalizeEntry({
          type: "note",
          title: title || "Note",
          bodyHtml,
          createdAt: t,
          updatedAt: t
        }, node.entries.length);
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
    }, {
      sync: false
    });
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
  function deleteActionNote({
    dayId,
    nodeId,
    entryId
  }) {
    if (!entryId) {
      setModal(null);
      return;
    }
    commit("Delete action note", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      const entry = node ? entriesFor(node).find(e => e.id === entryId) : null;
      if (!day || !node || !entry || entry.type !== "note") return false;
      node.entries = normalizeEntries(node).filter(e => e.id !== entryId);
      deleteActionNoteMirror(state, entryId);
      node.updatedAt = now();
      day.updatedAt = now();
    }, {
      sync: false
    });
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
    }, {
      sync: false
    });
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
    }, {
      sync: false
    });
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
    }, {
      sync: false
    });
  }
  function doneAllEntries(dayId, nodeId) {
    commit("Done entries", state => {
      const day = state.actionDays.find(d => d.id === dayId);
      const node = day ? getNode(day.nodes, nodeId) : null;
      if (!day || !node) return false;
      const actions = actionEntriesFor(node);
      if (!actions.length) return false;
      const shouldDone = actions.some(e => !e.done);
      node.entries = normalizeEntries(node).map(e => e.type === "action" ? {
        ...e,
        done: shouldDone,
        updatedAt: now()
      } : e);
      node.updatedAt = now();
      day.updatedAt = now();
    }, {
      sync: false
    });
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
    }, {
      sync: false
    });
  }
  return {
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
  };
}
const SYNC_STATUS_VALUES = new Set(["saved", "saving", "pending", "offline", "error"]);
const SYNC_STUCK_TIMEOUT_MS = 18000;
function normalizeSyncStatus(status, online = navigator.onLine) {
  const value = SYNC_STATUS_VALUES.has(status) ? status : online ? "saved" : "offline";
  if (!online && value !== "saving" && value !== "error") return "offline";
  return value;
}
function syncLabelFor(status, online = navigator.onLine) {
  const value = normalizeSyncStatus(status, online);
  if (value === "saving") return "Saving";
  if (value === "pending") return "Pending";
  if (value === "offline") return "Local saved";
  if (value === "error") return "Sync error";
  return "Saved";
}
function syncStatusFromSnapshot(snapshot, user, online = navigator.onLine) {
  if (snapshot?.meta?.pendingSync) {
    if (!sb || !user?.id || user.id === "local" || !online) return "offline";
    return "pending";
  }
  return online ? "saved" : "offline";
}
function useSyncStatusMachine(initialStatus = navigator.onLine ? "saved" : "offline") {
  const [syncStatus, setRawSyncStatus] = useState(() => normalizeSyncStatus(initialStatus));
  const [syncLabel, setRawSyncLabel] = useState(() => syncLabelFor(initialStatus));
  const savingStartedAtRef = useRef(0);
  function setSyncState(status, label) {
    const normalized = normalizeSyncStatus(status);
    savingStartedAtRef.current = normalized === "saving" ? Date.now() : 0;
    setRawSyncStatus(normalized);
    setRawSyncLabel(label || syncLabelFor(normalized));
  }
  function setSyncStatus(status) {
    const normalized = normalizeSyncStatus(status);
    savingStartedAtRef.current = normalized === "saving" ? Date.now() : 0;
    setRawSyncStatus(normalized);
  }
  function setSyncLabel(label) {
    setRawSyncLabel(String(label || ""));
  }
  useEffect(() => {
    if (syncStatus !== "saving") return undefined;
    const timer = window.setTimeout(() => {
      if (!savingStartedAtRef.current) return;
      if (Date.now() - savingStartedAtRef.current < SYNC_STUCK_TIMEOUT_MS) return;
      setSyncState(navigator.onLine ? "pending" : "offline");
    }, SYNC_STUCK_TIMEOUT_MS + 250);
    return () => window.clearTimeout(timer);
  }, [syncStatus]);
  return {
    syncStatus,
    syncLabel,
    setSyncStatus,
    setSyncLabel,
    setSyncState
  };
}
function useCloudSync({
  db,
  setDb,
  currentUser,
  setBooting,
  setRuntimeFromRoute,
  setSyncStatus,
  setSyncLabel,
  showToast
}) {
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const cloudTimerRef = useRef(null);
  const skipNextAutoSaveRef = useRef(false);
  async function hydrateUserState(user) {
    const userId = user?.id;
    const localState = loadLocalForUser(userId) || loadLegacyLocal();
    let next = localState || seed();
    let usedCloudFallback = false;
    let allowCloudNotes = true;
    if (sb && userId) {
      try {
        setSyncStatus("saving");
        setSyncLabel("Loading");
        const stateRow = await loadCloudWorkspace(userId);
        if (stateRow?.data) {
          const cloudUpdatedAt = validTimestamp(stateRow.updatedAt) || validTimestamp(stateRow.data?.meta?.cloudUpdatedAt);
          const cloudState = markCloudSynced(normalizeState(stateRow.data), cloudUpdatedAt || now());
          const preferLocal = shouldPreferLocal(localState, cloudState, cloudUpdatedAt);
          allowCloudNotes = !preferLocal;
          next = preferLocal ? markPendingSync(localState, localState?.meta?.localUpdatedAt || now()) : cloudState;
        } else if (localState && userId !== "local") {
          next = markPendingSync(localState, localState.meta?.localUpdatedAt || now());
          allowCloudNotes = false;
        }
        if (allowCloudNotes) {
          const normalizedNotes = await loadNormalizedNoteTables(userId);
          if (normalizedNotes) next = mergeNormalizedNotes(next, normalizedNotes.notes, normalizedNotes.links);
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
  function scheduleCloudSync(snapshot, user, delay = 850) {
    const clean = sanitizedState(snapshot);
    clearTimeout(cloudTimerRef.current);
    if (!clean.meta?.pendingSync) {
      setSyncStatus(navigator.onLine ? "saved" : "offline");
      setSyncLabel(navigator.onLine ? "Saved" : "Local saved");
      return;
    }
    if (!canUseCloudSync(user)) {
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      return;
    }
    setSyncStatus("saving");
    setSyncLabel("Saving");
    cloudTimerRef.current = setTimeout(() => pushCloudState(clean, user), delay);
  }
  function reconcileSyncStatus(delay = 200) {
    if (!hydratedRef.current || !currentUser) return;
    const clean = sanitizedState(db);
    const localState = loadLocalForUser(currentUser.id);
    let snapshot = clean;
    if (localState) {
      const localClean = normalizeState(localState);
      const localTime = timestampMs(localClean.meta?.localUpdatedAt);
      const cleanTime = timestampMs(clean.meta?.localUpdatedAt);
      const localSettledSameEdit = localTime >= cleanTime && !localClean.meta?.pendingSync && clean.meta?.pendingSync;
      const localHasNewerEdit = localTime > cleanTime && localClean.meta?.pendingSync;
      if (localSettledSameEdit) {
        snapshot = normalizeState({
          ...clean,
          meta: {
            ...clean.meta,
            pendingSync: false,
            cloudUpdatedAt: localClean.meta?.cloudUpdatedAt || clean.meta?.cloudUpdatedAt,
            lastSyncedAt: localClean.meta?.lastSyncedAt || clean.meta?.lastSyncedAt
          }
        });
        setDb(snapshot);
      } else if (localHasNewerEdit) {
        snapshot = localClean;
        setDb(localClean);
      }
    }
    scheduleCloudSync(snapshot, currentUser, delay);
  }
  async function pushCloudState(snapshot, user, options = {}) {
    if (!canUseCloudSync(user)) {
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
      await saveCloudWorkspace(user.id, cloudSnapshot, syncedAt);
      await pushNormalizedNoteTables(cloudSnapshot, user);
      const currentLocal = loadLocalForUser(user.id);
      const pushedTime = timestampMs(cloudSnapshot.meta?.localUpdatedAt);
      const hasNewerLocalEdit = Boolean(currentLocal?.meta?.pendingSync && timestampMs(currentLocal.meta?.localUpdatedAt) > pushedTime);
      if (!hasNewerLocalEdit) {
        saveLocal(cloudSnapshot, user.id);
      }
      setDb(prev => {
        const current = normalizeState(prev);
        if (timestampMs(current.meta?.localUpdatedAt) > pushedTime && current.meta?.pendingSync) return current;
        return normalizeState({
          ...current,
          meta: {
            ...current.meta,
            pendingSync: false,
            cloudUpdatedAt: syncedAt,
            lastSyncedAt: syncedAt
          }
        });
      });
      if (hasNewerLocalEdit) {
        setSyncStatus("saving");
        setSyncLabel("Saving");
        clearTimeout(cloudTimerRef.current);
        cloudTimerRef.current = setTimeout(() => pushCloudState(currentLocal, user), 850);
      } else {
        setSyncStatus("saved");
        setSyncLabel("Saved");
      }
    } catch (error) {
      console.warn(error);
      setSyncStatus("offline");
      setSyncLabel("Local saved");
    }
  }
  function syncNow() {
    saveLocal(db, currentUser?.id);
    if (!canUseCloudSync(currentUser)) {
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      showToast?.("Saved locally");
      return;
    }
    setSyncStatus("saving");
    setSyncLabel("Saving");
    clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = setTimeout(() => pushCloudState(db, currentUser, {
      force: true
    }), 500);
  }
  useEffect(() => {
    if (!hydratedRef.current || !currentUser) return;
    const clean = sanitizedState(db);
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      saveLocal(clean, currentUser.id);
      clearTimeout(saveTimerRef.current);
      clearTimeout(cloudTimerRef.current);
      setSyncStatus("offline");
      setSyncLabel("Local saved");
      return;
    }
    saveLocal(clean, currentUser.id);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveLocal(clean, currentUser.id), 120);
    scheduleCloudSync(clean, currentUser, 850);
  }, [db, currentUser?.id]);
  useEffect(() => {
    const online = () => reconcileSyncStatus(150);
    const offline = () => {
      clearTimeout(cloudTimerRef.current);
      setSyncStatus("offline");
      setSyncLabel("Local saved");
    };
    const resume = () => {
      if (document.visibilityState === "hidden") {
        const clean = sanitizedState(db);
        if (!clean.meta?.pendingSync) clearTimeout(cloudTimerRef.current);
        return;
      }
      reconcileSyncStatus(150);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [db, currentUser?.id]);
  return {
    hydratedRef,
    hydrateUserState,
    scheduleCloudSync,
    reconcileSyncStatus,
    pushCloudState,
    syncNow
  };
}
function usePlannerHistory(setDb, syncBeforeSave) {
  const [historyTick, setHistoryTick] = useState(0);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  function pushHistory(stack, snapshot) {
    stack.push(snapshot);
    if (stack.length > HISTORY_LIMIT) stack.shift();
  }
  function commit(label, mutator, options = {}) {
    setDb(prev => {
      const before = sanitizedState(prev);
      const next = normalizeState(clone(prev));
      const changed = mutator(next);
      if (changed === false) return prev;
      if (options.sync !== false) syncBeforeSave?.(next);
      pushHistory(undoRef.current, before);
      redoRef.current = [];
      setHistoryTick(t => t + 1);
      return markPendingSync(next);
    });
  }
  function undo() {
    if (!undoRef.current.length) return;
    setDb(prev => {
      pushHistory(redoRef.current, sanitizedState(prev));
      const snap = undoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }
  function redo() {
    if (!redoRef.current.length) return;
    setDb(prev => {
      pushHistory(undoRef.current, sanitizedState(prev));
      const snap = redoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }
  return {
    historyTick,
    undoRef,
    redoRef,
    commit,
    undo,
    redo
  };
}
function toggleId(list, id) {
  const set = new Set(list || []);
  set.has(id) ? set.delete(id) : set.add(id);
  return [...set];
}
function floatingMenuMeta(trigger, estimatedHeight = 220) {
  const rect = trigger?.getBoundingClientRect?.();
  if (!rect) return {
    direction: "down",
    maxHeight: estimatedHeight
  };
  const bottomSpace = window.innerHeight - rect.bottom;
  const topSpace = rect.top;
  const direction = bottomSpace < estimatedHeight && topSpace > bottomSpace ? "up" : "down";
  const available = direction === "up" ? topSpace - 16 : bottomSpace - 16;
  return {
    direction,
    maxHeight: Math.max(112, Math.min(estimatedHeight, available))
  };
}
function floatingMenuPositionClass(meta) {
  return meta?.direction === "up" ? "bottom-full mb-1.5 origin-bottom-right" : "top-full mt-1.5 origin-top-right";
}
function actionDayHasEntriesForBoxSubtree(state, day, boxId) {
  const ids = new Set([boxId, ...descendantsOf(boxId, state.boxNodes).map(n => n.id)]);
  return (day.nodes || []).some(node => ids.has(node.sourceBoxNodeId) && entriesFor(node).length);
}
function syncActionDayWithBox(state, day) {
  if (!day) return false;
  const before = JSON.stringify((day.nodes || []).map(n => ({
    id: n.id,
    parentId: n.parentId,
    level: n.level,
    title: n.title,
    sourceBoxNodeId: n.sourceBoxNodeId,
    sort: n.sort,
    entryIds: entriesFor(n).map(e => e.id)
  })));
  const existingBySource = new Map();
  (day.nodes || []).forEach(node => {
    if (node.sourceBoxNodeId) existingBySource.set(node.sourceBoxNodeId, node);
  });
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
    id: n.id,
    parentId: n.parentId,
    level: n.level,
    title: n.title,
    sourceBoxNodeId: n.sourceBoxNodeId,
    sort: n.sort,
    entryIds: entriesFor(n).map(e => e.id)
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
function collectSearchResults(state, query, filters = {
  box: true,
  action: true,
  note: true
}) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];
  const out = [];
  if (filters.box !== false) {
    state.boxNodes.forEach(node => {
      const note = `${node.boxNoteTitle || ""} ${htmlToText(node.boxNoteHtml || "")}`.trim();
      if (node.title.toLowerCase().includes(term) || note.toLowerCase().includes(term)) {
        out.push({
          id: `box:${node.id}`,
          kind: "box",
          title: pathOf(node, state.boxNodes),
          text: note,
          boxId: node.id
        });
      }
    });
  }
  if (filters.action !== false) {
    state.actionDays.forEach(day => {
      day.nodes.forEach(node => {
        entriesFor(node, "action").forEach(entry => {
          const text = entryText(entry);
          if (node.title.toLowerCase().includes(term) || text.toLowerCase().includes(term)) {
            out.push({
              id: `entry:${day.id}:${node.id}:${entry.id}`,
              kind: "act",
              meta: displayDate(day.date),
              title: pathOf(node, day.nodes),
              text,
              dayId: day.id,
              date: day.date,
              actionNodeId: node.id,
              entryId: entry.id
            });
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
function MenuItem({
  icon,
  label,
  danger = false,
  accent = false,
  divider = false,
  onClick
}) {
  return React.createElement("button", {
    type: "button",
    onClick: onClick,
    className: `flex items-center gap-2.5 px-3 py-2.5 text-[14px] text-left transition-colors w-full ${divider ? "border-b border-[#3E3E3E]" : ""} ${danger ? "text-red-400 hover:bg-[#3E3E3E] hover:text-red-300 font-medium" : accent ? "text-[#FFD2D7] hover:bg-[#3E3E3E] font-bold" : "text-white hover:bg-[#3E3E3E]"}`
  }, React.createElement("span", {
    className: danger || accent ? "" : "text-[#A7A7A7]"
  }, icon), label);
}
function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function renderHashtagSegments(text, keyPrefix = "tag") {
  const source = String(text || "");
  const pieces = [];
  const regex = /(^|[^\p{L}\p{N}_-])#([\p{L}\p{N}_-]{1,48})/gu;
  let last = 0;
  let match;
  while (match = regex.exec(source)) {
    const tagStart = match.index + match[1].length;
    const tagEnd = tagStart + match[2].length + 1;
    if (tagStart > last) pieces.push(source.slice(last, tagStart));
    pieces.push(React.createElement("span", {
      key: `${keyPrefix}-${tagStart}`,
      className: "text-[#FFD2D7] font-bold"
    }, "#", match[2]));
    last = tagEnd;
  }
  if (last < source.length) pieces.push(source.slice(last));
  return pieces.length ? pieces : source;
}
function caretTextOffset(root) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !root?.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}
function restoreCaretTextOffset(root, offset) {
  if (!root || offset === null || offset === undefined) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
function unwrapLiveHashtagSpans(root) {
  root?.querySelectorAll?.("span.note-hashtag").forEach(span => {
    span.replaceWith(document.createTextNode(span.textContent || ""));
  });
  root?.normalize?.();
}
function wrapHashtagsInTextNode(node) {
  const source = node.textContent || "";
  const regex = /(^|[^\p{L}\p{N}_-])#([\p{L}\p{N}_-]{1,48})/gu;
  let match;
  let last = 0;
  const fragment = document.createDocumentFragment();
  let changed = false;
  while (match = regex.exec(source)) {
    const tagStart = match.index + match[1].length;
    const tagEnd = tagStart + match[2].length + 1;
    if (tagStart > last) fragment.appendChild(document.createTextNode(source.slice(last, tagStart)));
    const span = document.createElement("span");
    span.className = "note-hashtag";
    span.textContent = source.slice(tagStart, tagEnd);
    fragment.appendChild(span);
    last = tagEnd;
    changed = true;
  }
  if (!changed) return;
  if (last < source.length) fragment.appendChild(document.createTextNode(source.slice(last)));
  node.replaceWith(fragment);
}
function highlightEditableHashtags(root) {
  if (!root) return;
  const offset = caretTextOffset(root);
  unwrapLiveHashtagSpans(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.includes("#") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  nodes.forEach(wrapHashtagsInTextNode);
  restoreCaretTextOffset(root, offset);
}
function HighlightText({
  text,
  query,
  className = ""
}) {
  const source = String(text || "");
  const term = String(query || "").trim();
  if (!term) return React.createElement("span", {
    className: className
  }, renderHashtagSegments(source));
  const parts = source.split(new RegExp(`(${escapeRegExp(term)})`, "ig"));
  return React.createElement("span", {
    className: className
  }, parts.map((part, index) => part.toLowerCase() === term.toLowerCase() ? React.createElement("mark", {
    key: index,
    className: "search-hit bg-transparent"
  }, part) : React.createElement(React.Fragment, {
    key: index
  }, renderHashtagSegments(part, `tag-${index}`))));
}
function searchKindLabel(kind) {
  if (kind === "act") return "Act";
  return kind === "box" ? "Box" : "Note";
}
function SearchPanel({
  isOpen,
  query,
  setQuery,
  results,
  filters,
  onToggleFilter,
  onOpenResult
}) {
  return React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: `bg-[#111111] border-b border-[#333333] overflow-hidden transition-all duration-300 ease-in-out z-30 relative ${isOpen ? "max-h-80 opacity-100 py-3 px-5" : "max-h-0 opacity-0 py-0 px-5 border-transparent"}`
  }, React.createElement("div", {
    className: "flex items-center bg-[#0a0a0a] rounded-full px-3 py-1.5 border border-[#333333] focus-within:border-[#FFD2D7] transition-colors"
  }, React.createElement(Search, {
    size: 16,
    className: "text-[#A7A7A7] mr-2"
  }), React.createElement("input", {
    type: "text",
    placeholder: "Search boxes, actions, notes...",
    value: query,
    onChange: e => setQuery(e.target.value),
    className: "bg-transparent border-none outline-none text-white text-[14px] w-full placeholder:text-[#666666]"
  })), React.createElement("div", {
    className: "mt-2 flex items-center gap-2"
  }, [["box", "Box"], ["action", "Act"], ["note", "Note"]].map(([key, label]) => React.createElement("button", {
    key: key,
    type: "button",
    onClick: () => onToggleFilter(key),
    className: `px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-colors ${filters?.[key] !== false ? "bg-[#FFD2D7] text-black" : "border border-[#444444] text-[#A7A7A7] hover:text-white"}`
  }, label))), query.trim() && React.createElement("div", {
    className: "mt-3 max-h-44 overflow-auto thin-scroll flex flex-col gap-1"
  }, results.length ? results.map(result => React.createElement("button", {
    key: result.id,
    type: "button",
    onClick: () => onOpenResult(result),
    className: "text-left px-3 py-2 rounded-xl hover:bg-[#1A1A1A] transition-colors"
  }, React.createElement("span", {
    className: "text-[11px] uppercase tracking-wider text-[#FFD2D7] font-extrabold"
  }, searchKindLabel(result.kind), result.meta ? React.createElement("span", {
    className: "text-[#777] normal-case tracking-normal font-bold"
  }, " - ", result.meta) : null), React.createElement("strong", {
    className: "block text-[14px] text-white truncate"
  }, React.createElement(HighlightText, {
    text: result.title,
    query: query
  })), result.text ? React.createElement("em", {
    className: "block text-[12px] text-[#A7A7A7] not-italic truncate"
  }, React.createElement(HighlightText, {
    text: result.text,
    query: query
  })) : null)) : React.createElement("div", {
    className: "text-[#A7A7A7] text-[13px] px-3 py-2"
  }, "No results.")));
}
function NoteCard({
  state,
  note,
  query = "",
  onOpen,
  onDelete,
  onOpenOrigin,
  showOrigin = true,
  flashTarget
}) {
  const preview = notePreview(note);
  const linked = noteIsLinked(state, note.id);
  const boxLink = noteBoxLinkInfo(state, note.id);
  const origin = showOrigin ? notePrimaryOrigin(state, note.id) : null;
  const boxTitleClass = boxLink ? boxLink.level > 1 ? "note-title-subbox" : "note-title-box" : "";
  return React.createElement("div", {
    "data-note-id": note.id,
    className: `group bg-[#141414] border border-white/[0.04] rounded-[12px] px-4 py-3.5 ${flashTarget?.type === "note" && flashTarget.id === note.id ? "flash-target" : ""}`
  }, React.createElement("div", {
    className: "flex items-start gap-3"
  }, React.createElement("button", {
    type: "button",
    onClick: () => onOpen(note.id),
    className: "min-w-0 flex-1 text-left"
  }, React.createElement("h3", {
    className: `font-extrabold text-[15.5px] leading-snug truncate ${linked ? "text-white not-italic" : "text-[#FFD2D7] italic"} ${boxTitleClass}`
  }, React.createElement(HighlightText, {
    text: noteDisplayTitle(note),
    query: query
  })), React.createElement("p", {
    className: "text-[#A7A7A7] text-[13px] leading-snug mt-1 truncate"
  }, React.createElement(HighlightText, {
    text: preview || "No preview",
    query: query
  }))), origin && React.createElement("button", {
    type: "button",
    onClick: () => onOpenOrigin?.(note.id),
    className: "text-[#666] hover:text-[#FFD2D7] transition-colors p-1.5 -mr-1 shrink-0",
    "aria-label": "Open note origin",
    title: "Open note origin"
  }, React.createElement(MapPin, {
    size: 16
  })), React.createElement("button", {
    type: "button",
    onClick: () => onDelete(note.id),
    className: "text-[#666] hover:text-red-300 transition-colors p-1.5 -mr-1 shrink-0",
    "aria-label": "Delete note"
  }, React.createElement(Trash2, {
    size: 16
  }))));
}
function NotesPanel({
  state,
  notes,
  tags,
  isViewMenuOpen,
  setIsViewMenuOpen,
  isViewByMenuOpen,
  setIsViewByMenuOpen,
  onCreateNote,
  onOpenNote,
  onDeleteNote,
  onOpenOrigin,
  onSetView,
  onSetViewBy,
  onToggleDate,
  onOpenExport,
  flashTarget
}) {
  const groups = groupNotesByDate(notes);
  const view = state.ui.notesView || "linked";
  const viewLabel = view === "linked" ? "Linked" : view === "free" ? "Free" : "All";
  const tagsInput = state.ui.notesTagsInput || "";
  const datesInput = state.ui.notesDatesInput || "";
  const selectedTags = exportTagsFromInput(tagsInput);
  const tagHints = tagHintsForInput(tags, tagsInput);
  const dateFilters = parseExportDateFilters(datesInput);
  const hasViewBy = Boolean(selectedTags.length || datesInput.trim());
  const dateFilterLabel = datesInput.trim() ? dateFilters.length ? `${dateFilters.length} date${dateFilters.length > 1 ? "s" : ""}` : "Invalid date" : "";
  const emptyTitle = hasViewBy ? "No notes match" : "No notes yet";
  const emptyAction = hasViewBy ? "Clear filters" : "Create note";
  return React.createElement("div", {
    className: "animate-in fade-in slide-in-from-bottom-4 duration-300 flex-1 flex flex-col"
  }, React.createElement("div", {
    className: "filter-row flex flex-wrap items-center gap-2.5 mb-5 relative z-20"
  }, React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setIsViewMenuOpen(!isViewMenuOpen);
    },
    className: "flex items-center gap-1.5 px-6 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform"
  }, viewLabel), isViewMenuOpen && React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "absolute top-full left-0 mt-2 w-[130px] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100"
  }, [["linked", "Linked"], ["free", "Free"], ["all", "All"]].map(([value, label]) => React.createElement("button", {
    key: value,
    type: "button",
    onClick: () => {
      onSetView(value);
      setIsViewMenuOpen(false);
    },
    className: "px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors"
  }, label)))), React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setIsViewByMenuOpen(!isViewByMenuOpen);
      setIsViewMenuOpen(false);
    },
    className: `px-5 py-2 active:scale-95 text-[13px] font-bold rounded-full border transition-all ${hasViewBy ? "bg-[#FFD2D7] border-[#FFD2D7] text-black shadow-[0_0_18px_rgba(255,210,215,0.18)]" : "bg-transparent text-white border-[#878787] hover:border-white"}`
  }, "View by"), isViewByMenuOpen && React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "absolute top-full left-0 mt-2 w-[300px] max-w-[calc(100vw-2.5rem)] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] p-3 flex flex-col gap-3 origin-top-left animate-in fade-in zoom-in-95 duration-100"
  }, React.createElement("label", {
    className: "block"
  }, React.createElement("span", {
    className: "block text-[11px] text-[#A7A7A7] font-extrabold mb-1.5"
  }, "Hashtags"), React.createElement("input", {
    value: tagsInput,
    onChange: e => onSetViewBy({
      tagsInput: e.target.value
    }),
    placeholder: "#idea, #work",
    className: "w-full bg-[#111111] border border-[#323232] rounded-[10px] px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555]"
  }), tagHints.length ? React.createElement("div", {
    className: "mt-2 flex flex-wrap gap-1.5"
  }, tagHints.map(tag => React.createElement("button", {
    key: tag,
    type: "button",
    onClick: () => onSetViewBy({
      tagsInput: replaceLastCsvToken(tagsInput, tag)
    }),
    className: "text-[11px] font-bold text-[#FFD2D7] bg-[#FFD2D7]/[0.08] px-2 py-1 rounded-full"
  }, "#", tag))) : null), React.createElement("label", {
    className: "block"
  }, React.createElement("span", {
    className: "block text-[11px] text-[#A7A7A7] font-extrabold mb-1.5"
  }, "Dates"), React.createElement("input", {
    value: datesInput,
    onChange: e => onSetViewBy({
      datesInput: e.target.value
    }),
    placeholder: "22/05/2026, 01/05/2026 - 22/05/2026",
    className: "w-full bg-[#111111] border border-[#323232] rounded-[10px] px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555]"
  }), datesInput.trim() ? React.createElement("div", {
    className: `mt-2 text-[11px] font-bold ${dateFilters.length ? "text-[#A7A7A7]" : "text-red-300"}`
  }, dateFilters.length ? `${dateFilters.length} date filter${dateFilters.length > 1 ? "s" : ""}` : "Use dd/mm/yyyy or dd/mm/yyyy - dd/mm/yyyy") : null), React.createElement("button", {
    type: "button",
    onClick: () => onSetViewBy({
      tagsInput: "",
      datesInput: ""
    }),
    className: "self-start text-[12px] font-extrabold text-[#FFD2D7] hover:text-white transition-colors px-1"
  }, "Clear"))), React.createElement("button", {
    type: "button",
    onClick: onCreateNote,
    className: "ml-auto px-5 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform",
    "aria-label": "Create note"
  }, "+note"), React.createElement("button", {
    type: "button",
    onClick: onOpenExport,
    className: "h-9 w-9 bg-transparent hover:border-white active:scale-95 text-white rounded-full border border-[#878787] transition-all grid place-items-center",
    "aria-label": "Export notes",
    title: "Export notes"
  }, React.createElement(Download, {
    size: 15
  }))), hasViewBy && React.createElement("div", {
    className: "-mt-2 mb-5 flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold"
  }, selectedTags.slice(0, 3).map(tag => React.createElement("span", {
    key: tag,
    className: "px-2 py-1 rounded-full bg-[#FFD2D7]/[0.08] text-[#FFD2D7]"
  }, "#", tag)), selectedTags.length > 3 ? React.createElement("span", {
    className: "px-2 py-1 rounded-full bg-[#111111] text-[#A7A7A7]"
  }, "+", selectedTags.length - 3) : null, dateFilterLabel ? React.createElement("span", {
    className: `px-2 py-1 rounded-full bg-[#111111] ${dateFilters.length ? "text-[#A7A7A7]" : "text-red-300"}`
  }, dateFilterLabel) : null, React.createElement("button", {
    type: "button",
    onClick: () => onSetViewBy({
      tagsInput: "",
      datesInput: ""
    }),
    className: "px-2 py-1 text-[#A7A7A7] hover:text-white transition-colors"
  }, "Clear")), groups.length ? React.createElement("div", {
    className: "space-y-5"
  }, groups.map(group => {
    const collapsed = (state.ui.collapsedNoteDates || []).includes(group.date);
    return React.createElement("section", {
      key: group.date
    }, React.createElement("button", {
      type: "button",
      onClick: () => onToggleDate(group.date),
      className: "w-full flex items-center justify-between text-left text-[12px] font-extrabold text-[#A7A7A7] mb-2 px-1 hover:text-white transition-colors",
      "aria-label": collapsed ? "Expand notes date" : "Collapse notes date"
    }, React.createElement("span", {
      className: "flex items-center gap-1.5 min-w-0"
    }, React.createElement("span", {
      className: "truncate"
    }, displayDate(group.date)), collapsed ? React.createElement(ChevronRight, {
      size: 14,
      className: "shrink-0"
    }) : React.createElement(ChevronDown, {
      size: 14,
      className: "shrink-0"
    })), React.createElement("span", {
      className: "text-[11px] text-[#666666] shrink-0"
    }, group.items.length)), !collapsed && React.createElement("div", {
      className: "space-y-3"
    }, group.items.map(note => React.createElement(NoteCard, {
      key: note.id,
      state: state,
      note: note,
      onOpen: onOpenNote,
      onDelete: onDeleteNote,
      onOpenOrigin: onOpenOrigin,
      flashTarget: flashTarget
    }))));
  })) : React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center pb-20 text-center"
  }, React.createElement("div", {
    className: "w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6"
  }, React.createElement(FileText, {
    size: 36,
    className: "text-[#A7A7A7]"
  })), React.createElement("h3", {
    className: "text-white font-bold text-[18px] mb-2"
  }, emptyTitle), React.createElement("button", {
    type: "button",
    onClick: hasViewBy ? () => onSetViewBy({
      tagsInput: "",
      datesInput: ""
    }) : onCreateNote,
    className: "mt-4 bg-[#FFD2D7] text-black font-bold px-7 py-3 rounded-full flex items-center gap-2"
  }, hasViewBy ? React.createElement(X, {
    size: 18
  }) : React.createElement(Plus, {
    size: 18
  }), " ", emptyAction)));
}
function BoxNotesPanel({
  state,
  boxId,
  notes,
  onBack,
  onCreateNote,
  onOpenNote,
  onDeleteNote,
  onToggleDate,
  flashTarget
}) {
  const box = getNode(state.boxNodes || [], boxId);
  const groups = groupNotesByDate(notes);
  const crumbs = box ? [...ancestorsOf(box.id, state.boxNodes || []), box] : [];
  if (!box) {
    return React.createElement("div", {
      className: "animate-in fade-in slide-in-from-bottom-4 duration-300 flex-1 flex flex-col"
    }, React.createElement("button", {
      type: "button",
      onClick: onBack,
      className: "self-start flex items-center gap-1 text-[#A7A7A7] hover:text-white transition-colors text-[13px] font-extrabold mb-8",
      "aria-label": "Back to boxes"
    }, React.createElement(ChevronLeft, {
      size: 17
    }), " Box"), React.createElement("div", {
      className: "flex-1 flex flex-col items-center justify-center pb-20 text-center"
    }, React.createElement("div", {
      className: "w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6"
    }, React.createElement(Notebook, {
      size: 34,
      className: "text-[#A7A7A7]"
    })), React.createElement("h3", {
      className: "text-white font-bold text-[18px] mb-2"
    }, "Box not found"), React.createElement("button", {
      type: "button",
      onClick: onBack,
      className: "mt-4 bg-[#FFD2D7] text-black font-bold px-7 py-3 rounded-full"
    }, "Back")));
  }
  return React.createElement("div", {
    className: "animate-in fade-in slide-in-from-bottom-4 duration-300 flex-1 flex flex-col"
  }, React.createElement("div", {
    className: "mb-6"
  }, React.createElement("button", {
    type: "button",
    onClick: onBack,
    className: "flex items-center gap-1 text-[#A7A7A7] hover:text-white transition-colors text-[13px] font-extrabold",
    "aria-label": "Back to boxes"
  }, React.createElement(ChevronLeft, {
    size: 17
  }), " Box"), React.createElement("div", {
    className: "mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-extrabold text-[#777777]"
  }, crumbs.map((item, index) => React.createElement(React.Fragment, {
    key: item.id
  }, index > 0 ? React.createElement("span", {
    className: "text-[#3E3E3E]"
  }, "/") : null, React.createElement("span", {
    className: index === crumbs.length - 1 ? "text-[#FFD2D7]" : ""
  }, item.title)))), React.createElement("div", {
    className: "mt-2 flex items-end justify-between gap-3"
  }, React.createElement("h3", {
    className: "min-w-0 flex-1 text-white font-extrabold text-[24px] leading-tight tracking-tight truncate"
  }, box.title), React.createElement("button", {
    type: "button",
    onClick: () => onCreateNote(box.id),
    className: "shrink-0 px-5 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform",
    "aria-label": "Create box note"
  }, "+note"))), groups.length ? React.createElement("div", {
    className: "space-y-5"
  }, groups.map(group => {
    const collapsed = (state.ui.collapsedBoxNoteDates || []).includes(group.date);
    return React.createElement("section", {
      key: group.date
    }, React.createElement("button", {
      type: "button",
      onClick: () => onToggleDate(group.date),
      className: "w-full flex items-center justify-between text-left text-[12px] font-extrabold text-[#A7A7A7] mb-2 px-1 hover:text-white transition-colors",
      "aria-label": collapsed ? "Expand box notes date" : "Collapse box notes date"
    }, React.createElement("span", {
      className: "flex items-center gap-1.5 min-w-0"
    }, React.createElement("span", {
      className: "truncate"
    }, displayDate(group.date)), collapsed ? React.createElement(ChevronRight, {
      size: 14,
      className: "shrink-0"
    }) : React.createElement(ChevronDown, {
      size: 14,
      className: "shrink-0"
    })), React.createElement("span", {
      className: "text-[11px] text-[#666666] shrink-0"
    }, group.items.length)), !collapsed && React.createElement("div", {
      className: "space-y-3"
    }, group.items.map(note => React.createElement(NoteCard, {
      key: note.id,
      state: state,
      note: note,
      onOpen: onOpenNote,
      onDelete: onDeleteNote,
      showOrigin: false,
      flashTarget: flashTarget
    }))));
  })) : React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center pb-20 text-center"
  }, React.createElement("div", {
    className: "w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6"
  }, React.createElement(Notebook, {
    size: 34,
    className: "text-[#A7A7A7]"
  })), React.createElement("h3", {
    className: "text-white font-bold text-[18px] mb-2"
  }, "No notes in this box"), React.createElement("button", {
    type: "button",
    onClick: () => onCreateNote(box.id),
    className: "mt-4 bg-[#FFD2D7] text-black font-bold px-7 py-3 rounded-full flex items-center gap-2"
  }, React.createElement(Plus, {
    size: 18
  }), " Create note")));
}
function replaceLastCsvToken(input, value) {
  const parts = String(input || "").split(",");
  parts[parts.length - 1] = ` #${value}`;
  return parts.map((part, index) => index === 0 ? part.trimStart() : part.trim()).join(", ").replace(/^, /, "");
}
function tagHintsForInput(tags, input) {
  const selected = exportTagsFromInput(input);
  const needle = normalizeTag(String(input || "").split(",").pop() || "");
  const candidates = tags.filter(tag => !selected.includes(tag));
  const ranked = needle ? [...candidates.filter(tag => tag.startsWith(needle)), ...candidates.filter(tag => !tag.startsWith(needle) && tag.includes(needle))] : candidates;
  return [...new Set(ranked)].slice(0, needle ? 6 : 4);
}
function ExportNotesModal({
  tags,
  onClose,
  onExport
}) {
  const [tagInput, setTagInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const tagHints = tagHintsForInput(tags, tagInput);
  const dateFilters = parseExportDateFilters(dateInput);
  return React.createElement("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200",
    onClick: onClose
  }, React.createElement("div", {
    className: "bg-[#1A1A1A] border border-[#323232] rounded-[24px] w-full max-w-[360px] p-5 shadow-2xl animate-in zoom-in-95 duration-200",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "flex justify-between items-center mb-5"
  }, React.createElement("h3", {
    className: "font-bold text-[18px] text-white"
  }, "Export notes"), React.createElement("button", {
    type: "button",
    onClick: onClose,
    className: "text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full",
    "aria-label": "Close"
  }, React.createElement(X, {
    size: 18
  }))), React.createElement("div", {
    className: "flex flex-col gap-4"
  }, React.createElement("label", {
    className: "block"
  }, React.createElement("span", {
    className: "block text-[12px] text-[#A7A7A7] font-extrabold mb-2"
  }, "Hashtags"), React.createElement("input", {
    value: tagInput,
    onChange: e => setTagInput(e.target.value),
    placeholder: "#idea, #work",
    className: "w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white text-[14px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors"
  }), tagHints.length ? React.createElement("div", {
    className: "mt-2 flex flex-wrap gap-1.5"
  }, tagHints.map(tag => React.createElement("button", {
    key: tag,
    type: "button",
    onClick: () => setTagInput(prev => replaceLastCsvToken(prev, tag)),
    className: "text-[11px] font-bold text-[#FFD2D7] bg-[#FFD2D7]/[0.08] px-2 py-1 rounded-full"
  }, "#", tag))) : null), React.createElement("label", {
    className: "block"
  }, React.createElement("span", {
    className: "block text-[12px] text-[#A7A7A7] font-extrabold mb-2"
  }, "Dates"), React.createElement("input", {
    value: dateInput,
    onChange: e => setDateInput(e.target.value),
    placeholder: "22/05/2026, 01/05/2026 - 22/05/2026",
    className: "w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white text-[14px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors"
  }), dateInput.trim() ? React.createElement("div", {
    className: `mt-2 text-[11px] font-bold ${dateFilters.length ? "text-[#A7A7A7]" : "text-red-300"}`
  }, dateFilters.length ? `${dateFilters.length} date filter${dateFilters.length > 1 ? "s" : ""}` : "Use dd/mm/yyyy or dd/mm/yyyy - dd/mm/yyyy") : null), React.createElement("button", {
    type: "button",
    onClick: () => onExport({
      tagsInput: tagInput,
      datesInput: dateInput
    }),
    className: "mt-1 bg-[#FFD2D7] hover:scale-[1.02] active:scale-95 text-black font-bold py-3.5 rounded-[12px] transition-transform flex items-center justify-center gap-2"
  }, React.createElement(Download, {
    size: 17
  }), " Export"))));
}
function StatusBadge({
  node
}) {
  if (boxIsArchived(node)) return React.createElement("span", {
    className: "ml-2 text-[10px] uppercase tracking-wider bg-[#2D2D2D] text-[#A7A7A7] px-1.5 py-[2px] rounded"
  }, "archived");
  if (boxIsDone(node)) return React.createElement("span", {
    className: "ml-2 text-[10px] uppercase tracking-wider bg-[#FFD2D7] text-black px-1.5 py-[2px] rounded"
  }, "done");
  return null;
}
function BoxActionTimeline({
  boxId,
  groups,
  isRoot,
  expandedKeys,
  onToggleDay,
  onOpenActionDate
}) {
  if (!groups.length) return null;
  return React.createElement("div", {
    className: `flex flex-col gap-2 pb-2 pr-4 ${isRoot ? "ml-[42px]" : "ml-[36px]"}`
  }, groups.map(({
    day,
    items
  }) => {
    const actions = items.filter(item => item.entry.type === "action");
    const done = actions.filter(item => item.entry.done).length;
    const key = `${boxId}:${day.date}`;
    const expanded = (expandedKeys || []).includes(key);
    return React.createElement("div", {
      key: day.id,
      className: "rounded-[12px] bg-[#101010] border border-white/[0.04] overflow-hidden"
    }, React.createElement("button", {
      type: "button",
      onClick: () => onToggleDay(boxId, day.date),
      className: "w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#171717] transition-colors"
    }, React.createElement("span", {
      className: "flex items-center gap-1.5 min-w-0"
    }, expanded ? React.createElement(ChevronDown, {
      size: 14,
      className: "text-[#A7A7A7] shrink-0"
    }) : React.createElement(ChevronRight, {
      size: 14,
      className: "text-[#A7A7A7] shrink-0"
    }), React.createElement("span", {
      className: "text-[12px] font-extrabold text-[#FFD2D7] truncate"
    }, displayDate(day.date))), actions.length ? React.createElement("span", {
      className: "text-[11px] text-[#A7A7A7] font-bold shrink-0"
    }, done, "/", actions.length) : React.createElement("span", {
      className: "text-[11px] text-[#A7A7A7] font-bold shrink-0"
    }, items.length, " note")), expanded && React.createElement("div", {
      className: "px-2 pb-2 flex flex-col gap-1"
    }, items.map(({
      entry,
      actionNode,
      sourceTitle
    }) => React.createElement("button", {
      key: `${actionNode.id}:${entry.id}`,
      type: "button",
      onClick: () => onOpenActionDate(day.date, actionNode.id, entry.id),
      className: "group flex items-start gap-2 rounded-[9px] px-2 py-1.5 text-left hover:bg-[#1A1A1A] transition-colors"
    }, entry.type === "note" ? React.createElement("span", {
      className: "mt-[2px] px-1.5 py-[2px] bg-[#FFD2D7] text-black text-[9px] font-extrabold tracking-wider uppercase rounded-[4px] shrink-0"
    }, "Note") : React.createElement("span", {
      className: `mt-[3px] w-[15px] h-[15px] rounded-[4px] border-[1.5px] grid place-items-center shrink-0 ${entry.done ? "bg-[#FFD2D7] border-[#FFD2D7] text-black" : "border-[#555] text-transparent"}`
    }, React.createElement(Check, {
      size: 10,
      strokeWidth: 3.5
    })), React.createElement("span", {
      className: "min-w-0 flex-1"
    }, React.createElement("span", {
      className: `block text-[13px] leading-snug truncate ${entry.type === "action" && entry.done ? "text-[#666] line-through" : "text-[#CCCCCC] group-hover:text-white"}`
    }, entry.type === "note" ? noteTitle(entry) : entry.text))))));
  }));
}
function BoxTreeItem({
  state,
  node,
  level,
  view,
  menuOpenId,
  setMenuOpenId,
  menuPlacements,
  openNodeMenu,
  handlers,
  dragState,
  setDragState,
  flashTarget
}) {
  const children = childrenOf(node.id, state.boxNodes).filter(child => shouldShowChildInView(child, view));
  const open = isBoxOpen(state, node);
  const isRoot = level === 0;
  const inactive = boxIsInactive(node) || boxIsArchived(node);
  const showBoxDays = state.ui.showBoxDays !== false;
  const timeline = showBoxDays ? actionTimelineForBox(state, node) : [];
  const noteCount = boxNoteCount(state, node.id);
  const hasNote = noteCount > 0;
  const hasBody = children.length > 0 || timeline.length > 0;
  const boxCascadeChildren = item => childrenOf(item.id, state.boxNodes).filter(child => shouldShowChildInView(child, view));
  const boxCascadeOwnContent = item => state.ui.showBoxDays !== false && actionTimelineForBox(state, item).length > 0;
  const cascadeMax = cascadeMaxDepth(node, boxCascadeChildren, boxCascadeOwnContent);
  const cascadeDepth = Math.min(cascadeMax, cascadeOpenDepth(node, boxCascadeChildren, item => isBoxOpen(state, item), boxCascadeOwnContent));
  const cascade = cascadePlan(cascadeDepth, cascadeMax, state.ui.boxCascadeModes?.[node.id]);
  const CascadeIcon = cascade.direction === "expand" ? cascade.deep ? ChevronsDown : ChevronRight : cascade.deep ? ChevronsRight : ChevronDown;
  const cascadeLabel = cascade.direction === "expand" ? cascade.deep ? "Expand next level" : "Expand" : cascade.deep ? "Collapse next level" : "Collapse";
  const menuId = `box:${node.id}`;
  const menuOpen = menuOpenId === menuId;
  const menuMeta = menuPlacements?.[menuId] || {
    direction: "down",
    maxHeight: inactive ? 72 : 248
  };
  const dragging = dragState?.id === node.id;
  const dropTarget = dragState?.overId === node.id;
  const pointerDragRef = useRef(null);
  function setDragOver(targetId) {
    if (!targetId || targetId === node.id) {
      pointerDragRef.current = pointerDragRef.current ? {
        ...pointerDragRef.current,
        overId: null
      } : null;
      setDragState(prev => prev?.id === node.id ? {
        ...prev,
        overId: null
      } : prev);
      return;
    }
    const target = getNode(state.boxNodes, targetId);
    if (!target || (target.parentId ?? null) !== (node.parentId ?? null)) return;
    pointerDragRef.current = pointerDragRef.current ? {
      ...pointerDragRef.current,
      overId: targetId
    } : null;
    setDragState(prev => prev?.id === node.id ? {
      ...prev,
      overId: targetId
    } : prev);
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
    const start = {
      id: node.id,
      parentId: node.parentId ?? null,
      overId: null,
      pointerId: e.pointerId
    };
    pointerDragRef.current = start;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.body.classList.add("touch-dragging");
    setMenuOpenId(null);
    setDragState(start);
    const move = event => {
      if (!pointerDragRef.current || event.pointerId !== pointerDragRef.current.pointerId) return;
      event.preventDefault();
      setDragOver(sameLevelDropIdFromPoint(event.clientX, event.clientY));
    };
    const finish = event => {
      if (!pointerDragRef.current || event.pointerId !== pointerDragRef.current.pointerId) return;
      event.preventDefault();
      const overId = pointerDragRef.current.overId;
      try {
        e.currentTarget?.releasePointerCapture?.(event.pointerId);
      } catch {}
      pointerDragRef.current = null;
      document.body.classList.remove("touch-dragging");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      if (overId && overId !== node.id) handlers.reorderBox(node.id, overId);
      setDragState(null);
    };
    document.addEventListener("pointermove", move, {
      passive: false
    });
    document.addEventListener("pointerup", finish, {
      passive: false
    });
    document.addEventListener("pointercancel", finish, {
      passive: false
    });
  }
  function onDrop(e) {
    e.preventDefault();
    if (!dragState || dragState.id === node.id || dragState.parentId !== (node.parentId ?? null)) return;
    handlers.reorderBox(dragState.id, node.id);
    setDragState(null);
  }
  return React.createElement("div", {
    "data-box-node-id": node.id,
    className: `flex flex-col w-full ${flashTarget?.type === "box" && flashTarget.id === node.id ? "flash-target" : ""} ${menuOpen ? "relative z-50" : ""} ${dragging ? "dragging-row" : ""} ${dropTarget ? "drop-target" : ""}`,
    onDragOver: e => {
      if (dragState?.id && dragState.id !== node.id && dragState.parentId === (node.parentId ?? null)) {
        e.preventDefault();
        setDragState(prev => prev?.overId === node.id ? prev : {
          ...prev,
          overId: node.id
        });
      }
    },
    onDrop: onDrop
  }, React.createElement("div", {
    className: `flex items-center px-4 hover:bg-white/[0.04] transition-colors relative ${isRoot ? "py-3.5" : "py-2.5 border-t border-white/[0.05]"}`
  }, React.createElement("button", {
    type: "button",
    draggable: !inactive,
    onPointerDown: onTouchDragStart,
    onContextMenu: e => e.preventDefault(),
    onDragStart: e => {
      e.stopPropagation();
      e.dataTransfer?.setData("text/plain", node.id);
      setDragState({
        id: node.id,
        parentId: node.parentId ?? null,
        overId: null
      });
    },
    onDragEnd: () => setDragState(null),
    onClick: e => e.stopPropagation(),
    className: `drag-handle ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"} mr-3 cursor-grab active:cursor-grabbing hover:text-white shrink-0 h-8 w-5 grid place-items-center`,
    "aria-label": "Drag"
  }, React.createElement(GripVertical, {
    size: isRoot ? 20 : 16
  })), React.createElement("div", {
    className: `flex-1 min-w-0 pr-2 ${isRoot ? "font-extrabold text-[20.5px] tracking-tight text-[#FFD2D7]" : `font-medium text-[15px] ${boxIsDone(node) ? "text-[#666] line-through" : "text-[#E0E0E0]"}`}`
  }, React.createElement("div", {
    contentEditable: !inactive,
    suppressContentEditableWarning: true,
    spellCheck: "false",
    "data-placeholder": isRoot ? "Box title" : "Sub-box title",
    onClick: e => e.stopPropagation(),
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    onBlur: e => handlers.renameBox(node.id, e.currentTarget.textContent),
    className: "outline-none truncate min-h-[1.25em]"
  }, node.title)), React.createElement(StatusBadge, {
    node: node
  }), React.createElement("div", {
    className: `flex items-center gap-1 shrink-0 ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"}`
  }, hasNote && React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      handlers.openBoxNote(node.id);
    },
    className: "relative h-8 w-7 grid place-items-center rounded-full text-[#FFD2D7] hover:text-white hover:bg-[#444444] transition-colors",
    "aria-label": "View notes",
    title: "View notes"
  }, React.createElement(Notebook, {
    size: isRoot ? 18 : 16,
    strokeWidth: 2.1
  }), React.createElement("span", {
    className: "absolute -right-[2px] -top-[2px] min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#FFD2D7] text-black text-[9px] leading-[15px] font-black text-center shadow-[0_0_0_2px_#141414]"
  }, noteCount > 9 ? "9+" : noteCount)), React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      handlers.toggleBoxOpen(node.id);
    },
    className: "h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white hover:bg-[#444444]",
    "aria-label": cascadeLabel,
    title: cascadeLabel
  }, React.createElement(CascadeIcon, {
    size: isRoot ? 21 : 18
  })), React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => openNodeMenu(menuId, e, inactive ? 72 : 248),
    className: `h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white ${menuOpen ? "bg-[#444444] text-white" : "hover:bg-[#444444]"}`,
    "aria-label": "Box menu"
  }, React.createElement(MoreHorizontal, {
    size: isRoot ? 21 : 18
  })), menuOpen && React.createElement("div", {
    "data-floating-menu-id": menuId,
    "data-menu-direction": menuMeta.direction,
    onClick: e => e.stopPropagation(),
    style: {
      maxHeight: `${menuMeta.maxHeight}px`
    },
    className: `absolute right-0 ${floatingMenuPositionClass(menuMeta)} w-44 bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] z-50 py-1.5 flex flex-col overflow-x-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-100`
  }, inactive ? React.createElement(MenuItem, {
    icon: React.createElement(CheckCircle, {
      size: 16
    }),
    label: "restore",
    onClick: () => {
      setMenuOpenId(null);
      handlers.restoreBox(node.id);
    }
  }) : React.createElement(React.Fragment, null, React.createElement(MenuItem, {
    icon: React.createElement(PlusSquare, {
      size: 16
    }),
    label: "+ sub",
    onClick: () => {
      setMenuOpenId(null);
      handlers.addSub(node.id);
    }
  }), React.createElement(MenuItem, {
    icon: React.createElement(FileText, {
      size: 16
    }),
    label: hasNote ? "view notes" : "+ notes",
    accent: hasNote,
    onClick: () => {
      setMenuOpenId(null);
      handlers.openBoxNote(node.id);
    }
  }), React.createElement(MenuItem, {
    icon: React.createElement(CheckCircle, {
      size: 16
    }),
    label: "done",
    onClick: () => {
      setMenuOpenId(null);
      handlers.doneBox(node.id);
    }
  }), React.createElement(MenuItem, {
    icon: React.createElement(Archive, {
      size: 16
    }),
    label: "archive",
    divider: true,
    onClick: () => {
      setMenuOpenId(null);
      handlers.archiveBox(node.id);
    }
  }), React.createElement(MenuItem, {
    icon: React.createElement(Trash2, {
      size: 16
    }),
    label: "remove",
    danger: true,
    onClick: () => {
      setMenuOpenId(null);
      handlers.deleteBox(node.id);
    }
  })))))), hasBody && open && React.createElement("div", {
    className: "w-full flex flex-col"
  }, React.createElement(BoxActionTimeline, {
    boxId: node.id,
    groups: timeline,
    isRoot: isRoot,
    expandedKeys: state.ui.expandedBoxActionDays || [],
    onToggleDay: handlers.toggleBoxTimelineDay,
    onOpenActionDate: handlers.openActionDate
  }), children.length > 0 && React.createElement("div", {
    className: "ml-5 border-l-[1.5px] border-white/[0.05] pl-1 my-0.5"
  }, children.map(child => React.createElement(BoxTreeItem, {
    key: child.id,
    state: state,
    node: child,
    level: level + 1,
    view: view,
    menuOpenId: menuOpenId,
    setMenuOpenId: setMenuOpenId,
    menuPlacements: menuPlacements,
    openNodeMenu: openNodeMenu,
    handlers: handlers,
    dragState: dragState,
    setDragState: setDragState,
    flashTarget: flashTarget
  })))));
}
function EntryRow({
  day,
  node,
  entry,
  handlers,
  flashTarget
}) {
  const rowFlash = flashTarget?.type === "entry" && flashTarget.id === entry.id;
  const entryTags = entryTagList(entry);
  const titleOnlyTags = new Set(tagsFromText(noteTitle(entry)));
  const visibleEntryTags = entryTags.filter(tag => !titleOnlyTags.has(tag)).slice(0, 2);
  if (entry.type === "note") {
    return React.createElement("div", {
      "data-action-entry-id": entry.id,
      className: `flex items-start py-1.5 px-3 hover:bg-[#1A1A1A] rounded-[10px] transition-colors group ${rowFlash ? "flash-target" : ""}`
    }, React.createElement("button", {
      type: "button",
      onClick: () => handlers.openActionNote(day.id, node.id, entry.id),
      className: "flex items-start flex-1 min-w-0 text-left"
    }, React.createElement("div", {
      className: "mt-[1px] px-1.5 py-[2px] bg-[#FFD2D7] text-black text-[9px] font-extrabold tracking-wider uppercase rounded-[4px] mr-3 shrink-0"
    }, "Note"), React.createElement("span", {
      className: "text-[14px] font-bold text-[#CCCCCC] group-hover:text-white leading-snug truncate"
    }, React.createElement(HighlightText, {
      text: noteTitle(entry)
    }), visibleEntryTags.length ? React.createElement("span", {
      className: "ml-2 text-[#FFD2D7]"
    }, visibleEntryTags.map(tag => `#${tag}`).join(" ")) : null)), React.createElement("button", {
      type: "button",
      onClick: () => handlers.deleteActionNote(day.id, node.id, entry.id),
      className: "text-[#666] hover:text-red-300 p-1",
      "aria-label": "Delete note"
    }, React.createElement(Trash2, {
      size: 14
    })));
  }
  return React.createElement("div", {
    "data-action-entry-id": entry.id,
    className: `flex items-start py-1.5 px-3 hover:bg-[#1A1A1A] rounded-[10px] transition-colors group ${rowFlash ? "flash-target" : ""}`
  }, React.createElement("button", {
    type: "button",
    onClick: () => handlers.toggleEntry(day.id, node.id, entry.id),
    className: `mt-[2px] w-[16px] h-[16px] rounded-[4.5px] border-[1.5px] flex items-center justify-center mr-3 shrink-0 transition-all duration-200 ${entry.done ? "bg-[#FFD2D7] border-[#FFD2D7] text-black" : "border-[#555555] group-hover:border-[#A7A7A7] text-transparent"}`
  }, React.createElement(Check, {
    size: 11,
    strokeWidth: 3.5,
    className: entry.done ? "opacity-100 scale-100" : "opacity-0 scale-50"
  })), React.createElement("div", {
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: "true",
    onInput: e => {
      if (!e.nativeEvent?.isComposing) highlightEditableHashtags(e.currentTarget);
    },
    onCompositionEnd: e => highlightEditableHashtags(e.currentTarget),
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    onBlur: e => handlers.renameEntry(day.id, node.id, entry.id, e.currentTarget.textContent),
    className: `flex-1 min-w-0 outline-none text-[14.5px] leading-snug transition-colors ${entry.done ? "text-[#555555] line-through" : "text-[#CCCCCC] group-hover:text-white"}`
  }, React.createElement(HighlightText, {
    text: entry.text
  })), React.createElement("button", {
    type: "button",
    onClick: () => handlers.deleteEntry(day.id, node.id, entry.id),
    className: "text-[#666] hover:text-red-300 p-1 ml-2",
    "aria-label": "Delete action"
  }, React.createElement(Trash2, {
    size: 14
  })));
}
function ActionTreeItem({
  state,
  day,
  node,
  level,
  menuOpenId,
  setMenuOpenId,
  menuPlacements,
  openNodeMenu,
  handlers,
  flashTarget
}) {
  const filter = state.ui.actionFilter || "all";
  if (!hasVisibleAction(node, day.nodes, filter)) return null;
  const open = !(state.ui.collapsedActionNodes || []).includes(node.id);
  const children = childrenOf(node.id, day.nodes).filter(child => hasVisibleAction(child, day.nodes, filter));
  const entries = visibleEntriesFor(node, filter);
  const sourceBox = getNode(state.boxNodes, node.sourceBoxNodeId);
  const inactive = sourceBox ? boxIsInactive(sourceBox) || boxIsArchived(sourceBox) : false;
  const menuId = `action:${day.id}:${node.id}`;
  const menuOpen = menuOpenId === menuId;
  const menuMeta = menuPlacements?.[menuId] || {
    direction: "down",
    maxHeight: 116
  };
  const isRoot = level === 0;
  const actionCascadeChildren = item => childrenOf(item.id, day.nodes).filter(child => hasVisibleAction(child, day.nodes, filter));
  const actionCascadeOwnContent = item => visibleEntriesFor(item, filter).length > 0;
  const cascadeMax = cascadeMaxDepth(node, actionCascadeChildren, actionCascadeOwnContent);
  const cascadeDepth = Math.min(cascadeMax, cascadeOpenDepth(node, actionCascadeChildren, item => isActionOpen(state, item), actionCascadeOwnContent));
  const cascade = cascadePlan(cascadeDepth, cascadeMax, state.ui.actionCascadeModes?.[node.id]);
  const CascadeIcon = cascade.direction === "expand" ? cascade.deep ? ChevronsDown : ChevronRight : cascade.deep ? ChevronsRight : ChevronDown;
  const cascadeLabel = cascade.direction === "expand" ? cascade.deep ? "Expand next level" : "Expand" : cascade.deep ? "Collapse next level" : "Collapse";
  return React.createElement("div", {
    "data-action-node-id": node.id,
    className: `flex flex-col w-full ${flashTarget?.type === "action" && flashTarget.id === node.id ? "flash-target" : ""} ${menuOpen ? "relative z-50" : ""}`
  }, React.createElement("div", {
    className: `flex items-center px-4 hover:bg-white/[0.04] transition-colors relative ${isRoot ? "py-3.5" : "py-2.5 border-t border-white/[0.05]"}`
  }, React.createElement("div", {
    className: `${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"} mr-3 shrink-0 h-8 w-5 grid place-items-center`
  }, React.createElement(GripVertical, {
    size: isRoot ? 20 : 16
  })), React.createElement("div", {
    className: `flex-1 min-w-0 pr-2 ${isRoot ? "font-extrabold text-[20.5px] tracking-tight text-[#FFD2D7]" : "font-medium text-[15px] text-[#E0E0E0]"}`
  }, React.createElement("span", {
    className: `block truncate ${inactive ? "text-[#666] line-through" : ""}`
  }, node.title)), React.createElement(StatusBadge, {
    node: sourceBox
  }), React.createElement("div", {
    className: `flex items-center gap-1 shrink-0 ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"}`
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      handlers.toggleActionOpen(node.id);
    },
    className: "h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white hover:bg-[#444444]",
    "aria-label": cascadeLabel,
    title: cascadeLabel
  }, React.createElement(CascadeIcon, {
    size: isRoot ? 21 : 18
  })), React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => openNodeMenu(menuId, e, 116),
    className: `h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white ${menuOpen ? "bg-[#444444] text-white" : "hover:bg-[#444444]"}`,
    "aria-label": "Action menu"
  }, React.createElement(MoreHorizontal, {
    size: isRoot ? 21 : 18
  })), menuOpen && React.createElement("div", {
    "data-floating-menu-id": menuId,
    "data-menu-direction": menuMeta.direction,
    onClick: e => e.stopPropagation(),
    style: {
      maxHeight: `${menuMeta.maxHeight}px`
    },
    className: `absolute right-0 ${floatingMenuPositionClass(menuMeta)} w-44 bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] z-50 py-1.5 flex flex-col overflow-x-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-100`
  }, React.createElement(MenuItem, {
    icon: React.createElement(CheckCircle, {
      size: 16
    }),
    label: "+ action",
    onClick: () => {
      setMenuOpenId(null);
      handlers.openActionLines(day.id, node.id);
    }
  }), React.createElement(MenuItem, {
    icon: React.createElement(FileText, {
      size: 16
    }),
    label: "+ notes",
    onClick: () => {
      setMenuOpenId(null);
      handlers.openActionNote(day.id, node.id, null);
    }
  }))))), open && React.createElement("div", {
    className: "w-full flex flex-col"
  }, entries.length > 0 && React.createElement("div", {
    className: `flex flex-col gap-[1px] pt-1 pb-1 pr-4 ${isRoot ? "ml-[42px]" : "ml-[36px]"}`
  }, entries.map(entry => React.createElement(EntryRow, {
    key: entry.id,
    day: day,
    node: node,
    entry: entry,
    handlers: handlers,
    flashTarget: flashTarget
  }))), children.length > 0 && React.createElement("div", {
    className: `ml-5 border-l-[1.5px] border-white/[0.05] pl-1 ${entries.length ? "mb-0.5 mt-1" : "my-0.5"}`
  }, children.map(child => React.createElement(ActionTreeItem, {
    key: child.id,
    state: state,
    day: day,
    node: child,
    level: level + 1,
    menuOpenId: menuOpenId,
    setMenuOpenId: setMenuOpenId,
    menuPlacements: menuPlacements,
    openNodeMenu: openNodeMenu,
    handlers: handlers,
    flashTarget: flashTarget
  })))));
}
function compactDateLabel(value) {
  if (!value) return "";
  return displayDate(value).replace(" (today)", "");
}
function DateTextInput({
  value,
  onCommit,
  allowEmpty = false,
  ariaLabel = "Date",
  inputClassName = ""
}) {
  const [draft, setDraft] = useState(compactDateLabel(value));
  const [invalid, setInvalid] = useState(false);
  const isFocusedRef = useRef(false);
  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(compactDateLabel(value));
      setInvalid(false);
    }
  }, [value]);
  function commit(nextDraft = draft) {
    const raw = String(nextDraft || "").trim();
    if (!raw && allowEmpty) {
      setDraft("");
      setInvalid(false);
      onCommit("");
      return true;
    }
    const parsed = parseUserDate(raw);
    if (!parsed) {
      setInvalid(Boolean(raw));
      if (!raw) setDraft(compactDateLabel(value));
      return false;
    }
    setDraft(compactDateLabel(parsed));
    setInvalid(false);
    onCommit(parsed);
    return true;
  }
  return React.createElement("input", {
    type: "text",
    inputMode: "numeric",
    "aria-label": ariaLabel,
    value: draft,
    placeholder: "dd/mm/yyyy",
    onFocus: e => {
      isFocusedRef.current = true;
      window.setTimeout(() => e.currentTarget.select(), 0);
    },
    onClick: e => e.stopPropagation(),
    onChange: e => {
      setDraft(e.target.value);
      setInvalid(false);
    },
    onBlur: () => {
      isFocusedRef.current = false;
      commit();
    },
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (commit()) e.currentTarget.blur();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDraft(compactDateLabel(value));
        setInvalid(false);
        e.currentTarget.blur();
      }
    },
    className: `min-w-0 bg-transparent outline-none placeholder:text-[#555555] transition-colors ${invalid ? "text-red-200" : "text-white"} ${inputClassName}`
  });
}
function actionDayHasEntries(day) {
  return (day.nodes || []).some(node => entriesFor(node).length > 0);
}
function actionDayCalendarMeta(day) {
  const entries = (day?.nodes || []).flatMap(node => entriesFor(node));
  const actions = entries.filter(entry => entry.type === "action");
  const done = actions.filter(entry => entry.done).length;
  return {
    hasEntries: entries.length > 0,
    total: actions.length,
    done,
    progress: actions.length ? Math.round(done / actions.length * 100) : 0
  };
}
function ActionDatePickerPanel({
  selectedDate,
  actionDays,
  onSelect,
  align = "right",
  compact = false,
  placement = "down"
}) {
  const [month, setMonth] = useState(String(selectedDate || todayYMD()).slice(0, 7));
  useEffect(() => {
    setMonth(String(selectedDate || todayYMD()).slice(0, 7));
  }, [selectedDate]);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const selectedMonth = new Date(year, monthNumber - 1, 1);
  const dayMeta = new Map((actionDays || []).filter(actionDayHasEntries).map(day => [day.date, actionDayCalendarMeta(day)]));
  const cells = Array.from({
    length: 42
  }, (_, index) => {
    const date = new Date(year, monthNumber - 1, index - startOffset + 1);
    return todayYMD(date);
  });
  function shiftMonth(offset) {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }
  const horizontalClass = compact ? "left-0" : align === "left" ? "left-0" : "right-0";
  const verticalClass = placement === "up" ? "bottom-full mb-2" : "top-full mt-2";
  const originClass = placement === "up" ? align === "left" || compact ? "origin-bottom-left" : "origin-bottom-right" : align === "left" || compact ? "origin-top-left" : "origin-top-right";
  const widthClass = compact ? "w-full max-w-full" : "w-[292px] max-w-[calc(100vw-2rem)]";
  return React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: `absolute ${verticalClass} ${horizontalClass} ${originClass} ${widthClass} bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] p-3 animate-in fade-in zoom-in-95 duration-100 z-50`
  }, React.createElement("div", {
    className: "flex items-center justify-between mb-3"
  }, React.createElement("button", {
    type: "button",
    onClick: () => shiftMonth(-1),
    className: "h-8 w-8 grid place-items-center rounded-full text-[#A7A7A7] hover:text-white hover:bg-[#333333] transition-colors",
    "aria-label": "Previous month"
  }, React.createElement(ChevronLeft, {
    size: 16
  })), React.createElement("div", {
    className: "text-white text-[13px] font-extrabold"
  }, selectedMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  })), React.createElement("button", {
    type: "button",
    onClick: () => shiftMonth(1),
    className: "h-8 w-8 grid place-items-center rounded-full text-[#A7A7A7] hover:text-white hover:bg-[#333333] transition-colors",
    "aria-label": "Next month"
  }, React.createElement(ChevronRight, {
    size: 16
  }))), React.createElement("div", {
    className: "grid grid-cols-7 gap-1 mb-1"
  }, ["M", "T", "W", "T", "F", "S", "S"].map((label, index) => React.createElement("div", {
    key: `${label}-${index}`,
    className: "h-6 grid place-items-center text-[10px] font-extrabold text-[#666666]"
  }, label))), React.createElement("div", {
    className: "grid grid-cols-7 gap-1"
  }, cells.map(date => {
    const inMonth = date.slice(0, 7) === month;
    const meta = dayMeta.get(date);
    const hasEntries = Boolean(meta?.hasEntries);
    const progress = meta?.progress || 0;
    const selected = date === selectedDate;
    const today = date === todayYMD();
    const dayNumber = Number(date.slice(-2));
    const className = selected ? "bg-transparent border-[#FFD2D7] text-white shadow-[0_0_18px_rgba(255,210,215,0.18)] [text-shadow:0_1px_4px_rgba(0,0,0,0.75)]" : hasEntries ? "bg-transparent border-[#FFD2D7] text-[#FFD2D7] [text-shadow:0_1px_4px_rgba(0,0,0,0.75)]" : today ? "bg-transparent border-[#555555] text-white" : "bg-transparent border-transparent text-[#A7A7A7] hover:border-[#555555] hover:text-white";
    return React.createElement("button", {
      key: date,
      type: "button",
      onClick: () => onSelect(date),
      className: `relative h-8 overflow-hidden rounded-[9px] border text-[12px] font-extrabold transition-all ${className} ${inMonth ? "" : "opacity-35"}`,
      "aria-label": displayDate(date),
      title: hasEntries ? meta.total ? `${meta.done}/${meta.total} actions done` : "Has notes" : displayDate(date)
    }, progress > 0 && React.createElement("span", {
      "aria-hidden": "true",
      className: "absolute bottom-0 left-0 right-0 bg-[#FFD2D7]",
      style: {
        height: `${progress}%`
      }
    }), React.createElement("span", {
      className: "relative z-10"
    }, dayNumber));
  })));
}
const NOTE_EDITOR_EMPTY_TOOLBAR = {
  bold: false,
  italic: false,
  underline: false,
  heading: false,
  bullet: false,
  ordered: false,
  checklist: false,
  quote: false,
  table: false,
  canUndo: false,
  canRedo: false,
  indentLevel: 0,
  selectionEmpty: true,
  color: "#ffd2d7",
  textLevel: "body",
  listStyle: "none"
};
let noteEditorSchemaCache = null;
const NOTE_TEXT_LEVELS = ["body", "title", "heading", "subheading", "small"];
const NOTE_BULLET_STYLES = ["disc", "circle", "square"];
const NOTE_ORDERED_STYLES = ["decimal", "lower-alpha", "lower-roman"];
const NOTE_EDITOR_DEFAULT_COLOR = "#ffd2d7";
const NOTE_EDITOR_SWATCHES = ["#ffd2d7", "#ffffff", "#a7a7a7", "#fca5a5", "#fcd34d", "#86efac", "#93c5fd", "#c4b5fd"];
function noteEditorPM() {
  return window.ProseMirrorBundle || null;
}
function clampNoteIndent(value) {
  return Math.max(0, Math.min(4, Number(value) || 0));
}
function noteIndentAttrs(value) {
  const indent = clampNoteIndent(value);
  return indent > 0 ? {
    "data-indent": String(indent)
  } : {};
}
function noteParagraphAttrs(indent, size) {
  const attrs = noteIndentAttrs(indent);
  if (size === "small") attrs["data-size"] = "small";
  return attrs;
}
function parseNoteIndent(dom) {
  return clampNoteIndent(dom?.getAttribute?.("data-indent"));
}
function parseNoteParagraphSize(dom) {
  return String(dom?.getAttribute?.("data-size") || "") === "small" ? "small" : "body";
}
function normalizeNoteTextLevel(value) {
  return NOTE_TEXT_LEVELS.includes(value) ? value : "body";
}
function normalizeNoteEditorColor(value) {
  return safeNoteColor(value) || NOTE_EDITOR_DEFAULT_COLOR;
}
function parseListDepth(dom) {
  return clampNoteIndent(dom?.getAttribute?.("data-list-depth"));
}
function parseBulletListStyle(dom) {
  const value = String(dom?.getAttribute?.("data-list-style") || "").toLowerCase();
  return NOTE_BULLET_STYLES.includes(value) ? value : "disc";
}
function parseOrderedListStyle(dom) {
  const value = String(dom?.getAttribute?.("data-list-style") || "").toLowerCase();
  return NOTE_ORDERED_STYLES.includes(value) ? value : "decimal";
}
function listDepthAttrs(depth) {
  const value = clampNoteIndent(depth);
  return value > 0 ? {
    "data-list-depth": String(value)
  } : {};
}
function bulletListAttrs(style, depth) {
  const attrs = listDepthAttrs(depth);
  if (style && style !== "disc") attrs["data-list-style"] = style;
  return attrs;
}
function orderedListAttrs(order, style, depth) {
  const attrs = listDepthAttrs(depth);
  if (Number(order || 1) !== 1) attrs.start = Number(order || 1);
  if (style && style !== "decimal") attrs["data-list-style"] = style;
  return attrs;
}
function createNoteEditorSchema() {
  const pm = noteEditorPM();
  if (!pm) return null;
  if (noteEditorSchemaCache) return noteEditorSchemaCache;
  let nodes = pm.addListNodes(pm.basicSchema.spec.nodes, "paragraph block*", "block");
  const paragraphSpec = pm.basicSchema.spec.nodes.get("paragraph");
  const headingSpec = pm.basicSchema.spec.nodes.get("heading");
  const bulletListSpec = nodes.get("bullet_list");
  const orderedListSpec = nodes.get("ordered_list");
  nodes = nodes.update("paragraph", {
    ...paragraphSpec,
    attrs: {
      indent: {
        default: 0
      },
      size: {
        default: "body"
      }
    },
    parseDOM: [{
      tag: "p",
      getAttrs: dom => ({
        indent: parseNoteIndent(dom),
        size: parseNoteParagraphSize(dom)
      })
    }],
    toDOM(node) {
      return ["p", noteParagraphAttrs(node.attrs.indent, node.attrs.size), 0];
    }
  });
  nodes = nodes.update("heading", {
    ...headingSpec,
    attrs: {
      level: {
        default: 3
      },
      indent: {
        default: 0
      }
    },
    parseDOM: [1, 2, 3, 4, 5, 6].map(level => ({
      tag: `h${level}`,
      getAttrs: dom => ({
        level,
        indent: parseNoteIndent(dom)
      })
    })),
    toDOM(node) {
      return [`h${node.attrs.level}`, noteIndentAttrs(node.attrs.indent), 0];
    }
  });
  nodes = nodes.update("bullet_list", {
    ...bulletListSpec,
    attrs: {
      style: {
        default: "disc"
      },
      depth: {
        default: 0
      }
    },
    parseDOM: [{
      tag: "ul",
      getAttrs: dom => String(dom?.getAttribute?.("data-type") || "") === "task-list" ? false : {
        style: parseBulletListStyle(dom),
        depth: parseListDepth(dom)
      }
    }],
    toDOM(node) {
      return ["ul", bulletListAttrs(node.attrs.style, node.attrs.depth), 0];
    }
  });
  nodes = nodes.update("ordered_list", {
    ...orderedListSpec,
    attrs: {
      order: {
        default: 1
      },
      style: {
        default: "decimal"
      },
      depth: {
        default: 0
      }
    },
    parseDOM: [{
      tag: "ol",
      getAttrs: dom => ({
        order: dom?.hasAttribute?.("start") ? Number(dom.getAttribute("start") || 1) : 1,
        style: parseOrderedListStyle(dom),
        depth: parseListDepth(dom)
      })
    }],
    toDOM(node) {
      return ["ol", orderedListAttrs(node.attrs.order, node.attrs.style, node.attrs.depth), 0];
    }
  });
  nodes = nodes.addToEnd("task_list", {
    group: "block",
    content: "task_item+",
    parseDOM: [{
      tag: "ul[data-type='task-list']"
    }],
    toDOM() {
      return ["ul", {
        "data-type": "task-list"
      }, 0];
    }
  });
  nodes = nodes.addToEnd("table", {
    group: "block",
    content: "table_row+",
    isolating: true,
    attrs: {
      layout: {
        default: "fixed"
      }
    },
    parseDOM: [{
      tag: "table",
      getAttrs: dom => ({
        layout: dom?.getAttribute?.("data-layout") === "auto" ? "auto" : "fixed"
      })
    }],
    toDOM(node) {
      return ["table", {
        "data-layout": node.attrs.layout === "auto" ? "auto" : "fixed"
      }, ["tbody", 0]];
    }
  });
  nodes = nodes.addToEnd("table_row", {
    content: "table_cell+",
    parseDOM: [{
      tag: "tr"
    }],
    toDOM() {
      return ["tr", 0];
    }
  });
  nodes = nodes.addToEnd("table_cell", {
    content: "block+",
    isolating: true,
    parseDOM: [{
      tag: "td"
    }, {
      tag: "th"
    }],
    toDOM() {
      return ["td", 0];
    }
  });
  nodes = nodes.addToEnd("task_item", {
    content: "paragraph block*",
    defining: true,
    attrs: {
      checked: {
        default: false
      }
    },
    parseDOM: [{
      tag: "li[data-type='task-item']",
      getAttrs: dom => ({
        checked: String(dom?.getAttribute?.("data-checked") || "") === "true"
      })
    }],
    toDOM(node) {
      return ["li", {
        "data-type": "task-item",
        "data-checked": node.attrs.checked ? "true" : "false"
      }, 0];
    }
  });
  const marks = pm.basicSchema.spec.marks.addToEnd("underline", {
    parseDOM: [{
      tag: "u"
    }, {
      style: "text-decoration",
      getAttrs: value => String(value || "").includes("underline") ? null : false
    }],
    toDOM() {
      return ["u", 0];
    }
  }).addToEnd("text_color", {
    attrs: {
      color: {
        default: NOTE_EDITOR_DEFAULT_COLOR
      }
    },
    parseDOM: [{
      tag: "span[data-note-color]",
      getAttrs: dom => {
        const color = safeNoteColor(dom?.getAttribute?.("data-note-color"));
        return color ? {
          color
        } : false;
      }
    }, {
      style: "color",
      getAttrs: value => {
        const color = safeNoteColor(value);
        return color ? {
          color
        } : false;
      }
    }],
    toDOM(mark) {
      const color = normalizeNoteEditorColor(mark.attrs.color);
      return ["span", {
        "data-note-color": color,
        style: `color: ${color}`
      }, 0];
    }
  });
  noteEditorSchemaCache = new pm.Schema({
    nodes,
    marks
  });
  return noteEditorSchemaCache;
}
function normalizeHtmlForNoteEditor(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = sanitizeHtml(html || "");
  wrapper.querySelectorAll("div").forEach(div => {
    const p = document.createElement("p");
    if (div.hasAttribute("data-indent")) p.setAttribute("data-indent", div.getAttribute("data-indent"));
    if (div.getAttribute("data-size") === "small") p.setAttribute("data-size", "small");
    p.innerHTML = div.innerHTML || "<br>";
    div.replaceWith(p);
  });
  if (!wrapper.textContent.trim() && !wrapper.querySelector("br, ul, ol, blockquote, table, h1, h2, h3")) {
    wrapper.innerHTML = "<p></p>";
  }
  return wrapper.innerHTML;
}
function parseNoteEditorDoc(schema, html) {
  const pm = noteEditorPM();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = normalizeHtmlForNoteEditor(html);
  return pm.DOMParser.fromSchema(schema).parse(wrapper);
}
function serializeNoteEditorDoc(schema, doc) {
  const pm = noteEditorPM();
  const fragment = pm.DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return sanitizeHtml(wrapper.innerHTML);
}
function noteEditorIsEmptyDoc(doc) {
  return doc.childCount === 1 && doc.firstChild?.isTextblock && doc.firstChild.content.size === 0;
}
function noteEditorPlaceholderPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      decorations(state) {
        if (!noteEditorIsEmptyDoc(state.doc)) return null;
        const first = state.doc.firstChild;
        return pm.DecorationSet.create(state.doc, [pm.Decoration.node(0, first.nodeSize, {
          class: "is-editor-empty",
          "data-placeholder": "Write your note here..."
        })]);
      }
    }
  });
}
function noteEditorHashtagPlugin() {
  const pm = noteEditorPM();
  const key = new pm.PluginKey("note-hashtag-decorations");
  return new pm.Plugin({
    key,
    props: {
      decorations(state) {
        const decorations = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text?.includes("#")) return;
          const regex = /(^|[^\p{L}\p{N}_-])#([\p{L}\p{N}_-]{1,48})/gu;
          let match;
          while (match = regex.exec(node.text)) {
            const start = match.index + match[1].length;
            const end = start + match[2].length + 1;
            decorations.push(pm.Decoration.inline(pos + start, pos + end, {
              class: "note-hashtag"
            }));
          }
        });
        return decorations.length ? pm.DecorationSet.create(state.doc, decorations) : null;
      }
    }
  });
}
function taskItemFromDom(view, itemEl, schema) {
  const rawPositions = [];
  try {
    rawPositions.push(view.posAtDOM(itemEl, 0));
  } catch {}
  try {
    rawPositions.push(view.posAtDOM(itemEl, itemEl.childNodes.length));
  } catch {}
  for (const rawPos of rawPositions) {
    const pos = Math.max(0, Math.min(view.state.doc.content.size, Number(rawPos) || 0));
    const $pos = view.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type === schema.nodes.task_item) {
        return {
          node,
          pos: $pos.before(depth)
        };
      }
    }
  }
  return null;
}
function noteEditorChecklistPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      handleClick(view, pos, event) {
        const targetEl = event.target?.closest?.("li[data-type='task-item']");
        const pointEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("li[data-type='task-item']");
        const itemEl = targetEl || pointEl;
        if (!itemEl || !view.dom.contains(itemEl)) return false;
        const rect = itemEl.getBoundingClientRect();
        if (event.clientX > rect.left + 34) return false;
        const item = taskItemFromDom(view, itemEl, schema);
        if (!item) return false;
        view.dispatch(view.state.tr.setNodeMarkup(item.pos, undefined, {
          ...item.node.attrs,
          checked: !item.node.attrs.checked
        }).scrollIntoView());
        view.focus();
        return true;
      }
    }
  });
}
function noteEditorListShortcutPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== " " || from !== to) return false;
        const state = view.state;
        if (currentListKind(state) !== "none" || insideTable(state)) return false;
        const block = currentTextblockWithPos(state);
        if (!block || block.node.type !== schema.nodes.paragraph) return false;
        const blockStart = block.pos + 1;
        const blockEnd = blockStart + block.node.content.size;
        if (from !== blockEnd) return false;
        const markerText = state.doc.textBetween(blockStart, from, "\n", "\n");
        if (markerText === "-") {
          const wrapBullet = pm.wrapInList(schema.nodes.bullet_list, {
            style: "disc"
          });
          if (!wrapBullet(state, null)) return false;
          view.dispatch(state.tr.delete(blockStart, from));
          wrapBullet(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
          view.focus();
          return true;
        }
        const hierarchy = markerText.match(/^\d{1,3}(?:\.\d{1,3}){1,4}\.?$/);
        if (hierarchy) {
          const parts = markerText.replace(/\.$/, "").split(".").map(part => Math.max(1, Math.min(999, Number(part) || 1)));
          const depth = clampNoteIndent(parts.length - 1);
          const order = parts[parts.length - 1] || 1;
          const wrapOrdered = pm.wrapInList(schema.nodes.ordered_list, {
            order,
            style: "decimal",
            depth
          });
          if (!wrapOrdered(state, null)) return false;
          view.dispatch(state.tr.delete(blockStart, from));
          wrapOrdered(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
          view.focus();
          return true;
        }
        const match = markerText.match(/^(\d{1,3})[.)]$/);
        if (!match) return false;
        const order = Math.max(1, Math.min(999, Number(match[1]) || 1));
        const wrapOrdered = pm.wrapInList(schema.nodes.ordered_list, {
          order,
          style: "decimal"
        });
        if (!wrapOrdered(state, null)) return false;
        view.dispatch(state.tr.delete(blockStart, from));
        wrapOrdered(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
        view.focus();
        return true;
      }
    }
  });
}
function placeSelectionAfterTable(view, schema, rawPos) {
  const pm = noteEditorPM();
  if (!view || !pm) return false;
  const pos = Math.max(0, Math.min(view.state.doc.content.size, Number(rawPos) || 0));
  let tr = view.state.tr;
  const nodeAfter = tr.doc.nodeAt(pos);
  if (!nodeAfter || !nodeAfter.isTextblock) tr = tr.insert(pos, schema.nodes.paragraph.create());
  tr = selectNearPosition(pm, tr, pos + 1).scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return true;
}
function noteEditorTableExitPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      decorations(state) {
        const decorations = [];
        state.doc.descendants((node, pos) => {
          if (node.type !== schema.nodes.table) return true;
          decorations.push(pm.Decoration.widget(pos + node.nodeSize, (view, getPos) => {
            const zone = document.createElement("div");
            zone.className = "note-table-exit-zone";
            zone.setAttribute("contenteditable", "false");
            zone.setAttribute("aria-hidden", "true");
            zone.addEventListener("pointerdown", event => {
              event.preventDefault();
              event.stopPropagation();
              placeSelectionAfterTable(view, schema, getPos());
            });
            return zone;
          }, {
            side: 1
          }));
          return false;
        });
        return decorations.length ? pm.DecorationSet.create(state.doc, decorations) : null;
      }
    }
  });
}
function createNoteEditorState(schema, html) {
  const pm = noteEditorPM();
  const doc = parseNoteEditorDoc(schema, html);
  const commands = noteEditorKeymapCommands(schema);
  return pm.EditorState.create({
    doc,
    plugins: [pm.history({
      depth: 120
    }), noteEditorHashtagPlugin(), noteEditorChecklistPlugin(schema), noteEditorListShortcutPlugin(schema), noteEditorTableExitPlugin(schema), noteEditorPlaceholderPlugin(schema), pm.keymap(commands), pm.keymap(pm.baseKeymap)]
  });
}
function noteEditorKeymapCommands(schema) {
  const pm = noteEditorPM();
  return {
    "Mod-b": pm.toggleMark(schema.marks.strong),
    "Mod-i": pm.toggleMark(schema.marks.em),
    "Mod-u": pm.toggleMark(schema.marks.underline),
    "Mod-z": pm.undo,
    "Shift-Mod-z": pm.redo,
    "Mod-y": pm.redo,
    "Enter": splitActiveListItemCommand(schema),
    "Tab": indentCommand(schema, 1),
    "Shift-Tab": indentCommand(schema, -1)
  };
}
function markIsActive(state, markType) {
  const {
    from,
    to,
    empty,
    $from
  } = state.selection;
  if (empty) return Boolean(markType.isInSet(state.storedMarks || $from.marks()));
  return state.doc.rangeHasMark(from, to, markType);
}
function currentTextColor(state, markType) {
  if (!markType) return NOTE_EDITOR_DEFAULT_COLOR;
  const {
    from,
    to,
    empty,
    $from
  } = state.selection;
  if (empty) {
    const mark = markType.isInSet(state.storedMarks || $from.marks());
    return normalizeNoteEditorColor(mark?.attrs?.color);
  }
  let found = "";
  state.doc.nodesBetween(from, to, node => {
    if (!node.isText || found) return true;
    const mark = markType.isInSet(node.marks || []);
    if (mark) found = normalizeNoteEditorColor(mark.attrs.color);
    return !found;
  });
  return found || NOTE_EDITOR_DEFAULT_COLOR;
}
function currentTextblockWithPos(state) {
  const {
    $from
  } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isTextblock) return {
      node,
      pos: $from.before(depth),
      depth
    };
  }
  return null;
}
function findParentNodeOfType(state, type) {
  const {
    $from
  } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === type) return {
      node,
      pos: $from.before(depth),
      depth
    };
  }
  return null;
}
function currentListKind(state) {
  const schema = state.schema;
  if (findParentNodeOfType(state, schema.nodes.task_list)) return "checklist";
  if (findParentNodeOfType(state, schema.nodes.bullet_list)) return "bullet";
  if (findParentNodeOfType(state, schema.nodes.ordered_list)) return "ordered";
  return "none";
}
function currentListInfo(state) {
  const schema = state.schema;
  const task = findParentNodeOfType(state, schema.nodes.task_list);
  if (task) return {
    kind: "checklist",
    node: task.node,
    pos: task.pos,
    style: "checklist",
    depth: 0
  };
  const bullet = findParentNodeOfType(state, schema.nodes.bullet_list);
  if (bullet) return {
    kind: "bullet",
    node: bullet.node,
    pos: bullet.pos,
    style: bullet.node.attrs.style || "disc",
    depth: clampNoteIndent(bullet.node.attrs.depth)
  };
  const ordered = findParentNodeOfType(state, schema.nodes.ordered_list);
  if (ordered) return {
    kind: "ordered",
    node: ordered.node,
    pos: ordered.pos,
    style: ordered.node.attrs.style || "decimal",
    depth: clampNoteIndent(ordered.node.attrs.depth)
  };
  return {
    kind: "none",
    node: null,
    pos: null,
    style: "none",
    depth: 0
  };
}
function activeListItemType(state) {
  const schema = state.schema;
  if (findParentNodeOfType(state, schema.nodes.task_item)) return schema.nodes.task_item;
  if (findParentNodeOfType(state, schema.nodes.list_item)) return schema.nodes.list_item;
  return null;
}
function insideTable(state) {
  return Boolean(findParentNodeOfType(state, state.schema.nodes.table));
}
function currentTableInfo(state) {
  const schema = state.schema;
  const {
    $from
  } = state.selection;
  let tableDepth = null;
  let rowDepth = null;
  let cellDepth = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.table_cell && cellDepth == null) cellDepth = depth;
    if (node.type === schema.nodes.table_row && rowDepth == null) rowDepth = depth;
    if (node.type === schema.nodes.table && tableDepth == null) tableDepth = depth;
  }
  if (tableDepth == null) return null;
  const table = $from.node(tableDepth);
  const row = rowDepth != null ? $from.node(rowDepth) : null;
  const cell = cellDepth != null ? $from.node(cellDepth) : null;
  return {
    table,
    tablePos: $from.before(tableDepth),
    row,
    rowPos: rowDepth != null ? $from.before(rowDepth) : null,
    rowIndex: rowDepth != null ? $from.index(tableDepth) : 0,
    cell,
    cellPos: cellDepth != null ? $from.before(cellDepth) : null,
    cellIndex: cellDepth != null ? $from.index(rowDepth) : 0,
    rowCount: table.childCount,
    colCount: table.firstChild?.childCount || 0
  };
}
function textLevelForBlock(node, schema) {
  if (!node) return "body";
  if (node.type === schema.nodes.heading) {
    if (Number(node.attrs.level) === 1) return "title";
    if (Number(node.attrs.level) === 2) return "heading";
    return "subheading";
  }
  if (node.type === schema.nodes.paragraph && node.attrs.size === "small") return "small";
  return "body";
}
function nextNoteTextLevel(current) {
  const index = NOTE_TEXT_LEVELS.indexOf(normalizeNoteTextLevel(current));
  return NOTE_TEXT_LEVELS[(index + 1) % NOTE_TEXT_LEVELS.length];
}
function readNoteEditorToolbarState(view) {
  if (!view) return NOTE_EDITOR_EMPTY_TOOLBAR;
  const pm = noteEditorPM();
  const state = view.state;
  const schema = state.schema;
  const textblock = currentTextblockWithPos(state);
  const listInfo = currentListInfo(state);
  const textLevel = textLevelForBlock(textblock?.node, schema);
  return {
    bold: markIsActive(state, schema.marks.strong),
    italic: markIsActive(state, schema.marks.em),
    underline: markIsActive(state, schema.marks.underline),
    heading: textLevel !== "body",
    bullet: listInfo.kind === "bullet",
    ordered: listInfo.kind === "ordered",
    checklist: listInfo.kind === "checklist",
    quote: Boolean(findParentNodeOfType(state, schema.nodes.blockquote)),
    table: insideTable(state),
    canUndo: pm.undo(state),
    canRedo: pm.redo(state),
    indentLevel: clampNoteIndent(textblock?.node.attrs.indent),
    selectionEmpty: state.selection.empty,
    color: currentTextColor(state, schema.marks.text_color),
    textLevel,
    listStyle: listInfo.style
  };
}
function selectedTextblockPositions(state) {
  const schema = state.schema;
  const blocks = [];
  const seen = new Set();
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (!node.isTextblock || node.type !== schema.nodes.paragraph && node.type !== schema.nodes.heading) return true;
    if (!seen.has(pos)) {
      seen.add(pos);
      blocks.push({
        node,
        pos
      });
    }
    return false;
  });
  if (!blocks.length) {
    const current = currentTextblockWithPos(state);
    if (current && (current.node.type === schema.nodes.paragraph || current.node.type === schema.nodes.heading)) {
      blocks.push({
        node: current.node,
        pos: current.pos
      });
    }
  }
  return blocks;
}
function updateSelectedBlockIndent(schema, delta) {
  return (state, dispatch) => {
    const blocks = selectedTextblockPositions(state);
    if (!blocks.length) return false;
    let tr = state.tr;
    let changed = false;
    blocks.forEach(({
      node,
      pos
    }) => {
      const nextIndent = clampNoteIndent(Number(node.attrs.indent || 0) + delta);
      if (nextIndent === Number(node.attrs.indent || 0)) return;
      tr = tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        indent: nextIndent
      });
      changed = true;
    });
    if (changed && dispatch) dispatch(tr.scrollIntoView());
    return changed;
  };
}
function cycleTextLevelCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const block = currentTextblockWithPos(state);
    const indent = clampNoteIndent(block?.node.attrs.indent);
    const nextLevel = nextNoteTextLevel(textLevelForBlock(block?.node, schema));
    if (nextLevel === "title") {
      return pm.setBlockType(schema.nodes.heading, {
        level: 1,
        indent
      })(state, dispatch);
    }
    if (nextLevel === "heading") {
      return pm.setBlockType(schema.nodes.heading, {
        level: 2,
        indent
      })(state, dispatch);
    }
    if (nextLevel === "subheading") {
      return pm.setBlockType(schema.nodes.heading, {
        level: 3,
        indent
      })(state, dispatch);
    }
    return pm.setBlockType(schema.nodes.paragraph, {
      indent,
      size: nextLevel === "small" ? "small" : "body"
    })(state, dispatch);
  };
}
function splitActiveListItemCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const itemType = activeListItemType(state);
    return itemType ? pm.splitListItem(itemType)(state, dispatch) : false;
  };
}
function setListMarkup(state, dispatch, listInfo, type, attrs = {}) {
  if (!listInfo.node || listInfo.pos == null) return false;
  if (dispatch) dispatch(state.tr.setNodeMarkup(listInfo.pos, type, attrs).scrollIntoView());
  return true;
}
function cycleListCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const listInfo = currentListInfo(state);
    if (listInfo.kind === "checklist") return pm.liftListItem(schema.nodes.task_item)(state, dispatch);
    if (listInfo.kind === "bullet") {
      const index = NOTE_BULLET_STYLES.indexOf(listInfo.style);
      if (index >= 0 && index < NOTE_BULLET_STYLES.length - 1) {
        return setListMarkup(state, dispatch, listInfo, schema.nodes.bullet_list, {
          style: NOTE_BULLET_STYLES[index + 1],
          depth: listInfo.depth || 0
        });
      }
      return setListMarkup(state, dispatch, listInfo, schema.nodes.ordered_list, {
        order: 1,
        style: "decimal",
        depth: listInfo.depth || 0
      });
    }
    if (listInfo.kind === "ordered") {
      const index = NOTE_ORDERED_STYLES.indexOf(listInfo.style);
      if (index >= 0 && index < NOTE_ORDERED_STYLES.length - 1) {
        return setListMarkup(state, dispatch, listInfo, schema.nodes.ordered_list, {
          order: listInfo.node.attrs.order || 1,
          style: NOTE_ORDERED_STYLES[index + 1],
          depth: listInfo.depth || 0
        });
      }
      return pm.liftListItem(schema.nodes.list_item)(state, dispatch);
    }
    return pm.wrapInList(schema.nodes.bullet_list, {
      style: "disc"
    })(state, dispatch);
  };
}
function taskListFromListNode(schema, listNode) {
  const items = [];
  listNode.forEach(child => {
    const content = child.content;
    items.push(schema.nodes.task_item.create({
      checked: false
    }, content));
  });
  return schema.nodes.task_list.create(null, items);
}
function insertEmptyChecklist(schema, state, dispatch) {
  const item = schema.nodes.task_item.create({
    checked: false
  }, schema.nodes.paragraph.create());
  const list = schema.nodes.task_list.create(null, [item]);
  if (dispatch) dispatch(state.tr.replaceSelectionWith(list).scrollIntoView());
  return true;
}
function toggleChecklistCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const listInfo = currentListInfo(state);
    if (listInfo.kind === "checklist") {
      return pm.liftListItem(schema.nodes.task_item)(state, dispatch);
    }
    if ((listInfo.kind === "bullet" || listInfo.kind === "ordered") && listInfo.node) {
      const taskList = taskListFromListNode(schema, listInfo.node);
      if (dispatch) dispatch(state.tr.replaceWith(listInfo.pos, listInfo.pos + listInfo.node.nodeSize, taskList).scrollIntoView());
      return true;
    }
    return pm.wrapInList(schema.nodes.task_list)(state, dispatch) || insertEmptyChecklist(schema, state, dispatch);
  };
}
function createEmptyTable(schema, rows = 2, cols = 2) {
  const tableRows = [];
  const safeRows = Math.max(1, Math.min(12, Number(rows) || 2));
  const safeCols = Math.max(1, Math.min(8, Number(cols) || 2));
  for (let rowIndex = 0; rowIndex < safeRows; rowIndex += 1) {
    const cells = [];
    for (let colIndex = 0; colIndex < safeCols; colIndex += 1) {
      cells.push(schema.nodes.table_cell.create(null, schema.nodes.paragraph.create()));
    }
    tableRows.push(schema.nodes.table_row.create(null, cells));
  }
  return schema.nodes.table.create(null, tableRows);
}
function createEmptyTableRow(schema, cols = 2) {
  const safeCols = Math.max(1, Math.min(8, Number(cols) || 2));
  const cells = [];
  for (let colIndex = 0; colIndex < safeCols; colIndex += 1) {
    cells.push(schema.nodes.table_cell.create(null, schema.nodes.paragraph.create()));
  }
  return schema.nodes.table_row.create(null, cells);
}
function tableCellStart(tablePos, table, rowIndex, cellIndex) {
  let rowOffset = 0;
  for (let index = 0; index < rowIndex; index += 1) rowOffset += table.child(index).nodeSize;
  const row = table.child(rowIndex);
  let cellOffset = 0;
  for (let index = 0; index < cellIndex; index += 1) cellOffset += row.child(index).nodeSize;
  return tablePos + 1 + rowOffset + 1 + cellOffset;
}
function selectNearPosition(pm, tr, pos) {
  const safePos = Math.max(0, Math.min(tr.doc.content.size, Number(pos) || 0));
  return tr.setSelection(pm.TextSelection.near(tr.doc.resolve(safePos)));
}
function findNearestTableInDoc(doc, schema, around, expectedSize) {
  let best = null;
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.table) return true;
    if (expectedSize && node.nodeSize !== expectedSize) return false;
    const score = Math.abs(pos - around);
    if (!best || score < best.score) best = {
      node,
      pos,
      score
    };
    return false;
  });
  return best;
}
function ensureParagraphAfterTableCommand(schema, pm) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info) return false;
    const tableEnd = info.tablePos + info.table.nodeSize;
    if (dispatch) {
      let tr = state.tr;
      const nodeAfter = state.doc.nodeAt(tableEnd);
      if (!nodeAfter || !nodeAfter.isTextblock) tr = tr.insert(tableEnd, schema.nodes.paragraph.create());
      tr = selectNearPosition(pm, tr, tableEnd + 1).scrollIntoView();
      dispatch(tr);
    }
    return true;
  };
}
function deleteTableCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info) return false;
    if (dispatch) {
      let tr = state.tr.replaceWith(info.tablePos, info.tablePos + info.table.nodeSize, schema.nodes.paragraph.create()).scrollIntoView();
      tr = selectNearPosition(pm, tr, info.tablePos + 1);
      dispatch(tr);
    }
    return true;
  };
}
function addTableRowCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || !info.row) return false;
    const insertPos = info.rowPos + info.row.nodeSize;
    if (dispatch) dispatch(state.tr.insert(insertPos, createEmptyTableRow(schema, info.colCount)).scrollIntoView());
    return true;
  };
}
function deleteTableRowCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || !info.row) return false;
    if (info.rowCount <= 1) return deleteTableCommand(schema)(state, dispatch);
    if (dispatch) dispatch(state.tr.delete(info.rowPos, info.rowPos + info.row.nodeSize).scrollIntoView());
    return true;
  };
}
function addTableColumnCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || info.cellIndex == null) return false;
    let tr = state.tr;
    const inserts = [];
    for (let rowIndex = 0; rowIndex < info.table.childCount; rowIndex += 1) {
      const row = info.table.child(rowIndex);
      const safeIndex = Math.min(info.cellIndex, row.childCount - 1);
      const cell = row.child(safeIndex);
      const cellPos = tableCellStart(info.tablePos, info.table, rowIndex, safeIndex);
      inserts.push({
        pos: cellPos + cell.nodeSize,
        node: schema.nodes.table_cell.create(null, schema.nodes.paragraph.create())
      });
    }
    inserts.sort((a, b) => b.pos - a.pos).forEach(insert => {
      tr = tr.insert(insert.pos, insert.node);
    });
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}
function deleteTableColumnCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || info.cellIndex == null) return false;
    if (info.colCount <= 1) return deleteTableCommand(schema)(state, dispatch);
    let tr = state.tr;
    const deletes = [];
    for (let rowIndex = 0; rowIndex < info.table.childCount; rowIndex += 1) {
      const row = info.table.child(rowIndex);
      const safeIndex = Math.min(info.cellIndex, row.childCount - 1);
      const cell = row.child(safeIndex);
      const cellPos = tableCellStart(info.tablePos, info.table, rowIndex, safeIndex);
      deletes.push({
        from: cellPos,
        to: cellPos + cell.nodeSize
      });
    }
    deletes.sort((a, b) => b.from - a.from).forEach(range => {
      tr = tr.delete(range.from, range.to);
    });
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}
function toggleAutoFitTableCommand() {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info) return false;
    const nextLayout = info.table.attrs.layout === "auto" ? "fixed" : "auto";
    if (dispatch) {
      dispatch(state.tr.setNodeMarkup(info.tablePos, undefined, {
        ...info.table.attrs,
        layout: nextLayout
      }).scrollIntoView());
    }
    return true;
  };
}
function insertTableCommand(schema, options = {}) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const table = createEmptyTable(schema, options.rows || 2, options.cols || 2);
    if (dispatch) {
      const from = state.selection.from;
      let tr = state.tr.replaceSelectionWith(table);
      const mappedFrom = tr.mapping.map(from, -1);
      const inserted = findNearestTableInDoc(tr.doc, schema, mappedFrom, table.nodeSize);
      const tablePos = inserted?.pos ?? Math.max(0, mappedFrom - 1);
      const tableEnd = tablePos + table.nodeSize;
      const nodeAfter = tr.doc.nodeAt(tableEnd);
      if (!nodeAfter || !nodeAfter.isTextblock) tr = tr.insert(tableEnd, schema.nodes.paragraph.create());
      tr = tr.scrollIntoView();
      const focusPos = Math.min(tr.doc.content.size - 1, tablePos + 4);
      if (focusPos > 0) tr = selectNearPosition(pm, tr, focusPos);
      dispatch(tr);
    }
    return true;
  };
}
function toggleQuoteCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    if (findParentNodeOfType(state, schema.nodes.blockquote)) return pm.lift(state, dispatch);
    const list = findParentNodeOfType(state, schema.nodes.bullet_list) || findParentNodeOfType(state, schema.nodes.ordered_list);
    if (list) {
      const listSelection = pm.NodeSelection.create(state.doc, list.pos);
      const selectedState = state.apply(state.tr.setSelection(listSelection));
      return pm.wrapIn(schema.nodes.blockquote)(selectedState, dispatch);
    }
    return pm.wrapIn(schema.nodes.blockquote)(state, dispatch);
  };
}
function indentCommand(schema, delta) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    if (currentListKind(state) !== "none") {
      const itemType = activeListItemType(state);
      if (!itemType) return false;
      const command = delta > 0 ? pm.sinkListItem(itemType) : pm.liftListItem(itemType);
      if (command(state, dispatch)) return true;
      const listInfo = currentListInfo(state);
      if (!listInfo.node || listInfo.pos == null || listInfo.kind === "checklist") return false;
      const nextDepth = clampNoteIndent((listInfo.depth || 0) + delta);
      if (nextDepth === (listInfo.depth || 0)) return false;
      const attrs = listInfo.kind === "ordered" ? {
        order: listInfo.node.attrs.order || 1,
        style: listInfo.style || "decimal",
        depth: nextDepth
      } : {
        style: listInfo.style || "disc",
        depth: nextDepth
      };
      return setListMarkup(state, dispatch, listInfo, listInfo.node.type, attrs);
    }
    return updateSelectedBlockIndent(schema, delta)(state, dispatch);
  };
}
function setTextColorCommand(schema, color) {
  const pm = noteEditorPM();
  const safeColor = normalizeNoteEditorColor(color);
  return (state, dispatch) => {
    const markType = schema.marks.text_color;
    if (!markType) return false;
    const {
      from,
      to,
      empty
    } = state.selection;
    if (dispatch) {
      let tr = state.tr.removeMark(from, to, markType);
      if (empty) tr = tr.addStoredMark(markType.create({
        color: safeColor
      }));else tr = tr.addMark(from, to, markType.create({
        color: safeColor
      })).scrollIntoView();
      dispatch(tr);
    }
    return true;
  };
}
function clearBlockEffectsForCommand(view, schema, commandName) {
  const pm = noteEditorPM();
  if (!view || !pm || !["heading", "quote"].includes(commandName)) return;
  if (commandName === "quote" && findParentNodeOfType(view.state, schema.nodes.blockquote)) return;
  for (let index = 0; index < 5 && currentListKind(view.state) !== "none"; index += 1) {
    const itemType = activeListItemType(view.state);
    if (!itemType) break;
    const lifted = pm.liftListItem(itemType)(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
    if (!lifted) break;
  }
  if (findParentNodeOfType(view.state, schema.nodes.blockquote)) {
    pm.lift(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
  }
  if (commandName === "quote") {
    const block = currentTextblockWithPos(view.state);
    if (block?.node?.type === schema.nodes.heading) {
      pm.setBlockType(schema.nodes.paragraph, {
        indent: clampNoteIndent(block.node.attrs.indent),
        size: "body"
      })(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
    }
  }
}
function runNoteEditorCommand(view, commandName, options = {}) {
  const pm = noteEditorPM();
  if (!view || !pm) return false;
  const schema = view.state.schema;
  clearBlockEffectsForCommand(view, schema, commandName);
  const commands = {
    bold: pm.toggleMark(schema.marks.strong),
    italic: pm.toggleMark(schema.marks.em),
    underline: pm.toggleMark(schema.marks.underline),
    heading: cycleTextLevelCommand(schema),
    list: cycleListCommand(schema),
    checklist: toggleChecklistCommand(schema),
    table: insertTableCommand(schema, options),
    "insert-table": insertTableCommand(schema, options),
    "table-row-add": addTableRowCommand(schema),
    "table-row-delete": deleteTableRowCommand(schema),
    "table-col-add": addTableColumnCommand(schema),
    "table-col-delete": deleteTableColumnCommand(schema),
    "table-delete": deleteTableCommand(schema),
    "table-autofit": toggleAutoFitTableCommand(),
    "table-after": ensureParagraphAfterTableCommand(schema, pm),
    color: setTextColorCommand(schema, options.color || NOTE_EDITOR_DEFAULT_COLOR),
    quote: toggleQuoteCommand(schema),
    "indent-in": indentCommand(schema, 1),
    "indent-out": indentCommand(schema, -1),
    undo: pm.undo,
    redo: pm.redo
  };
  const command = commands[commandName];
  if (!command) return false;
  const handled = command(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
  if (handled) view.focus();
  return handled;
}
function noteEditorKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round((window.innerHeight || 0) - viewport.height - (viewport.offsetTop || 0)));
}
function scrollNoteEditorSelectionIntoView(view, options = {}) {
  if (!view || typeof window === "undefined") return;
  const scrollEl = view.dom.closest(".note-editor-scroll");
  if (!scrollEl) return;
  const keyboardInset = noteEditorKeyboardInset();
  if (options.keyboardOnly && keyboardInset < 48) return;
  let coords;
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const scrollRect = scrollEl.getBoundingClientRect();
  const topLimit = Math.max(scrollRect.top + 16, viewportTop + 72);
  const bottomLimit = Math.min(scrollRect.bottom - 28, viewportBottom - (keyboardInset > 48 ? 104 : 36));
  if (bottomLimit <= topLimit) return;
  if (coords.bottom > bottomLimit) {
    scrollEl.scrollTop += coords.bottom - bottomLimit + 24;
  } else if (coords.top < topLimit) {
    scrollEl.scrollTop += coords.top - topLimit - 24;
  }
}
function ProseMirrorNoteEditor({
  initialHtml,
  className = "",
  onReady,
  onToolbarState
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const readyRef = useRef(onReady);
  const toolbarRef = useRef(onToolbarState);
  useEffect(() => {
    readyRef.current = onReady;
    toolbarRef.current = onToolbarState;
  }, [onReady, onToolbarState]);
  useEffect(() => {
    const pm = noteEditorPM();
    const schema = createNoteEditorSchema();
    const host = hostRef.current;
    if (!pm || !schema || !host) return undefined;
    host.innerHTML = "";
    const view = new pm.EditorView(host, {
      state: createNoteEditorState(schema, initialHtml),
      handleDOMEvents: {
        focus(view) {
          window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view, {
            keyboardOnly: true
          }));
          return false;
        },
        keyup(view) {
          window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view, {
            keyboardOnly: true
          }));
          return false;
        }
      },
      dispatchTransaction(transaction) {
        const shouldScroll = transaction.docChanged || transaction.getMeta("scrollIntoView");
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
        if (shouldScroll) window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view));
      }
    });
    viewRef.current = view;
    const api = {
      getHtml() {
        return serializeNoteEditorDoc(schema, view.state.doc);
      },
      focus() {
        view.focus();
        window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view, {
          keyboardOnly: true
        }));
      },
      run(commandName, options = {}) {
        view.focus();
        view.dispatch(view.state.tr.setSelection(view.state.selection));
        const handled = runNoteEditorCommand(view, commandName, options);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
        window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view));
        return handled;
      },
      setHtml(html) {
        const nextState = createNoteEditorState(schema, html);
        view.updateState(nextState);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
      }
    };
    readyRef.current?.(api);
    toolbarRef.current?.(readNoteEditorToolbarState(view));
    return () => {
      readyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
      host.innerHTML = "";
    };
  }, [initialHtml]);
  return React.createElement("div", {
    ref: hostRef,
    className: className
  });
}
function normalizeTableDimension(value, fallback, max) {
  const parsed = Number.parseInt(String(value || "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}
function useNoteTablePanel(toolbarState, runEditorCommandAfterFocus) {
  const tablePanelActionRef = useRef(0);
  const [tablePanel, setTablePanel] = useState(null);
  const [tableRows, setTableRows] = useState("2");
  const [tableCols, setTableCols] = useState("2");
  function openTablePanel() {
    setTablePanel(prev => {
      const nextType = toolbarState.table ? "actions" : "insert";
      return prev === nextType ? null : nextType;
    });
  }
  function updateTableDimension(setter) {
    return event => setter(event.target.value.replace(/\D/g, "").slice(0, 2));
  }
  function settleTableDimension(setter, value, fallback, max) {
    setter(String(normalizeTableDimension(value, fallback, max)));
  }
  function insertCustomTable() {
    const options = {
      rows: normalizeTableDimension(tableRows, 2, 12),
      cols: normalizeTableDimension(tableCols, 2, 8)
    };
    setTableRows(String(options.rows));
    setTableCols(String(options.cols));
    setTablePanel(null);
    runEditorCommandAfterFocus("insert-table", options);
  }
  function submitCustomTable(event) {
    event.preventDefault();
    event.stopPropagation();
    insertCustomTable();
  }
  function runTableCommand(command) {
    setTablePanel(null);
    runEditorCommandAfterFocus(command);
  }
  function runTablePanelAction(event, action) {
    event.preventDefault();
    event.stopPropagation();
    const stamp = Date.now();
    if (stamp - tablePanelActionRef.current < 500) return;
    tablePanelActionRef.current = stamp;
    action();
  }
  function tablePanelButtonProps(action) {
    return {
      onPointerDown: event => runTablePanelAction(event, action),
      onMouseDown: event => {
        event.preventDefault();
        event.stopPropagation();
      },
      onTouchEnd: event => runTablePanelAction(event, action),
      onKeyDown: event => {
        if (event.key === "Enter" || event.key === " ") runTablePanelAction(event, action);
      },
      onTouchStart: event => {
        event.stopPropagation();
      },
      onClick: event => runTablePanelAction(event, action),
      tabIndex: -1
    };
  }
  return {
    tablePanel,
    setTablePanel,
    tableRows,
    tableCols,
    setTableRows,
    setTableCols,
    openTablePanel,
    updateTableDimension,
    settleTableDimension,
    insertCustomTable,
    submitCustomTable,
    runTableCommand,
    tablePanelButtonProps
  };
}
function NoteTableGlyph({
  active = false,
  menuHint = false
}) {
  return React.createElement("span", {
    className: `note-table-glyph ${active ? "is-active" : ""}`
  }, React.createElement("span", {
    className: "note-table-glyph-grid",
    "aria-hidden": "true"
  }), menuHint ? React.createElement("span", {
    className: "note-table-menu-hint",
    "aria-hidden": "true"
  }, React.createElement("span", null), React.createElement("span", null), React.createElement("span", null)) : null);
}
function NoteColorGlyph({
  color = "#ffd2d7",
  active = false
}) {
  const safeColor = safeNoteColor(color) || NOTE_EDITOR_DEFAULT_COLOR;
  return React.createElement("span", {
    className: `note-color-glyph ${active ? "is-active" : ""}`,
    "aria-hidden": "true"
  }, React.createElement("span", {
    className: "note-color-glyph-fill",
    style: {
      background: safeColor
    }
  }));
}
function readVisualViewportMetrics() {
  if (typeof window === "undefined") return {
    keyboardInset: 0,
    visualHeight: 0,
    visualTop: 0
  };
  const viewport = window.visualViewport;
  const layoutHeight = window.innerHeight || 0;
  const visualHeight = Math.round(viewport?.height || layoutHeight || 0);
  const visualTop = Math.round(viewport?.offsetTop || 0);
  const keyboardInset = Math.max(0, Math.round(layoutHeight - visualHeight - visualTop));
  return {
    keyboardInset,
    visualHeight,
    visualTop
  };
}
function useVisualViewportMetrics() {
  const [metrics, setMetrics] = useState(readVisualViewportMetrics);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setMetrics(readVisualViewportMetrics()));
    };
    const viewport = window.visualViewport;
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return metrics;
}
function RichNoteModal({
  modal,
  state,
  onSave,
  syncStatus = "saved",
  syncLabel = "",
  onSyncNow = () => {}
}) {
  const titleRef = useRef(null);
  const editorApiRef = useRef(null);
  const [toolbarState, setToolbarState] = useState(NOTE_EDITOR_EMPTY_TOOLBAR);
  const [colorPanel, setColorPanel] = useState(false);
  const [draftColor, setDraftColor] = useState(NOTE_EDITOR_DEFAULT_COLOR);
  const viewportMetrics = useVisualViewportMetrics();
  const isBoxNote = modal.type === "boxNote";
  const isCentralNote = modal.type === "centralNote";
  const box = isBoxNote ? getNode(state.boxNodes, modal.boxId) : null;
  const centralNote = isCentralNote ? getNote(state, modal.noteId) : null;
  const day = !isBoxNote && !isCentralNote ? state.actionDays.find(d => d.id === modal.dayId) : null;
  const actionNode = day ? getNode(day.nodes, modal.nodeId) : null;
  const entry = actionNode && modal.entryId ? entriesFor(actionNode).find(e => e.id === modal.entryId) : null;
  const initialHtml = isCentralNote ? centralNote?.bodyHtml || "" : isBoxNote ? box?.boxNoteHtml || "" : entry?.bodyHtml || "";
  const initialTitle = isCentralNote ? centralNote?.title || "" : isBoxNote ? box?.boxNoteTitle || "" : entry?.title || "";
  const editorKey = `${modal.type}-${modal.noteId || modal.boxId || ""}-${modal.dayId || ""}-${modal.nodeId || ""}-${modal.entryId || "new"}`;
  useEffect(() => {
    setToolbarState(NOTE_EDITOR_EMPTY_TOOLBAR);
    setTablePanel(null);
    setColorPanel(false);
    setDraftColor(NOTE_EDITOR_DEFAULT_COLOR);
    window.setTimeout(() => titleRef.current?.focus(), 40);
  }, [editorKey]);
  useEffect(() => {
    if (!colorPanel) setDraftColor(toolbarState.color || NOTE_EDITOR_DEFAULT_COLOR);
  }, [toolbarState.color, colorPanel]);
  function save() {
    const html = sanitizeHtml(editorApiRef.current?.getHtml() || "");
    const title = titleRef.current?.value || "";
    if (isCentralNote) onSave({
      noteId: modal.noteId || null,
      title,
      bodyHtml: html,
      noteDate: modal.noteDate || centralNote?.noteDate || todayYMD(),
      link: modal.link || null
    });else if (isBoxNote) onSave({
      boxId: modal.boxId,
      title,
      bodyHtml: html
    });else onSave({
      dayId: modal.dayId,
      nodeId: modal.nodeId,
      entryId: modal.entryId || null,
      title: title || "Note",
      bodyHtml: html
    });
  }
  function runEditorCommand(command, options = {}) {
    const api = editorApiRef.current;
    if (!api) {
      console.warn("Note editor is not ready", command);
      return false;
    }
    return Boolean(api.run(command, options));
  }
  function runEditorCommandAfterFocus(command, options = {}) {
    window.setTimeout(() => {
      try {
        editorApiRef.current?.focus();
        runEditorCommand(command, options);
      } catch (error) {
        console.warn("Could not run note editor command", command, error);
      }
    }, 40);
  }
  const {
    tablePanel,
    setTablePanel,
    tableRows,
    tableCols,
    setTableRows,
    setTableCols,
    openTablePanel,
    updateTableDimension,
    settleTableDimension,
    insertCustomTable,
    submitCustomTable,
    runTableCommand,
    tablePanelButtonProps
  } = useNoteTablePanel(toolbarState, runEditorCommandAfterFocus);
  const editorViewportStyle = {
    "--note-keyboard-inset": `${viewportMetrics.keyboardInset}px`,
    "--note-visual-height": `${viewportMetrics.visualHeight || 0}px`,
    "--note-visual-top": `${viewportMetrics.visualTop || 0}px`,
    "--note-header-safe-top": "max(env(safe-area-inset-top, 0px), 12px)"
  };
  const editorScreenStyle = {
    paddingTop: "calc(var(--note-visual-top, 0px) + var(--note-header-safe-top, env(safe-area-inset-top, 0px)) + 52px)"
  };
  const headerStyle = {
    top: "var(--note-visual-top, 0px)",
    paddingTop: "var(--note-header-safe-top, env(safe-area-inset-top, 0px))"
  };
  const editorScrollStyle = {
    paddingBottom: "calc(var(--note-keyboard-inset, 0px) + 8.5rem + env(safe-area-inset-bottom, 0px))",
    scrollPaddingBottom: "calc(var(--note-keyboard-inset, 0px) + 9rem + env(safe-area-inset-bottom, 0px))"
  };
  const editorClassName = "rich-editor min-h-[calc(100dvh-180px)] w-full bg-transparent border-none outline-none px-0 pt-3 pb-28 text-[#E0E0E0] text-[17px] leading-relaxed";
  const topButtonClassName = (active = false) => `relative h-10 w-7 shrink-0 grid place-items-center disabled:opacity-35 disabled:hover:text-[#606060] transition-colors after:absolute after:left-2 after:right-2 after:bottom-1 after:h-px after:rounded-full after:transition-opacity ${active ? "text-[#FFD2D7] after:bg-[#FFD2D7] after:opacity-100" : "text-[#A7A7A7] hover:text-white after:opacity-0"}`;
  const syncText = syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Local" : syncStatus === "error" ? "Error" : "Saved";
  const syncColor = syncStatus === "saved" ? "#FFD2D7" : syncStatus === "error" ? "#fb7185" : syncStatus === "saving" ? "#FFD2D7" : "#666666";
  const textLevelLabels = {
    body: "Body",
    title: "Title",
    heading: "Heading",
    subheading: "Subheading",
    small: "Small"
  };
  const textLevelLabel = textLevelLabels[toolbarState.textLevel] || "Body";
  const listStyleLabels = {
    none: "Bullet list",
    disc: "Disc bullets",
    circle: "Circle bullets",
    square: "Square bullets",
    decimal: "Numbered list",
    "lower-alpha": "Lettered list",
    "lower-roman": "Roman list",
    checklist: "Checklist"
  };
  const listButtonText = toolbarState.ordered ? {
    decimal: "1.",
    "lower-alpha": "a.",
    "lower-roman": "i."
  }[toolbarState.listStyle] || "1." : {
    disc: "\u2022",
    circle: "\u25e6",
    square: "\u25aa"
  }[toolbarState.listStyle] || "\u2022";
  const listLabel = listStyleLabels[toolbarState.listStyle] || "Bullet list";
  const keepToolbarFocus = event => event.preventDefault();
  const toolbarButtonProps = action => ({
    onPointerDown: event => {
      event.preventDefault();
      action();
    },
    onMouseDown: keepToolbarFocus,
    onClick: event => {
      if (event.detail === 0) action();
    },
    tabIndex: -1
  });
  const colorButtonColor = safeNoteColor(draftColor) || toolbarState.color || NOTE_EDITOR_DEFAULT_COLOR;
  const tablePanelStyle = {
    top: "calc(var(--note-visual-top, 0px) + var(--note-header-safe-top, env(safe-area-inset-top, 0px)) + 54px)"
  };
  const colorPanelStyle = tablePanelStyle;
  function applyDraftColor() {
    const color = safeNoteColor(draftColor) || NOTE_EDITOR_DEFAULT_COLOR;
    setDraftColor(color);
    runEditorCommand("color", {
      color
    });
    setColorPanel(false);
  }
  function handleColorButton() {
    setTablePanel(null);
    if (toolbarState.selectionEmpty === false) {
      runEditorCommand("color", {
        color: colorButtonColor
      });
      return;
    }
    setColorPanel(prev => !prev);
  }
  return React.createElement("div", {
    className: "fixed inset-0 z-50 bg-[#0a0a0a] text-white animate-in fade-in duration-150 flex justify-center overflow-hidden",
    style: editorViewportStyle
  }, React.createElement("div", {
    className: "fixed left-0 right-0 top-0 z-[60] bg-[#0a0a0a]/95 border-b border-white/[0.035]",
    style: headerStyle
  }, React.createElement("div", {
    className: "mx-auto w-full max-w-md h-[52px] px-1.5 flex items-center gap-0.5"
  }, React.createElement("button", {
    type: "button",
    onClick: save,
    className: "h-10 min-w-8 grid place-items-center text-[#FFD2D7] hover:text-white transition-colors text-[30px] font-light leading-none",
    "aria-label": "Back"
  }, "<"), React.createElement("div", {
    className: "note-toolbar-scroll flex-1 min-w-0 overflow-x-auto flex items-center gap-0.5"
  }, React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("heading")), {
    className: `${topButtonClassName(toolbarState.heading)} w-9 font-serif font-bold text-[16px] leading-none tracking-tight`,
    title: `Text style: ${textLevelLabel}`,
    "aria-label": `Text style: ${textLevelLabel}`
  }), "Aa"), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("bold")), {
    className: topButtonClassName(toolbarState.bold),
    "aria-label": "Bold"
  }), React.createElement(Bold, {
    size: 17
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("italic")), {
    className: topButtonClassName(toolbarState.italic),
    "aria-label": "Italic"
  }), React.createElement(Italic, {
    size: 17
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("underline")), {
    className: topButtonClassName(toolbarState.underline),
    "aria-label": "Underline"
  }), React.createElement(Underline, {
    size: 17
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(handleColorButton), {
    className: topButtonClassName(colorPanel),
    "aria-label": "Text color",
    title: "Text color"
  }), React.createElement(NoteColorGlyph, {
    color: colorButtonColor,
    active: colorPanel
  })), React.createElement("div", {
    className: "h-5 w-px bg-white/[0.08] mx-1 shrink-0"
  }), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("indent-out")), {
    className: topButtonClassName(false),
    "aria-label": "Outdent"
  }), React.createElement(Indent, {
    size: 17
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("indent-in")), {
    className: topButtonClassName(false),
    "aria-label": "Indent"
  }), React.createElement(IndentIncrease, {
    size: 17
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("quote")), {
    className: topButtonClassName(toolbarState.quote),
    "aria-label": "Quote"
  }), React.createElement(Quote, {
    size: 16
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("checklist")), {
    className: topButtonClassName(toolbarState.checklist),
    "aria-label": "Checklist"
  }), React.createElement(CheckSquare, {
    size: 16
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(openTablePanel), {
    className: topButtonClassName(toolbarState.table || tablePanel),
    "aria-label": toolbarState.table ? "Table options" : "Insert table"
  }), React.createElement(NoteTableGlyph, {
    active: toolbarState.table || Boolean(tablePanel),
    menuHint: toolbarState.table
  })), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(() => runEditorCommand("list")), {
    className: topButtonClassName(toolbarState.bullet || toolbarState.ordered),
    "aria-label": listLabel
  }), React.createElement("span", {
    className: "text-[15px] font-extrabold leading-none"
  }, listButtonText)), React.createElement("div", {
    className: "h-5 w-px bg-white/[0.08] mx-1 shrink-0"
  }), React.createElement("button", _extends({
    type: "button",
    disabled: !toolbarState.canUndo
  }, toolbarButtonProps(() => runEditorCommand("undo")), {
    className: topButtonClassName(false),
    "aria-label": "Undo note edit"
  }), React.createElement(Undo2, {
    size: 17
  })), React.createElement("button", _extends({
    type: "button",
    disabled: !toolbarState.canRedo
  }, toolbarButtonProps(() => runEditorCommand("redo")), {
    className: topButtonClassName(false),
    "aria-label": "Redo note edit"
  }), React.createElement(Redo2, {
    size: 17
  }))), React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      onSyncNow();
    },
    title: syncLabel || syncText,
    "aria-label": syncLabel || syncText,
    className: "h-10 min-w-8 grid place-items-center transition-transform hover:scale-110 active:scale-95",
    style: {
      color: syncColor
    }
  }, syncStatus === "saving" ? React.createElement(MoreHorizontal, {
    size: 20,
    className: "animate-pulse"
  }) : React.createElement(Check, {
    size: 20
  })))), colorPanel ? React.createElement("div", {
    className: "fixed inset-0 z-[61]",
    onPointerDown: () => setColorPanel(false)
  }, React.createElement("div", {
    className: "fixed left-0 right-0 flex justify-center px-3 animate-in fade-in slide-in-from-bottom-4 duration-150",
    style: colorPanelStyle
  }, React.createElement("div", {
    className: "note-color-panel w-full max-w-[316px] bg-[#1A1A1A] border border-[#444444] shadow-2xl px-3 py-3",
    onPointerDown: e => e.stopPropagation(),
    onMouseDown: e => e.stopPropagation(),
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "note-color-grid"
  }, NOTE_EDITOR_SWATCHES.map(color => React.createElement("button", {
    key: color,
    type: "button",
    onPointerDown: event => {
      event.preventDefault();
      setDraftColor(color);
    },
    className: `note-color-swatch ${normalizeNoteEditorColor(draftColor) === color ? "is-selected" : ""}`,
    style: {
      background: color
    },
    "aria-label": `Use ${color}`
  }))), React.createElement("div", {
    className: "note-color-custom-row"
  }, React.createElement("input", {
    value: draftColor,
    onPointerDown: e => e.stopPropagation(),
    onChange: e => setDraftColor(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyDraftColor();
      }
    },
    placeholder: "#ffd2d7",
    "aria-label": "Text color hex",
    className: "note-color-input"
  }), React.createElement("button", _extends({
    type: "button"
  }, toolbarButtonProps(applyDraftColor), {
    className: "note-color-confirm"
  }), "ok"))))) : null, tablePanel ? React.createElement("div", {
    className: "fixed inset-0 z-[61]",
    onPointerDown: () => setTablePanel(null)
  }, React.createElement("div", {
    className: "fixed left-0 right-0 flex justify-center px-3 animate-in fade-in slide-in-from-bottom-4 duration-150",
    style: tablePanelStyle
  }, React.createElement("div", {
    className: "table-action-panel w-full max-w-[360px] bg-[#1A1A1A] border border-[#444444] shadow-2xl px-3 py-3",
    onPointerDown: e => e.stopPropagation(),
    onMouseDown: e => e.stopPropagation(),
    onClick: e => e.stopPropagation()
  }, tablePanel === "insert" ? React.createElement("form", {
    className: "table-panel-form",
    onSubmit: submitCustomTable
  }, React.createElement("div", {
    className: "table-dimension-row"
  }, React.createElement("span", {
    className: "table-dimension-label"
  }, "Row"), React.createElement("input", {
    type: "text",
    inputMode: "numeric",
    pattern: "[0-9]*",
    "aria-label": "Rows",
    value: tableRows,
    onFocus: e => e.currentTarget.select(),
    onChange: updateTableDimension(setTableRows),
    onBlur: () => settleTableDimension(setTableRows, tableRows, 2, 12),
    className: "table-dimension-input"
  }), React.createElement("span", {
    className: "table-dimension-label"
  }, "Col"), React.createElement("input", {
    type: "text",
    inputMode: "numeric",
    pattern: "[0-9]*",
    "aria-label": "Cols",
    value: tableCols,
    onFocus: e => e.currentTarget.select(),
    onChange: updateTableDimension(setTableCols),
    onBlur: () => settleTableDimension(setTableCols, tableCols, 2, 8),
    className: "table-dimension-input"
  })), React.createElement("div", {
    className: "table-panel-footer"
  }, React.createElement("button", _extends({
    type: "button"
  }, tablePanelButtonProps(() => setTablePanel(null)), {
    className: "table-panel-link table-panel-muted"
  }), "Cancel"), React.createElement("button", _extends({
    type: "submit"
  }, tablePanelButtonProps(insertCustomTable), {
    className: "table-panel-link table-panel-accent"
  }), "Insert"))) : React.createElement("div", {
    className: "table-menu-grid"
  }, React.createElement("button", _extends({
    type: "button"
  }, tablePanelButtonProps(() => runTableCommand("table-row-add")), {
    className: "table-menu-action"
  }), "Row +"), React.createElement("button", _extends({
    type: "button"
  }, tablePanelButtonProps(() => runTableCommand("table-col-add")), {
    className: "table-menu-action"
  }), "Col +"), React.createElement("button", _extends({
    type: "button"
  }, tablePanelButtonProps(() => runTableCommand("table-autofit")), {
    className: "table-menu-action table-menu-accent"
  }), "Auto fit"), React.createElement("button", _extends({
    type: "button"
  }, tablePanelButtonProps(() => runTableCommand("table-row-delete")), {
    className: "table-menu-action"
  }), "Row -"), React.createElement("button", _extends({
    type: "button"
  }, tablePanelButtonProps(() => runTableCommand("table-col-delete")), {
    className: "table-menu-action"
  }), "Col -"), React.createElement("button", _extends({
    type: "button"
  }, tablePanelButtonProps(() => runTableCommand("table-delete")), {
    className: "table-menu-action table-menu-danger"
  }), "Delete"))))) : null, React.createElement("div", {
    className: "w-full max-w-md h-[100dvh] bg-[#0a0a0a] flex flex-col",
    style: editorScreenStyle
  }, React.createElement("div", {
    className: "note-editor-scroll flex-1 min-h-0 overflow-y-auto thin-scroll px-5 pt-4",
    style: editorScrollStyle
  }, React.createElement("input", {
    ref: titleRef,
    type: "text",
    placeholder: "Title",
    defaultValue: initialTitle,
    className: "note-title-input w-full bg-transparent border-none outline-none px-0 pt-3 pb-2 text-white font-black leading-[1.04] placeholder:text-[#555555] tracking-normal"
  }), React.createElement(ProseMirrorNoteEditor, {
    key: editorKey,
    initialHtml: initialHtml,
    className: editorClassName,
    onReady: api => {
      editorApiRef.current = api;
    },
    onToolbarState: setToolbarState
  }))));
}
function ConfirmModal({
  dialog,
  onCancel,
  onConfirm
}) {
  if (!dialog) return null;
  return React.createElement("div", {
    className: "fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm px-5 animate-in fade-in duration-150",
    onClick: onCancel
  }, React.createElement("div", {
    className: "w-full max-w-[320px] bg-[#1A1A1A] border border-[#323232] rounded-[18px] p-5 shadow-2xl animate-in zoom-in-95 duration-150",
    onClick: e => e.stopPropagation()
  }, React.createElement("h3", {
    className: "text-white text-[18px] font-extrabold leading-tight"
  }, dialog.title || "Are you sure?"), dialog.body ? React.createElement("p", {
    className: "mt-2 text-[#A7A7A7] text-[13px] leading-relaxed"
  }, dialog.body) : null, React.createElement("div", {
    className: "mt-5 grid grid-cols-2 gap-2.5"
  }, React.createElement("button", {
    type: "button",
    onClick: onCancel,
    className: "px-4 py-3 rounded-[12px] bg-[#2D2D2D] text-white text-[13px] font-extrabold hover:bg-[#3E3E3E] transition-colors"
  }, "Cancel"), React.createElement("button", {
    type: "button",
    onClick: onConfirm,
    className: `px-4 py-3 rounded-[12px] text-[13px] font-extrabold transition-colors ${dialog.danger ? "bg-red-400 text-black hover:bg-red-300" : "bg-[#FFD2D7] text-black hover:bg-[#ffe1e5]"}`
  }, dialog.confirmLabel || "Confirm"))));
}
function ImportPreviewModal({
  modal,
  onClose,
  onImport
}) {
  const summary = modal.summary || {};
  const rows = [["Boxes", summary.boxes || 0], ["Action days", summary.actionDays || 0], ["Actions", summary.actionEntries || 0], ["Action notes", summary.actionNotes || 0], ["Notes", summary.notes || 0], ["Note links", summary.noteLinks || 0]];
  return React.createElement("div", {
    className: "fixed inset-0 z-[65] flex items-center justify-center bg-black/75 backdrop-blur-sm px-5 animate-in fade-in duration-150",
    onClick: onClose
  }, React.createElement("div", {
    className: "w-full max-w-[340px] bg-[#1A1A1A] border border-[#323232] rounded-[20px] p-5 shadow-2xl animate-in zoom-in-95 duration-150",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "flex items-start justify-between gap-4 mb-4"
  }, React.createElement("div", null, React.createElement("h3", {
    className: "text-white text-[18px] font-extrabold leading-tight"
  }, "Import preview"), React.createElement("p", {
    className: "mt-1 text-[#A7A7A7] text-[12px] leading-relaxed truncate max-w-[240px]"
  }, modal.fileName || "backup.json")), React.createElement("button", {
    type: "button",
    onClick: onClose,
    className: "text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full",
    "aria-label": "Close"
  }, React.createElement(X, {
    size: 18
  }))), React.createElement("div", {
    className: "grid grid-cols-2 gap-2 mb-4"
  }, rows.map(([label, value]) => React.createElement("div", {
    key: label,
    className: "bg-[#111111] border border-[#2D2D2D] rounded-[12px] px-3 py-2.5"
  }, React.createElement("div", {
    className: "text-[#A7A7A7] text-[11px] font-bold"
  }, label), React.createElement("div", {
    className: "text-white text-[18px] font-extrabold"
  }, value)))), React.createElement("p", {
    className: "text-[#A7A7A7] text-[12px] leading-relaxed mb-4"
  }, modal.legacy ? "Legacy backup detected. It will be normalized before import." : `Backup v${modal.backupVersion || BACKUP_VERSION} detected.`), React.createElement("div", {
    className: "grid grid-cols-2 gap-2.5"
  }, React.createElement("button", {
    type: "button",
    onClick: () => onImport("merge"),
    className: "px-4 py-3 rounded-[12px] bg-[#2D2D2D] text-white text-[13px] font-extrabold hover:bg-[#3E3E3E] transition-colors"
  }, "Merge"), React.createElement("button", {
    type: "button",
    onClick: () => onImport("replace"),
    className: "px-4 py-3 rounded-[12px] bg-[#FFD2D7] text-black text-[13px] font-extrabold hover:bg-[#ffe1e5] transition-colors"
  }, "Replace"))));
}
function DebugPanel({
  info,
  onClose
}) {
  const rows = [["Build", info.buildId], ["Cache", info.cacheName], ["Route", info.route], ["User", info.user], ["Online", info.online ? "yes" : "no"], ["Standalone", info.standalone ? "yes" : "no"], ["Service worker", info.serviceWorker], ["Sync", `${info.syncStatus} - ${info.syncLabel}`], ["Pending sync", info.pendingSync ? "yes" : "no"], ["Local updated", info.localUpdatedAt || "n/a"], ["Cloud updated", info.cloudUpdatedAt || "n/a"], ["Last synced", info.lastSyncedAt || "n/a"], ["Snapshot", `${info.snapshotKb} KB`], ["Boxes", String(info.counts.boxes)], ["Action days", String(info.counts.actionDays)], ["Entries", String(info.counts.entries)], ["Notes", String(info.counts.notes)], ["Note links", String(info.counts.noteLinks)]];
  function exportDebug() {
    const blob = new Blob([JSON.stringify(info, null, 2)], {
      type: "application/json"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liems-planner-debug-${todayYMD()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }
  return React.createElement("div", {
    className: "fixed inset-0 z-[65] flex items-center justify-center bg-black/75 backdrop-blur-sm px-5 animate-in fade-in duration-150",
    onClick: onClose
  }, React.createElement("div", {
    className: "w-full max-w-[380px] max-h-[82dvh] overflow-auto thin-scroll bg-[#1A1A1A] border border-[#323232] rounded-[20px] p-5 shadow-2xl animate-in zoom-in-95 duration-150",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "flex items-start justify-between gap-4 mb-4"
  }, React.createElement("div", null, React.createElement("h3", {
    className: "text-white text-[18px] font-extrabold leading-tight"
  }, "Debug"), React.createElement("p", {
    className: "mt-1 text-[#A7A7A7] text-[12px] leading-relaxed"
  }, "Local, sync, and PWA status.")), React.createElement("button", {
    type: "button",
    onClick: onClose,
    className: "text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full",
    "aria-label": "Close"
  }, React.createElement(X, {
    size: 18
  }))), React.createElement("div", {
    className: "space-y-1.5"
  }, rows.map(([label, value]) => React.createElement("div", {
    key: label,
    className: "grid grid-cols-[108px_1fr] gap-3 bg-[#111111] border border-[#2D2D2D] rounded-[10px] px-3 py-2"
  }, React.createElement("div", {
    className: "text-[#A7A7A7] text-[11px] font-bold"
  }, label), React.createElement("div", {
    className: "text-white text-[12px] font-bold break-words"
  }, value)))), React.createElement("button", {
    type: "button",
    onClick: exportDebug,
    className: "mt-4 w-full px-4 py-3 rounded-[12px] bg-[#FFD2D7] text-black text-[13px] font-extrabold hover:bg-[#ffe1e5] transition-colors"
  }, "Export debug JSON")));
}
function ActionLinesModal({
  modal,
  onClose,
  onSave
}) {
  const textareaRef = useRef(null);
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 40);
  }, []);
  return React.createElement("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200",
    onClick: onClose
  }, React.createElement("div", {
    className: "bg-[#1A1A1A] border border-[#323232] rounded-[24px] w-full max-w-[340px] p-5 shadow-2xl animate-in zoom-in-95 duration-200",
    onClick: e => e.stopPropagation()
  }, React.createElement("div", {
    className: "flex justify-between items-center mb-5"
  }, React.createElement("h3", {
    className: "font-bold text-[18px] text-white"
  }, "Add actions"), React.createElement("button", {
    type: "button",
    onClick: onClose,
    className: "text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full"
  }, React.createElement(X, {
    size: 18
  }))), React.createElement("textarea", {
    ref: textareaRef,
    placeholder: "Type each action on a new line...",
    rows: 8,
    className: "w-full bg-[#111111] border border-[#323232] rounded-[12px] p-4 text-[#E0E0E0] text-[14px] leading-relaxed outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors resize-none mb-6"
  }), React.createElement("div", {
    className: "flex gap-3"
  }, React.createElement("button", {
    type: "button",
    onClick: onClose,
    className: "flex-1 bg-[#2D2D2D] hover:bg-[#3E3E3E] text-white font-bold py-3.5 rounded-[12px] transition-colors"
  }, "Cancel"), React.createElement("button", {
    type: "button",
    onClick: () => onSave(modal.dayId, modal.nodeId, textareaRef.current?.value || ""),
    className: "flex-1 bg-[#FFD2D7] hover:scale-[1.02] active:scale-95 text-black font-bold py-3.5 rounded-[12px] transition-transform"
  }, "Done"))));
}
function AuthScreen({
  authView,
  authBusy,
  authMessage,
  onAuth,
  onSwitchView
}) {
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const newPasswordRef = useRef(null);
  const isReset = authView === "updatePassword";
  return React.createElement("div", {
    className: "min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12 selection:bg-[#FFD2D7] selection:text-black"
  }, React.createElement("div", {
    className: "w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] overflow-hidden min-h-screen sm:min-h-[850px] relative flex flex-col shadow-2xl"
  }, React.createElement("div", {
    className: "p-5 border-b border-[#333333] flex items-center gap-3"
  }, React.createElement("div", {
    className: "relative w-[40px] h-[40px] flex items-center justify-center bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]"
  }, React.createElement("span", {
    className: "font-black text-[20px] text-[#111] tracking-tighter"
  }, "LP")), React.createElement("h1", {
    className: "font-extrabold text-[20px] tracking-tight"
  }, "Liem's ", React.createElement("span", {
    className: "text-[#FFD2D7] font-medium text-[17px] italic font-serif"
  }, "Planner"))), React.createElement("main", {
    className: "p-5 flex-1 flex flex-col justify-center"
  }, React.createElement("div", {
    className: "bg-[#141414] border border-white/[0.05] rounded-[24px] p-5"
  }, React.createElement("h2", {
    className: `text-[2.4rem] leading-[1.05] font-extrabold tracking-tighter ${isReset ? "mb-3" : "mb-6"}`
  }, isReset ? "New password" : "Login"), isReset ? React.createElement("p", {
    className: "text-[#A7A7A7] text-[14px] mb-6"
  }, "Create a new password for this workspace.") : null, isReset ? React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onAuth("update-password", {
        password: newPasswordRef.current?.value || ""
      });
    },
    className: "flex flex-col gap-3"
  }, React.createElement("input", {
    ref: newPasswordRef,
    type: "password",
    placeholder: "New password",
    className: "w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]"
  }), React.createElement("button", {
    disabled: authBusy,
    className: "bg-[#FFD2D7] text-black font-bold py-3.5 rounded-[12px]"
  }, "Update password")) : React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onAuth("login", {
        email: emailRef.current?.value || "",
        password: passwordRef.current?.value || ""
      });
    },
    className: "flex flex-col gap-3"
  }, React.createElement("input", {
    ref: emailRef,
    type: "email",
    placeholder: "Email",
    autoComplete: "email",
    className: "w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]"
  }), React.createElement("input", {
    ref: passwordRef,
    type: "password",
    placeholder: "Password",
    autoComplete: "current-password",
    className: "w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white outline-none focus:border-[#FFD2D7]"
  }), React.createElement("button", {
    disabled: authBusy,
    className: "bg-[#FFD2D7] text-black font-bold py-3.5 rounded-[12px]"
  }, "Login"), React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, React.createElement("button", {
    type: "button",
    disabled: authBusy,
    onClick: () => onAuth("signup", {
      email: emailRef.current?.value || "",
      password: passwordRef.current?.value || ""
    }),
    className: "bg-[#2D2D2D] text-white font-bold py-3 rounded-[12px]"
  }, "Sign up"), React.createElement("button", {
    type: "button",
    disabled: authBusy,
    onClick: () => onAuth("forgot", {
      email: emailRef.current?.value || ""
    }),
    className: "bg-[#2D2D2D] text-white font-bold py-3 rounded-[12px]"
  }, "Forgot"))), authMessage ? React.createElement("div", {
    className: "mt-4 text-[13px] text-[#FFD2D7]"
  }, authMessage) : null, !sb && React.createElement("div", {
    className: "mt-4 text-[12px] text-[#A7A7A7]"
  }, "Supabase script is not loaded. The app can still run locally in this browser.")))));
}
function App() {
  const initialRouteRef = useRef(null);
  if (!initialRouteRef.current) initialRouteRef.current = parseRouteHash();
  const [db, setDb] = useState(() => normalizeState(applyRouteToState(loadLocalForUser(null) || loadLegacyLocal() || seed(), initialRouteRef.current)));
  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState(() => routeView(initialRouteRef.current));
  const [isSearchOpen, setIsSearchOpen] = useState(() => initialRouteRef.current?.name === "search");
  const [searchQuery, setSearchQuery] = useState(() => initialRouteRef.current?.query || "");
  const [searchFilters, setSearchFilters] = useState({
    box: true,
    action: true,
    note: true
  });
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
  const {
    syncStatus,
    syncLabel,
    setSyncStatus,
    setSyncLabel,
    setSyncState
  } = useSyncStatusMachine(navigator.onLine ? "saved" : "offline");
  const [dragState, setDragState] = useState(null);
  const fileInputRef = useRef(null);
  const routeApplyRef = useRef(false);
  const {
    historyTick,
    undoRef,
    redoRef,
    commit,
    undo,
    redo
  } = usePlannerHistory(setDb, syncSelectedActionDayWithBox);
  const {
    hydratedRef,
    hydrateUserState,
    syncNow
  } = useCloudSync({
    db,
    setDb,
    currentUser,
    setBooting,
    setRuntimeFromRoute,
    setSyncStatus,
    setSyncLabel,
    showToast
  });
  const {
    authBusy,
    authMessage,
    authView,
    setAuthView,
    handleAuth,
    signOut
  } = useAuthSession({
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
  } = useBoxActions({
    db,
    setDb,
    commit
  });
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
  } = useNoteActions({
    db,
    commit,
    setModal,
    flashAfterNavigation,
    notesForView,
    showToast
  });
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
    setMenuPlacements(prev => ({
      ...prev,
      [menuId]: placement
    }));
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
    setSearchQuery(route?.name === "search" ? route.query || "" : "");
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
    window.setTimeout(() => {
      routeApplyRef.current = false;
    }, 0);
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
    const nextHash = buildAppHash({
      currentView,
      ui: db.ui,
      isSearchOpen,
      searchQuery
    });
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [currentView, isSearchOpen, searchQuery, db.ui.boxView, db.ui.boxFilter, db.ui.boxFilterFrom, db.ui.boxFilterTo, db.ui.showBoxDays, db.ui.selectedActionDate, db.ui.actionFilter, db.ui.notesView, db.ui.notesTag, db.ui.notesDate, db.ui.notesTagsInput, db.ui.notesDatesInput, db.ui.selectedBoxNoteId]);
  useEffect(() => {
    if (!flashTarget) return;
    const safeId = window.CSS?.escape ? window.CSS.escape(flashTarget.id) : String(flashTarget.id).replace(/"/g, '\\"');
    const selector = flashTarget.type === "entry" ? `[data-action-entry-id="${safeId}"]` : flashTarget.type === "action" ? `[data-action-node-id="${safeId}"]` : flashTarget.type === "note" ? `[data-note-id="${safeId}"]` : `[data-box-node-id="${safeId}"]`;
    const scrollTimer = setTimeout(() => {
      const el = document.querySelector(selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top >= 92 && rect.bottom <= window.innerHeight - 28;
      if (!inViewport) el.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 80);
    const clearTimer = setTimeout(() => setFlashTarget(null), 1100);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [flashTarget, currentView, db]);
  function exportJson() {
    const clean = sanitizedState(db);
    const backup = createBackupEnvelope(clean, {
      appVersion: `state-v${clean.version || 1}`
    });
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json"
    });
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
    const next = mode === "merge" ? mergeImportedState(db, modal.state) : normalizeState(modal.state);
    commit(mode === "merge" ? "Merge JSON" : "Replace JSON", state => {
      state.version = next.version;
      state.meta = next.meta;
      state.boxNodes = next.boxNodes;
      state.actionDays = next.actionDays;
      state.notes = next.notes;
      state.noteLinks = next.noteLinks;
      state.ui = next.ui;
    }, {
      sync: false
    });
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
    try {
      localBytes = snapshotPayloadBytes(localStorage.getItem(key) || "");
    } catch {}
    const entries = (clean.actionDays || []).reduce((total, day) => total + countNodeEntries(day.nodes || []), 0);
    return {
      buildId: APP_BUILD_ID,
      cacheName: APP_CACHE_NAME,
      route: window.location.hash || "#/boxes",
      user: currentUser?.email || currentUser?.id || "local",
      online: navigator.onLine,
      standalone: Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone),
      serviceWorker: navigator.serviceWorker?.controller ? "controlled" : "serviceWorker" in navigator ? "registered/pending" : "unavailable",
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
    setModal({
      type: "debug",
      info: makeDebugInfo()
    });
    setIsHeaderMenuOpen(false);
  }
  function updateWorkspaceName(name) {
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        workspaceName: name || "Liem's Planner"
      }
    }));
  }
  function cycleLogoStyle() {
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        logoStyle: ((Number(prev.ui.logoStyle) || 0) + 1) % 15
      }
    }));
  }
  function setNotesUI(key, value) {
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        [key]: value
      }
    }));
  }
  function setNotesViewBy(patch) {
    setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        notesTagsInput: patch.tagsInput !== undefined ? patch.tagsInput : prev.ui.notesTagsInput || "",
        notesDatesInput: patch.datesInput !== undefined ? patch.datesInput : prev.ui.notesDatesInput || ""
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
      const next = {
        ...prev,
        [key]: prev[key] === false
      };
      if (!next.box && !next.action && !next.note) return prev;
      return next;
    });
  }
  function openCentralNote(noteId) {
    setModal({
      type: "centralNote",
      noteId
    });
  }
  function expandBoxPathInState(state, boxId) {
    const ancestors = ancestorsOf(boxId, state.boxNodes);
    ancestors.forEach(parent => {
      if (parent.level === 1) state.ui.collapsedBoxNodes = (state.ui.collapsedBoxNodes || []).filter(id => id !== parent.id);else state.ui.expandedBoxNodes = [...new Set([...(state.ui.expandedBoxNodes || []), parent.id])];
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
    flashAfterNavigation({
      type: "box",
      id: boxId
    });
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
      link: {
        id: uid("notelink"),
        linkType: "box",
        boxNodeId: boxId
      }
    });
  }
  function openNotesTab() {
    setCurrentView("notes");
    setDb(prev => prev.ui.selectedBoxNoteId ? markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        selectedBoxNoteId: ""
      }
    }) : prev);
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
        notesView: prev.ui.notesView === "linked" ? "free" : prev.ui.notesView || "free",
        notesTagsInput: "",
        notesDatesInput: ""
      }
    }));
    setIsNotesViewByMenuOpen(false);
    setIsNotesViewMenuOpen(false);
    setCurrentView("notes");
    setModal({
      type: "centralNote",
      noteId: null,
      noteDate
    });
    if (hadViewBy) showToast("View by cleared for new note");
  }
  function requestDeleteCentralNote(noteId) {
    confirmDeleteNote(() => deleteCentralNote({
      noteId
    }));
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
    setModal({
      type: "notesExport"
    });
  }
  function openSearchResult(result) {
    if (result.noteId) {
      setCurrentView("notes");
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          notesView: prev.ui.notesView === "all" ? "all" : noteIsLinked(prev, result.noteId) ? "linked" : "free"
        }
      }));
      flashAfterNavigation({
        type: "note",
        id: result.noteId
      });
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
      if (result.entryId) flashAfterNavigation({
        type: "entry",
        id: result.entryId
      });else if (result.actionNodeId) flashAfterNavigation({
        type: "action",
        id: result.actionNodeId
      });
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
    return React.createElement("div", {
      className: "min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12"
    }, React.createElement("div", {
      className: "w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] min-h-screen sm:min-h-[850px] flex items-center justify-center"
    }, React.createElement("div", {
      className: "text-center"
    }, React.createElement(BrandLogo, {
      name: db.ui.workspaceName,
      style: db.ui.logoStyle,
      className: "mx-auto mb-4 w-[46px] h-[46px]",
      textClassName: "text-[20px]",
      ariaLabel: "Loading workspace logo",
      title: "Loading workspace logo"
    }), React.createElement("div", {
      className: "font-extrabold text-[20px]"
    }, "Loading"), React.createElement("div", {
      className: "text-[#A7A7A7] text-[13px] mt-1"
    }, "Opening workspace..."))));
  }
  if (!currentUser) {
    return React.createElement(AuthScreen, {
      authView: authView,
      authBusy: authBusy,
      authMessage: authMessage,
      onAuth: handleAuth,
      onSwitchView: setAuthView
    });
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
    openActionLines: (dayId, nodeId) => setModal({
      type: "actionLines",
      dayId,
      nodeId
    }),
    openActionNote: (dayId, nodeId, entryId) => setModal({
      type: "actionNote",
      dayId,
      nodeId,
      entryId
    }),
    deleteActionNote: (dayId, nodeId, entryId) => {
      confirmDeleteNote(() => deleteActionNote({
        dayId,
        nodeId,
        entryId
      }));
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
  return React.createElement("div", {
    className: "min-h-screen bg-black text-white font-sans flex justify-center items-start pt-0 sm:pt-8 pb-12 selection:bg-[#FFD2D7] selection:text-black relative",
    onClick: closeFloating
  }, React.createElement("div", {
    className: "app-shell w-full max-w-md bg-[#0a0a0a] sm:rounded-[24px] sm:border border-[#333333] overflow-hidden min-h-screen sm:min-h-[850px] relative flex flex-col shadow-2xl"
  }, React.createElement(Header, {
    workspaceName: db.ui.workspaceName,
    logoStyle: db.ui.logoStyle,
    onWorkspaceNameChange: updateWorkspaceName,
    onCycleLogoStyle: cycleLogoStyle,
    syncStatus: syncStatus,
    syncLabel: syncLabel,
    isSearchOpen: isSearchOpen,
    setIsSearchOpen: setIsSearchOpen,
    isHeaderMenuOpen: isHeaderMenuOpen,
    setIsHeaderMenuOpen: setIsHeaderMenuOpen,
    onSyncNow: syncNow,
    onExport: exportJson,
    onImportClick: () => fileInputRef.current?.click(),
    onImportFile: e => importJson(e.target.files?.[0]),
    onSignOut: signOut,
    fileInputRef: fileInputRef
  }), React.createElement(SearchPanel, {
    isOpen: isSearchOpen,
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    filters: searchFilters,
    onToggleFilter: toggleSearchFilter,
    onOpenResult: openSearchResult
  }), React.createElement("main", {
    className: "app-main p-5 flex-1 flex flex-col pb-24"
  }, React.createElement("div", {
    className: "flex justify-between items-center gap-3 mb-7 mt-1"
  }, React.createElement("h2", {
    className: "view-title text-[1.55rem] leading-[1.1] font-extrabold tracking-tighter flex flex-nowrap items-baseline min-w-0"
  }, React.createElement("button", {
    type: "button",
    className: `cursor-pointer transition-colors whitespace-nowrap ${currentView === "boxes" ? "text-white" : "text-[#555555]"}`,
    onClick: e => {
      e.stopPropagation();
      setCurrentView("boxes");
    }
  }, "Box"), React.createElement("span", {
    className: "text-[#3E3E3E] mx-1.5 font-light"
  }, "/"), React.createElement("button", {
    type: "button",
    className: `cursor-pointer transition-colors whitespace-nowrap ${currentView === "actions" ? "text-white" : "text-[#555555]"}`,
    onClick: e => {
      e.stopPropagation();
      setCurrentView("actions");
    }
  }, "Act"), React.createElement("span", {
    className: "text-[#3E3E3E] mx-1.5 font-light"
  }, "/"), React.createElement("button", {
    type: "button",
    className: `cursor-pointer transition-colors whitespace-nowrap ${currentView === "notes" || currentView === "boxNotes" ? "text-white" : "text-[#555555]"}`,
    onClick: e => {
      e.stopPropagation();
      openNotesTab();
    }
  }, "Note")), React.createElement("div", {
    className: "flex gap-3 text-[#A7A7A7] shrink-0"
  }, React.createElement("button", {
    type: "button",
    disabled: !undoRef.current.length,
    onClick: e => {
      e.stopPropagation();
      undo();
    },
    className: "cursor-pointer hover:text-white transition-colors",
    "aria-label": "Undo"
  }, React.createElement(Undo2, {
    size: 18
  })), React.createElement("button", {
    type: "button",
    disabled: !redoRef.current.length,
    onClick: e => {
      e.stopPropagation();
      redo();
    },
    className: "cursor-pointer hover:text-white transition-colors",
    "aria-label": "Redo"
  }, React.createElement(Redo2, {
    size: 18
  })))), currentView === "boxes" && React.createElement("div", {
    className: "animate-in fade-in slide-in-from-right-4 duration-300"
  }, React.createElement("div", {
    className: "filter-row flex flex-wrap items-center gap-2.5 mb-7 relative z-20"
  }, React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setIsActiveMenuOpen(!isActiveMenuOpen);
      setIsDateMenuOpen(false);
      setBoxDateCalendarTarget(null);
    },
    className: "flex items-center gap-1.5 px-6 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform"
  }, boxView === "archived" ? "Archived" : boxView === "done" ? "Done" : "Active"), isActiveMenuOpen && React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "absolute top-full left-0 mt-2 w-[130px] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100"
  }, ["active", "archived", "done"].map(opt => React.createElement("button", {
    key: opt,
    type: "button",
    onClick: () => {
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          boxView: opt
        }
      }));
      setIsActiveMenuOpen(false);
    },
    className: "px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors capitalize"
  }, opt)))), React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setIsDateMenuOpen(!isDateMenuOpen);
      setBoxDateCalendarTarget(null);
      setIsActiveMenuOpen(false);
    },
    className: "flex items-center gap-1.5 px-6 py-2 bg-transparent hover:border-white active:scale-95 text-white text-[13px] font-bold rounded-full border border-[#878787] transition-all"
  }, db.ui.boxFilter === "today" ? "Today" : db.ui.boxFilter === "7" ? "7 days" : db.ui.boxFilter === "15" ? "15 days" : db.ui.boxFilter === "30" ? "30 days" : db.ui.boxFilter === "all" ? "All" : "Custom"), isDateMenuOpen && React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "absolute top-full left-0 mt-2 w-[280px] max-w-[calc(100vw-2rem)] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100"
  }, [["today", "Today"], ["7", "7 days"], ["15", "15 days"], ["30", "30 days"], ["all", "All"]].map(([value, label]) => React.createElement("button", {
    key: value,
    type: "button",
    onClick: () => {
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          boxFilter: value
        }
      }));
      setBoxDateCalendarTarget(null);
      setIsDateMenuOpen(false);
    },
    className: "px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors"
  }, label)), React.createElement("label", {
    className: "border-t border-[#3E3E3E] mt-1 flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#3E3E3E] transition-colors cursor-pointer select-none"
  }, React.createElement("input", {
    type: "checkbox",
    checked: db.ui.showBoxDays !== false,
    onChange: e => setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        showBoxDays: e.target.checked
      }
    })),
    className: "h-4 w-4 accent-[#FFD2D7] cursor-pointer"
  }), "Show days"), React.createElement("div", {
    className: "border-t border-[#3E3E3E] mt-1 px-4 py-3 grid grid-cols-1 gap-2"
  }, React.createElement("div", {
    className: "relative"
  }, React.createElement("div", {
    className: `flex h-[46px] w-full items-center gap-2 bg-[#111111] border rounded-[10px] px-3 text-[14px] text-white transition-colors ${boxDateCalendarTarget === "from" ? "border-[#FFD2D7]" : "border-[#333333]"}`
  }, React.createElement(DateTextInput, {
    value: db.ui.boxFilterFrom || "",
    allowEmpty: true,
    ariaLabel: "Start date",
    onCommit: date => setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        boxFilterFrom: date
      }
    })),
    inputClassName: "flex-1 text-[16px] font-medium leading-none"
  }), React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setBoxDateCalendarTarget(prev => prev === "from" ? null : "from");
    },
    className: "h-8 w-8 shrink-0 grid place-items-center rounded-full text-[#A7A7A7] hover:text-[#FFD2D7] hover:bg-[#333333] transition-colors",
    "aria-label": "Open start date calendar"
  }, React.createElement(CalendarDays, {
    size: 15
  }))), boxDateCalendarTarget === "from" && React.createElement(ActionDatePickerPanel, {
    selectedDate: db.ui.boxFilterFrom || todayYMD(),
    actionDays: db.actionDays,
    align: "left",
    compact: true,
    placement: "up",
    onSelect: date => {
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          boxFilterFrom: date
        }
      }));
      setBoxDateCalendarTarget(null);
    }
  })), React.createElement("div", {
    className: "relative"
  }, React.createElement("div", {
    className: `flex h-[46px] w-full items-center gap-2 bg-[#111111] border rounded-[10px] px-3 text-[14px] text-white transition-colors ${boxDateCalendarTarget === "to" ? "border-[#FFD2D7]" : "border-[#333333]"}`
  }, React.createElement(DateTextInput, {
    value: db.ui.boxFilterTo || "",
    allowEmpty: true,
    ariaLabel: "End date",
    onCommit: date => setDb(prev => markPendingSync({
      ...prev,
      ui: {
        ...prev.ui,
        boxFilterTo: date
      }
    })),
    inputClassName: "flex-1 text-[16px] font-medium leading-none"
  }), React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setBoxDateCalendarTarget(prev => prev === "to" ? null : "to");
    },
    className: "h-8 w-8 shrink-0 grid place-items-center rounded-full text-[#A7A7A7] hover:text-[#FFD2D7] hover:bg-[#333333] transition-colors",
    "aria-label": "Open end date calendar"
  }, React.createElement(CalendarDays, {
    size: 15
  }))), boxDateCalendarTarget === "to" && React.createElement(ActionDatePickerPanel, {
    selectedDate: db.ui.boxFilterTo || db.ui.boxFilterFrom || todayYMD(),
    actionDays: db.actionDays,
    align: "left",
    compact: true,
    placement: "up",
    onSelect: date => {
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          boxFilterTo: date
        }
      }));
      setBoxDateCalendarTarget(null);
    }
  })), React.createElement("button", {
    type: "button",
    onClick: () => {
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          boxFilter: "custom"
        }
      }));
      setBoxDateCalendarTarget(null);
      setIsDateMenuOpen(false);
    },
    className: "justify-self-start text-[#FFD2D7] hover:text-white active:scale-95 text-[14px] font-bold underline underline-offset-4 decoration-[#FFD2D7] transition-all"
  }, "Apply")))), React.createElement("button", {
    type: "button",
    onClick: createRootBox,
    className: "ml-auto px-5 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform",
    "aria-label": "Create box"
  }, "+box")), React.createElement("div", {
    className: "space-y-4"
  }, rootBoxes.length ? rootBoxes.map(item => React.createElement("div", {
    key: item.id,
    className: "bg-[#141414] rounded-[12px] border border-white/[0.03]"
  }, React.createElement(BoxTreeItem, {
    state: db,
    node: item,
    level: 0,
    view: boxView,
    menuOpenId: activeMenu,
    setMenuOpenId: setActiveMenu,
    menuPlacements: menuPlacements,
    openNodeMenu: openNodeMenu,
    handlers: boxHandlers,
    dragState: dragState,
    setDragState: setDragState,
    flashTarget: flashTarget
  }))) : React.createElement("div", {
    className: "flex flex-col items-center justify-center py-20 text-center"
  }, React.createElement("div", {
    className: "w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6"
  }, React.createElement(ClipboardList, {
    size: 36,
    className: "text-[#444444]"
  })), React.createElement("h3", {
    className: "text-white font-bold text-[18px] mb-2"
  }, "No boxes yet"), React.createElement("button", {
    type: "button",
    onClick: createRootBox,
    className: "mt-4 bg-[#FFD2D7] text-black font-bold px-7 py-3 rounded-full flex items-center gap-2"
  }, React.createElement(Plus, {
    size: 18
  }), " Create box")))), currentView === "actions" && React.createElement("div", {
    className: "animate-in fade-in slide-in-from-left-4 duration-300 flex-1 flex flex-col"
  }, React.createElement("div", {
    className: "flex items-center gap-2.5 mb-8 relative z-20"
  }, React.createElement("div", {
    className: "relative"
  }, React.createElement("button", {
    type: "button",
    onClick: e => {
      e.stopPropagation();
      setIsActionsMenuOpen(!isActionsMenuOpen);
    },
    className: "flex items-center gap-1.5 px-6 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform"
  }, db.ui.actionFilter === "undone" ? "Undone" : db.ui.actionFilter === "done" ? "Done" : db.ui.actionFilter === "notes" ? "Notes" : "All"), isActionsMenuOpen && React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "absolute top-full left-0 mt-2 w-[130px] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100"
  }, ["all", "undone", "done", "notes"].map(opt => React.createElement("button", {
    key: opt,
    type: "button",
    onClick: () => {
      setDb(prev => markPendingSync({
        ...prev,
        ui: {
          ...prev.ui,
          actionFilter: opt
        }
      }));
      setIsActionsMenuOpen(false);
    },
    className: "px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors capitalize"
  }, opt)))), React.createElement("div", {
    className: "relative flex items-center justify-between bg-transparent border border-[#555555] rounded-full px-4 py-1.5 hover:border-white transition-colors group flex-1"
  }, React.createElement("button", {
    type: "button",
    onClick: () => selectActionDate(addDaysYMD(selectedDate, -1)),
    className: "text-[#A7A7A7] group-hover:text-white transition-colors"
  }, React.createElement(ChevronLeft, {
    size: 16
  })), React.createElement("div", {
    className: "flex items-center justify-center gap-1.5 min-w-0"
  }, React.createElement(DateTextInput, {
    value: selectedDate,
    ariaLabel: "Action date",
    onCommit: date => {
      selectActionDate(date);
      setIsActionCalendarOpen(false);
    },
    inputClassName: "w-[92px] text-center text-[16px] font-bold leading-none"
  }), actionProgress ? React.createElement("span", {
    className: "text-[#A7A7A7] font-semibold text-[12px] whitespace-nowrap"
  }, actionProgress.done, "/", actionProgress.total) : null, React.createElement("button", {
    type: "button",
    "aria-label": "Open action date calendar",
    onClick: e => {
      e.stopPropagation();
      setIsActionCalendarOpen(!isActionCalendarOpen);
      setIsActionsMenuOpen(false);
    },
    className: "h-8 w-8 shrink-0 grid place-items-center rounded-full text-[#FFD2D7] hover:text-white hover:bg-[#333333] transition-colors"
  }, React.createElement(CalendarDays, {
    size: 14
  }))), React.createElement("button", {
    type: "button",
    onClick: () => selectActionDate(addDaysYMD(selectedDate, 1)),
    className: "text-[#A7A7A7] group-hover:text-white transition-colors"
  }, React.createElement(ChevronRight, {
    size: 16
  })), isActionCalendarOpen && React.createElement(ActionDatePickerPanel, {
    selectedDate: selectedDate,
    actionDays: db.actionDays,
    onSelect: date => {
      selectActionDate(date);
      setIsActionCalendarOpen(false);
    }
  }))), !selectedDay ? React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center pb-20 animate-in fade-in duration-300"
  }, React.createElement("div", {
    className: "w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6"
  }, React.createElement(CalendarDays, {
    size: 36,
    className: "text-[#A7A7A7]"
  })), React.createElement("h3", {
    className: "text-white font-bold text-[18px] mb-2"
  }, "No scheduled actions yet"), React.createElement("button", {
    type: "button",
    onClick: () => createActionsForDate(selectedDate),
    className: "bg-[#FFD2D7] hover:scale-105 active:scale-95 transition-transform text-black font-bold px-7 py-3 rounded-full flex items-center gap-2"
  }, React.createElement(Plus, {
    size: 18,
    strokeWidth: 2.5
  }), " Create actions")) : React.createElement("div", {
    className: "space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300"
  }, actionRoots.length ? actionRoots.map(item => React.createElement("div", {
    key: item.id,
    className: "bg-[#141414] rounded-[12px] border border-white/[0.03]"
  }, React.createElement(ActionTreeItem, {
    state: db,
    day: selectedDay,
    node: item,
    level: 0,
    menuOpenId: activeMenu,
    setMenuOpenId: setActiveMenu,
    menuPlacements: menuPlacements,
    openNodeMenu: openNodeMenu,
    handlers: actionHandlers,
    flashTarget: flashTarget
  }))) : React.createElement("div", {
    className: "bg-[#141414] rounded-[12px] border border-white/[0.03] p-6 text-center text-[#A7A7A7]"
  }, "No items match this filter."))), currentView === "notes" && React.createElement(NotesPanel, {
    state: db,
    notes: notesForView,
    tags: noteTags,
    isViewMenuOpen: isNotesViewMenuOpen,
    setIsViewMenuOpen: setIsNotesViewMenuOpen,
    isViewByMenuOpen: isNotesViewByMenuOpen,
    setIsViewByMenuOpen: setIsNotesViewByMenuOpen,
    onCreateNote: createFreeNote,
    onOpenNote: openCentralNote,
    onDeleteNote: requestDeleteCentralNote,
    onOpenOrigin: openNoteOrigin,
    onSetView: value => setNotesUI("notesView", value),
    onSetViewBy: setNotesViewBy,
    onToggleDate: toggleNoteDate,
    onOpenExport: openNotesExport,
    flashTarget: flashTarget
  }), currentView === "boxNotes" && React.createElement(BoxNotesPanel, {
    state: db,
    boxId: selectedBoxNoteId,
    notes: notesForSelectedBox,
    onBack: () => revealBox(selectedBoxNoteId),
    onCreateNote: createBoxLinkedNote,
    onOpenNote: openCentralNote,
    onDeleteNote: requestDeleteCentralNote,
    onToggleDate: toggleBoxNoteDate,
    flashTarget: flashTarget
  })), modal?.type === "boxNote" && React.createElement(RichNoteModal, {
    modal: modal,
    state: db,
    onSave: saveBoxNote,
    syncStatus: syncStatus,
    syncLabel: syncLabel,
    onSyncNow: syncNow
  }), modal?.type === "actionNote" && React.createElement(RichNoteModal, {
    modal: modal,
    state: db,
    onSave: saveActionNote,
    syncStatus: syncStatus,
    syncLabel: syncLabel,
    onSyncNow: syncNow
  }), modal?.type === "centralNote" && React.createElement(RichNoteModal, {
    modal: modal,
    state: db,
    onSave: saveCentralNote,
    syncStatus: syncStatus,
    syncLabel: syncLabel,
    onSyncNow: syncNow
  }), modal?.type === "notesExport" && React.createElement(ExportNotesModal, {
    tags: noteTags,
    onClose: () => setModal(null),
    onExport: exportAiNotes
  }), modal?.type === "importPreview" && React.createElement(ImportPreviewModal, {
    modal: modal,
    onClose: () => setModal(null),
    onImport: applyImportedState
  }), modal?.type === "debug" && React.createElement(DebugPanel, {
    info: modal.info || makeDebugInfo(),
    onClose: () => setModal(null)
  }), modal?.type === "actionLines" && React.createElement(ActionLinesModal, {
    modal: modal,
    onClose: () => setModal(null),
    onSave: addActionEntries
  }), React.createElement(ConfirmModal, {
    dialog: confirmDialog,
    onCancel: () => setConfirmDialog(null),
    onConfirm: () => {
      const run = confirmDialog?.onConfirm;
      setConfirmDialog(null);
      run?.();
    }
  }), toast && React.createElement("div", {
    className: "fixed left-1/2 bottom-6 -translate-x-1/2 z-[60] bg-[#1A1A1A] border border-[#444] text-white text-[13px] font-bold px-4 py-3 rounded-full shadow-2xl"
  }, toast)));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
