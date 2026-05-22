(function attachPlannerCore(global) {
  const BOX_VIEW_VALUES = new Set(["active", "archived", "done"]);
  const BOX_FILTER_VALUES = new Set(["today", "7", "15", "30", "all", "custom"]);
  const ACTION_FILTER_VALUES = new Set(["all", "undone", "done", "notes"]);
  const NOTES_VIEW_VALUES = new Set(["linked", "free", "all"]);
  const NOTES_DATE_VALUES = new Set(["all", "today", "7", "30"]);

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
    const ui = {};
    const view = params.get("view");
    const date = params.get("date");
    if (NOTES_VIEW_VALUES.has(view)) ui.notesView = view;
    if (NOTES_DATE_VALUES.has(date)) ui.notesDate = date;
    ui.notesTag = params.get("tag") || "";
    return ui;
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
    params.set("date", NOTES_DATE_VALUES.has(ui.notesDate) ? ui.notesDate : "all");
    if (String(ui.notesTag || "").trim()) params.set("tag", String(ui.notesTag || "").trim());
  }

  function buildAppHash({ currentView, ui, isSearchOpen, searchQuery }) {
    const params = new URLSearchParams();
    if (isSearchOpen) {
      params.set("tab", currentView === "actions" ? "actions" : currentView === "notes" ? "notes" : "boxes");
      if (String(searchQuery || "").trim()) params.set("q", String(searchQuery || "").trim());
      if (currentView === "actions") appendActionRouteParams(params, ui);
      else if (currentView === "notes") appendNotesRouteParams(params, ui);
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
    parseBoxRouteParams,
    parseActionRouteParams,
    parseNotesRouteParams,
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
