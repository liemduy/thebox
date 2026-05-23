const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const ROOT = process.cwd();
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

let server;
let baseURL;

async function serveFile(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const target = path.resolve(ROOT, cleanPath);
  if (!target.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const stat = await fs.stat(target);
    const file = stat.isDirectory() ? path.join(target, "index.html") : target;
    const body = await fs.readFile(file);
    response.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    response.end(body);
  } catch {
    const body = await fs.readFile(path.join(ROOT, "index.html"));
    response.writeHead(200, { "content-type": MIME[".html"] });
    response.end(body);
  }
}

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    serveFile(request, response).catch(error => {
      response.writeHead(500);
      response.end(error.message);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseURL = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test("app loads in local mode and primary tabs respond", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseURL}/?local=1#/boxes`, { waitUntil: "networkidle" });
  await expect(page).toHaveTitle(/Liem's Planner/);
  await expect(page.getByText("Content")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create box" })).toBeVisible();

  const viewTitle = page.locator(".view-title");
  await viewTitle.getByRole("button", { name: /^Act$/ }).click();
  await expect(page.getByRole("button", { name: "Open action date calendar" })).toBeVisible();

  await page.getByRole("button", { name: /Create actions/i }).click();
  await expect(page.getByText("Content")).toBeVisible();

  await viewTitle.getByRole("button", { name: /^Note$/ }).click();
  await expect(page.getByLabel("Create note")).toBeVisible();
  await page.getByLabel("Create note").click();
  await expect(page.getByPlaceholder("Title")).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});
