import fs from "node:fs/promises";
import { transformAsync } from "@babel/core";
import presetReact from "@babel/preset-react";

const core = await fs.readFile("src/core.js", "utf8");
const componentFiles = [
  "src/components/header.jsx"
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
