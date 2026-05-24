const assert = require("node:assert/strict");
const fs = require("node:fs");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("build includes technical hardening modules", () => {
  const build = fs.readFileSync("scripts/build-js.mjs", "utf8");
  [
    "src/auth/useAuthSession.jsx",
    "src/state/migrations.js",
    "src/state/integrity.js",
    "src/state/useBoxActions.jsx",
    "src/state/useNoteActions.jsx",
    "src/state/useActionEntries.jsx",
    "src/sync/cloudState.js",
    "src/sync/syncState.js",
    "src/sync/useCloudSync.jsx",
    "src/appHooks.jsx",
    "src/ui/noteEditorTableState.jsx"
  ].forEach(file => assert.match(build, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("service worker caches local runtime dependencies", () => {
  const sw = fs.readFileSync("sw.js", "utf8");
  [
    "./assets/app.js",
    "./assets/styles.css",
    "./vendor/react.production.min.js",
    "./vendor/react-dom.production.min.js",
    "./vendor/supabase.min.js",
    "./vendor/prosemirror.bundle.js"
  ].forEach(asset => assert.match(sw, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("app and service worker cache names stay aligned", () => {
  const config = fs.readFileSync("src/config.js", "utf8");
  const sw = fs.readFileSync("sw.js", "utf8");
  const appCacheName = config.match(/APP_CACHE_NAME\s*=\s*"([^"]+)"/)?.[1];
  const swCacheName = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/)?.[1];
  assert.ok(appCacheName);
  assert.equal(appCacheName, swCacheName);
});

test("supabase schema keeps RLS enabled for all app tables", () => {
  const sql = fs.readFileSync("supabase_schema.sql", "utf8").toLowerCase();
  [
    "idea_box_states",
    "idea_notes",
    "idea_note_links",
    "idea_note_events",
    "idea_schema_migrations"
  ].forEach(table => assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`)));
});

test("note editor no longer relies on execCommand", () => {
  const editor = fs.readFileSync("src/ui/noteEditor.jsx", "utf8");
  const modals = fs.readFileSync("src/ui/modals.jsx", "utf8");
  assert.equal(/execCommand/.test(editor + modals), false);
});

test("planner logo exposes fifteen personal styles", () => {
  const header = fs.readFileSync("src/components/header.jsx", "utf8");
  const app = fs.readFileSync("src/app.jsx", "utf8");
  assert.match(header, /LOGO_STYLE_COUNT\s*=\s*15/);
  assert.match(app, /logoStyle:[\s\S]*%\s*15/);
});

test("github actions verifies build and browser smoke", () => {
  const workflow = fs.readFileSync(".github/workflows/verify.yml", "utf8");
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});
