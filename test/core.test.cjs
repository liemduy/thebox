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
