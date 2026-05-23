const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createRuntime() {
  const context = vm.createContext({ console });
  const source = fs.readFileSync("src/state/migrations.js", "utf8");
  vm.runInContext(source, context, { filename: "src/state/migrations.js" });
  vm.runInContext("globalThis.CURRENT_STATE_VERSION_VALUE = CURRENT_STATE_VERSION;", context);
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

test("migrates legacy nodes into v5 state shape", () => {
  const runtime = createRuntime();
  const legacy = {
    version: 3,
    nodes: [{ id: "box", title: "Legacy" }],
    ui: null,
    meta: null
  };

  const migrated = runtime.migrateState(legacy);
  assert.equal(migrated.version, runtime.CURRENT_STATE_VERSION_VALUE);
  assert.deepEqual(plain(migrated.boxNodes), legacy.nodes);
  assert.deepEqual(plain(migrated.actionDays), []);
  assert.deepEqual(plain(migrated.notes), []);
  assert.deepEqual(plain(migrated.noteLinks), []);
  assert.deepEqual(plain(migrated.ui), {});
  assert.deepEqual(plain(migrated.meta), {});
  assert.equal(legacy.boxNodes, undefined);
});

test("keeps current states idempotent", () => {
  const runtime = createRuntime();
  const current = {
    version: runtime.CURRENT_STATE_VERSION_VALUE,
    boxNodes: [{ id: "box" }],
    actionDays: [{ id: "day" }],
    notes: [{ id: "note" }],
    noteLinks: [{ id: "link" }],
    ui: { boxView: "active" },
    meta: { pendingSync: true }
  };

  assert.deepEqual(plain(runtime.migrateState(current)), current);
});
