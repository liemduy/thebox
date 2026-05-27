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

test("note editor supports music staff measure numbers", () => {
  const editor = fs.readFileSync("src/ui/noteEditor.jsx", "utf8");
  const modals = fs.readFileSync("src/ui/modals.jsx", "utf8");
  const schema = fs.readFileSync("src/state/schema.js", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  assert.match(editor, /music_staff/);
  assert.match(editor, /insert-music-staff/);
  assert.match(editor, /data-note-music-measure-number/);
  assert.match(modals, /Insert music staff/);
  assert.match(schema, /data-note-music-staff/);
  assert.match(css, /data-note-music-lines/);
});

test("planner logo exposes fifteen personal styles", () => {
  const header = fs.readFileSync("src/components/header.jsx", "utf8");
  const app = fs.readFileSync("src/app.jsx", "utf8");
  assert.match(header, /LOGO_STYLE_COUNT\s*=\s*15/);
  assert.match(app, /logoStyle:[\s\S]*%\s*15/);
});

test("brand header and loading screen share the same logo component", () => {
  const header = fs.readFileSync("src/components/header.jsx", "utf8");
  const app = fs.readFileSync("src/app.jsx", "utf8");
  assert.match(header, /function BrandLogo/);
  assert.match(header, /workspace-title-second[\s\S]*font-serif/);
  assert.match(header, /text-\[#FFD2D7\]/);
  assert.match(app, /<BrandLogo[\s\S]*Loading workspace logo/);
});

test("boot state previews the latest local logo before auth hydration", () => {
  const localStore = fs.readFileSync("src/sync/localStore.js", "utf8");
  const app = fs.readFileSync("src/app.jsx", "utf8");
  assert.match(localStore, /function loadLocalPreviewState/);
  assert.match(localStore, /startsWith\(`\$\{STORAGE_KEY\}:`\)/);
  assert.match(app, /loadLocalPreviewState\(\)\s*\|\|\s*seed\(\)/);
});

test("main header is sticky and note format panels suppress the editor caret", () => {
  const header = fs.readFileSync("src/components/header.jsx", "utf8");
  const modals = fs.readFileSync("src/ui/modals.jsx", "utf8");
  const editor = fs.readFileSync("src/ui/noteEditor.jsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  assert.match(header, /app-header[\s\S]*sticky top-0/);
  assert.match(css, /\.app-header[\s\S]*position:\s*sticky/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(modals, /is-format-panel-open/);
  assert.match(editor, /blur\(\)[\s\S]*view\.dom\.blur\(\)/);
  assert.match(css, /is-format-panel-open[\s\S]*caret-color:\s*transparent/);
});

test("compact layout spacing and fixed note undo controls are wired", () => {
  const app = fs.readFileSync("src/app.jsx", "utf8");
  const notes = fs.readFileSync("src/ui/notes.jsx", "utf8");
  const modals = fs.readFileSync("src/ui/modals.jsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  assert.match(app, /view-nav-row/);
  assert.match(app, /box-filter-row/);
  assert.match(app, /action-filter-row/);
  assert.match(notes, /notes-filter-row/);
  assert.match(css, /\.app-header[\s\S]*padding-bottom:\s*14px/);
  assert.match(css, /\.view-nav-row\s*\{\s*margin-bottom:\s*25px/);
  assert.match(css, /\.box-filter-row\s*\{\s*margin-bottom:\s*25px/);
  assert.match(css, /\.action-filter-row\s*\{\s*margin-bottom:\s*29px/);
  assert.match(css, /\.notes-filter-row\s*\{\s*margin-bottom:\s*18px/);
  assert.match(modals, /note-fixed-history-actions/);
});

test("action rest day state and controls are wired", () => {
  const app = fs.readFileSync("src/app.jsx", "utf8");
  const actions = fs.readFileSync("src/ui/actions.jsx", "utf8");
  const schema = fs.readFileSync("src/state/schema.js", "utf8");
  const actionEntries = fs.readFileSync("src/state/useActionEntries.jsx", "utf8");
  const icons = fs.readFileSync("src/ui/icons.jsx", "utf8");
  assert.match(schema, /restDay:\s*Boolean/);
  assert.match(actionEntries, /function setActionRestDay/);
  assert.match(app, /Mark as rest day/);
  assert.match(app, /Cancel rest day/);
  assert.match(app, /action-rest-toggle/);
  assert.doesNotMatch(app, /Go to today/);
  assert.match(app, /action-date-today/);
  assert.match(actions, /actionDayHasCalendarMarker/);
  assert.match(actions, /calendar-rest-zz/);
  assert.match(actions, /#86efac/);
  assert.match(icons, /Smile/);
  assert.match(icons, /SleepFace/);
});

test("github actions verifies build and browser smoke", () => {
  const workflow = fs.readFileSync(".github/workflows/verify.yml", "utf8");
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});
