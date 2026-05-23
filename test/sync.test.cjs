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
    navigator: { onLine: true },
    sb: null
  });
  runSource(context, "src/sync/cloudState.js");
  runSource(context, "src/sync/syncState.js");
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

test("cloud sync is disabled for local, anonymous, and offline states", () => {
  const runtime = createRuntime();
  runtime.sb = { from: () => ({}) };
  assert.equal(runtime.canUseCloudSync(null, true), false);
  assert.equal(runtime.canUseCloudSync({ id: "local" }, true), false);
  assert.equal(runtime.canUseCloudSync({ id: "user" }, false), false);
  assert.equal(runtime.canUseCloudSync({ id: "user" }, true), true);
});

test("pending snapshots report offline locally and pending in cloud mode", () => {
  const runtime = createRuntime();
  const snapshot = { meta: { pendingSync: true } };
  assert.equal(runtime.syncStatusFromSnapshot(snapshot, { id: "user" }, true), "offline");
  runtime.sb = { from: () => ({}) };
  assert.equal(runtime.syncStatusFromSnapshot(snapshot, { id: "user" }, true), "pending");
  assert.equal(runtime.syncStatusFromSnapshot(snapshot, { id: "local" }, true), "offline");
  assert.equal(runtime.syncStatusFromSnapshot(snapshot, { id: "user" }, false), "offline");
});

test("sync labels recover from mobile resume stuck saving states", () => {
  const runtime = createRuntime();
  assert.equal(runtime.normalizeSyncStatus("saved", false), "offline");
  assert.equal(runtime.normalizeSyncStatus("pending", false), "offline");
  assert.equal(runtime.normalizeSyncStatus("saving", false), "saving");
  assert.equal(runtime.syncLabelFor("saving", true), "Saving");
  assert.equal(runtime.syncLabelFor("offline", false), "Local saved");
});
