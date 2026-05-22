const assert = require("node:assert/strict");
const core = require("../src/core.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("parses box route filters and showDays toggle", () => {
  const route = core.parseRouteHash("#/boxes?view=done&range=custom&from=2026-05-01&to=2026-05-22&showDays=0");
  assert.equal(route.name, "boxes");
  assert.deepEqual(route.ui, {
    boxView: "done",
    boxFilter: "custom",
    showBoxDays: false,
    boxFilterFrom: "2026-05-01",
    boxFilterTo: "2026-05-22"
  });
  assert.equal(core.routeView(route), "boxes");
});

test("builds action and search hashes with stable params", () => {
  assert.equal(
    core.buildAppHash({
      currentView: "actions",
      ui: { selectedActionDate: "2026-05-22", actionFilter: "undone" },
      isSearchOpen: false,
      searchQuery: ""
    }),
    "#/actions?date=2026-05-22&filter=undone"
  );
  assert.equal(
    core.buildAppHash({
      currentView: "boxes",
      ui: { boxView: "active", boxFilter: "today", showBoxDays: false },
      isSearchOpen: true,
      searchQuery: "  note title  "
    }),
    "#/search?tab=boxes&q=note+title&view=active&range=today&showDays=0"
  );
});

test("parses and builds notes route filters", () => {
  const route = core.parseRouteHash("#/notes?view=free&tags=idea,work&dates=22%2F05%2F2026%2C+01%2F05%2F2026+-+22%2F05%2F2026");
  assert.equal(route.name, "notes");
  assert.equal(core.routeView(route), "notes");
  assert.deepEqual(route.ui, {
    notesView: "free",
    notesDate: "all",
    notesTag: "",
    notesTagsInput: "idea,work",
    notesDatesInput: "22/05/2026, 01/05/2026 - 22/05/2026"
  });
  assert.equal(
    core.buildAppHash({
      currentView: "notes",
      ui: { notesView: "linked", notesTagsInput: "project,work", notesDatesInput: "22/05/2026, 01/05/2026 - 22/05/2026" },
      isSearchOpen: false,
      searchQuery: ""
    }),
    "#/notes?view=linked&tags=project%2Cwork&dates=22%2F05%2F2026%2C+01%2F05%2F2026+-+22%2F05%2F2026"
  );
});

test("keeps legacy note route params compatible", () => {
  const route = core.parseRouteHash("#/notes?view=free&date=30&tag=idea");
  assert.deepEqual(route.ui, {
    notesView: "free",
    notesDate: "30",
    notesTagsInput: "idea",
    notesTag: "idea",
    notesDatesInput: ""
  });
  assert.equal(
    core.buildAppHash({
      currentView: "notes",
      ui: { notesView: "linked", notesDate: "today", notesTag: "project" },
      isSearchOpen: false,
      searchQuery: ""
    }),
    "#/notes?view=linked&tags=project&date=today"
  );
});

test("resets omitted note route filters to defaults", () => {
  const route = core.parseRouteHash("#/notes?view=all");
  assert.deepEqual(route.ui, {
    notesView: "all",
    notesDate: "all",
    notesTag: "",
    notesTagsInput: "",
    notesDatesInput: ""
  });

  const search = core.parseRouteHash("#/search?tab=notes&q=idea");
  assert.deepEqual(search.ui, {
    notesView: "linked",
    notesDate: "all",
    notesTag: "",
    notesTagsInput: "",
    notesDatesInput: ""
  });
});

test("normalizes cascade mode maps without keeping garbage", () => {
  assert.deepEqual(
    core.normalizeModeMap({ a: "expanding", b: "collapsing", c: "bad", d: true }),
    { a: "expanding", b: "collapsing" }
  );
  assert.deepEqual(core.normalizeModeMap(["expanding"]), {});
});

