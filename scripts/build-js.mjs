import fs from "node:fs/promises";
import esbuild from "esbuild";
import { transformAsync } from "@babel/core";
import presetReact from "@babel/preset-react";

await fs.mkdir("vendor", { recursive: true });
await esbuild.build({
  entryPoints: ["src/vendor/prosemirror-entry.js"],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "ProseMirrorBundle",
  outfile: "vendor/prosemirror.bundle.js",
  logLevel: "silent"
});

const core = await fs.readFile("src/core.js", "utf8");
const componentFiles = [
  "src/config.js",
  "src/auth/useAuthSession.jsx",
  "src/ui/icons.jsx",
  "src/components/header.jsx",
  "src/state/migrations.js",
  "src/state/schema.js",
  "src/sync/localStore.js",
  "src/sync/cloudState.js",
  "src/sync/noteMirror.js",
  "src/state/notes.js",
  "src/state/integrity.js",
  "src/state/useBoxActions.jsx",
  "src/state/useNoteActions.jsx",
  "src/state/useActionEntries.jsx",
  "src/sync/syncState.js",
  "src/sync/useCloudSync.jsx",
  "src/appHooks.jsx",
  "src/ui/menuHelpers.js",
  "src/state/actions.js",
  "src/ui/search.jsx",
  "src/ui/notes.jsx",
  "src/ui/boxes.jsx",
  "src/ui/actions.jsx",
  "src/ui/noteEditor.jsx",
  "src/ui/noteEditorTableState.jsx",
  "src/ui/modals.jsx",
  "src/ui/auth.jsx"
];
const components = await Promise.all(componentFiles.map(file => fs.readFile(file, "utf8")));
const source = await fs.readFile("src/app.jsx", "utf8");
const combinedSource = [...components, source].join("\n\n");

const result = await transformAsync(combinedSource, {
  filename: "src/app.bundle.jsx",
  babelrc: false,
  configFile: false,
  presets: [[presetReact, { runtime: "classic" }]],
  comments: false,
  compact: false
});

await fs.mkdir("assets", { recursive: true });
await fs.writeFile("assets/app.js", `${core}\n\n${result.code}\n`, "utf8");
