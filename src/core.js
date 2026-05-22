(function attachPlannerCore(global) {
  const BOX_VIEW_VALUES = new Set(["active", "archived", "done"]);
  const BOX_FILTER_VALUES = new Set(["today", "7", "15", "30", "all", "custom"]);
  const ACTION_FILTER_VALUES = new Set(["all", "undone", "done", "notes"]);

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

  function parseRouteHash(hash = global.location?.hash || "") {
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
    todayYMD,
    addDaysYMD,
    displayDate,
    daysFromToday,
    normalizeModeMap,
    validYMD,
    boolParam,
    parseBoxRouteParams,
    parseActionRouteParams,
    parseRouteHash,
    routeView,
    appendBoxRouteParams,
    appendActionRouteParams,
    buildAppHash,
    cascadeMaxDepth,
    cascadeOpenDepth,
    closeCascade,
    applyCascadeDepth,
    cascadePlan
  };

  global.LiemsPlannerCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