test("plans cascade expand and collapse one level at a time", () => {
  assert.deepEqual(core.cascadePlan(0, 3, "expanding"), {
    direction: "expand",
    deep: false,
    nextDepth: 1,
    nextMode: "expanding"
  });
  assert.deepEqual(core.cascadePlan(1, 3, "expanding"), {
    direction: "expand",
    deep: true,
    nextDepth: 2,
    nextMode: "expanding"
  });
  assert.deepEqual(core.cascadePlan(3, 3, "expanding"), {
    direction: "collapse",
    deep: true,
    nextDepth: 2,
    nextMode: "collapsing"
  });
  assert.deepEqual(core.cascadePlan(1, 3, "collapsing"), {
    direction: "collapse",
    deep: false,
    nextDepth: 0,
    nextMode: "expanding"
  });
});

test("applies cascade depth while closing deeper descendants", () => {
  const nodes = [
    { id: "root", parentId: null },
    { id: "child", parentId: "root" },
    { id: "grand", parentId: "child" }
  ];
  const open = new Set(["grand"]);
  const getChildren = node => nodes.filter(item => item.parentId === node.id);
  const setOpen = (node, isOpen) => isOpen ? open.add(node.id) : open.delete(node.id);

  core.applyCascadeDepth(nodes[0], 2, getChildren, setOpen);
  assert.deepEqual([...open].sort(), ["child", "root"]);

  core.applyCascadeDepth(nodes[0], 0, getChildren, setOpen);
  assert.deepEqual([...open], []);
});

test("computes date helpers predictably with explicit today", () => {
  assert.equal(core.addDaysYMD("2026-05-22", 3), "2026-05-25");
  assert.equal(core.displayDate("2026-05-22", false, "2026-05-22"), "22/05/2026 (today)");
  assert.equal(core.daysFromToday("2026-05-20", "2026-05-22"), 2);
});

test("walks box trees and produces stable paths", () => {
  const nodes = [
    { id: "root", parentId: null, title: "Root", sort: 2 },
    { id: "other", parentId: null, title: "Other", sort: 1 },
    { id: "child", parentId: "root", title: "Child", sort: 1 },
    { id: "grand", parentId: "child", title: "Grand", sort: 1 }
  ];

  assert.deepEqual(core.childrenOf(null, nodes).map(node => node.id), ["other", "root"]);
  assert.deepEqual(core.descendantsOf("root", nodes).map(node => node.id), ["child", "grand"]);
  assert.equal(core.rootOf(core.getNode(nodes, "grand"), nodes).id, "root");
  assert.equal(core.pathOf(core.getNode(nodes, "grand"), nodes), "Root > Child > Grand");
});

test("sorts entries and filters visible action branches", () => {
  const parent = { id: "parent", entries: [] };
  const child = {
    id: "child",
    parentId: "parent",
    entries: [
      { id: "done", type: "action", done: true, sort: 2 },
      { id: "note", type: "note", sort: 1 }
    ]
  };

  assert.deepEqual(core.entriesFor(child).map(entry => entry.id), ["note", "done"]);
  assert.deepEqual(core.visibleEntriesFor(child, "done").map(entry => entry.id), ["done"]);
  assert.equal(core.hasVisibleAction(parent, [parent, child], "notes"), true);
  assert.equal(core.hasVisibleAction(parent, [parent, child], "undone"), false);
});

test("summarizes root progress without merging sibling roots", () => {
  const state = {
    ui: { boxFilter: "all" },
    boxNodes: [
      { id: "root", parentId: null, title: "Root", sort: 1 },
      { id: "child", parentId: "root", title: "Child", sort: 1 },
      { id: "other", parentId: null, title: "Other", sort: 2 }
    ],
    actionDays: [{
      id: "day",
      date: "2026-05-22",
      nodes: [
        { id: "rootAction", sourceBoxNodeId: "root", entries: [{ id: "a", type: "action", done: true, sort: 1 }] },
        { id: "childAction", sourceBoxNodeId: "child", entries: [{ id: "b", type: "action", done: false, sort: 1 }] },
        { id: "otherAction", sourceBoxNodeId: "other", entries: [{ id: "c", type: "action", done: false, sort: 1 }] }
      ]
    }]
  };

  const summary = core.summariesForRoot(state, core.getNode(state.boxNodes, "root"));
  assert.equal(summary.length, 1);
  assert.deepEqual(summary[0].progress, { total: 2, done: 1 });
  assert.equal(core.rootHasEntriesOnDay(state, core.getNode(state.boxNodes, "root"), state.actionDays[0]), true);
});
