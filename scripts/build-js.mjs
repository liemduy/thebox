import fs from "node:fs/promises";
import { transformAsync } from "@babel/core";
import presetReact from "@babel/preset-react";

const source = await fs.readFile("src/app.jsx", "utf8");

const result = await transformAsync(source, {
  filename: "src/app.jsx",
  babelrc: false,
  configFile: false,
  presets: [[presetReact, { runtime: "classic" }]],
  comments: false,
  compact: false
});

await fs.mkdir("assets", { recursive: true });
await fs.writeFile("assets/app.js", `${result.code}\n`, "utf8");
