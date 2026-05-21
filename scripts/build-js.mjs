import fs from "node:fs/promises";
import vm from "node:vm";

const BABEL_URL = "https://unpkg.com/@babel/standalone@7.26.10/babel.min.js";

async function loadBabel() {
  const response = await fetch(BABEL_URL);
  if (!response.ok) throw new Error(`Could not download Babel: ${response.status}`);
  const source = await response.text();
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.Babel;
}

const [source, Babel] = await Promise.all([
  fs.readFile("src/app.jsx", "utf8"),
  loadBabel()
]);

const result = Babel.transform(source, {
  presets: [["react", { runtime: "classic" }]],
  comments: false,
  compact: false
});

await fs.mkdir("assets", { recursive: true });
await fs.writeFile("assets/app.js", `${result.code}\n`, "utf8");
