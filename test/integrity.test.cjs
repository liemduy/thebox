const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function runSource(context, file) {
  const source = fs.readFileSync(file, "utf8");
  vm.runInContext(source, context, { filename: file });
}

function createRuntime() {
  const context = vm.createContext({
    console,
    window: {},
    globalThis: {},
    setTimeout,
    clearTimeout
  });
  context.globalThis = context;
  context.window = context;
  runSource(context, "src/core.js");
  vm.runInContext("Object.assign(globalThis, LiemsPlannerCore);", context);
  runSource(context, "src/state/schema.js");
  runSource(context, "src/state/notes.js");
  runSource(context, "src/state/integrity.js");
  return context;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("repairStateIntegrity removes action-note ghosts without touching free notes", () => {
  const runtime = createRuntime();
  const noteId = runtime.actionNoteId("entry-missing");
  const state = {
    ui: {
      collapsedBoxNodes: ["box", "missing-box"],
      expandedBoxNodes: ["missing-box"],
      collapsedActionNodes: ["missing-action"],
      boxCascadeModes: { box: "expanding", "missing-box": "collapsing" },
      actionCascadeModes: { "missing-action": "expanding" }
    },
    boxNodes: [{ id: "box", parentId: null, title: "Box", sort: 1 }],
    actionDays: [{
      id: "day",
      date: "2026-05-22",
      nodes: [{ id: "node", parentId: null, sourceBoxNodeId: "box", entries: [] }]
    }],
    notes: [
      { id: noteId, title: "Ghost", bodyHtml: "<p>Ghost</p>" },
      { id: "free", title: "Free", bodyHtml: "<p>Free</p>" }
    ],
    noteLinks: [
      {
        id: runtime.actionNoteLinkId("entry-missing"),
        noteId,
        linkType: "action_entry",
        actionDate: "2026-05-22",
        actionNodeId: "node",
        actionEntryId: "entry-missing"
      },
      {
        id: "missing-note-link",
        noteId: "missing-note",
        linkType: "box",
        boxNodeId: "box"
      }
    ]
  };

  const repaired = runtime.repairStateIntegrity(state, { timestamp: "2026-05-23T00:00:00.000Z" });
  assert.equal(repaired.notes.find(note => note.id === noteId).deletedAt, "2026-05-23T00:00:00.000Z");
  assert.equal(repaired.notes.find(note => note.id === "free").deletedAt, undefined);
  assert.deepEqual(plain(repaired.noteLinks), []);
  assert.deepEqual(plain(repaired.ui.collapsedBoxNodes), ["box"]);
  assert.deepEqual(plain(repaired.ui.expandedBoxNodes), []);
  assert.deepEqual(plain(repaired.ui.collapsedActionNodes), []);
  assert.deepEqual(plain(repaired.ui.boxCascadeModes), { box: "expanding" });
});

test("repairStateIntegrity preserves valid linked notes", () => {
  const runtime = createRuntime();
  const noteId = runtime.actionNoteId("entry-valid");
  const linkId = runtime.actionNoteLinkId("entry-valid");
  const state = {
    ui: {},
    boxNodes: [{ id: "box", parentId: null, title: "Box", sort: 1 }],
    actionDays: [{
      id: "day",
      date: "2026-05-22",
      nodes: [{
        id: "node",
        parentId: null,
        sourceBoxNodeId: "box",
        entries: [{ id: "entry-valid", type: "note", title: "Note", bodyHtml: "<p>Body</p>" }]
      }]
    }],
    notes: [{ id: noteId, title: "Note", bodyHtml: "<p>Body</p>" }],
    noteLinks: [{
      id: linkId,
      noteId,
      linkType: "action_entry",
      actionDate: "2026-05-22",
      actionNodeId: "node",
      actionEntryId: "entry-valid"
    }]
  };

  const repaired = runtime.repairStateIntegrity(state);
  assert.equal(repaired.notes.find(note => note.id === noteId).deletedAt, undefined);
  assert.deepEqual(plain(repaired.noteLinks.map(link => link.id)), [linkId]);
});
