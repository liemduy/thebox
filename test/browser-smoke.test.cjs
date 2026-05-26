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

test("header workspace personalization keeps a two-letter logo and account menu", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseURL}/?local=1#/boxes`, { waitUntil: "networkidle" });
  await expect(page.getByLabel("Change logo style")).toContainText("LP");

  await page.getByLabel("Workspace name").click();
  const nameInput = page.getByLabel("Workspace name");
  await nameInput.fill("Alpha Beta Gamma");
  await nameInput.blur();
  await expect(page.getByLabel("Workspace name")).toContainText("Alpha");
  await expect(page.locator(".workspace-title-second")).toHaveText("Beta");
  await expect(page.getByLabel("Change logo style")).toContainText("AB");

  await page.getByLabel("Change logo style").click();
  await expect(page.getByLabel("Change logo style")).toContainText("AB");

  await page.getByLabel("Account").click();
  await expect(page.getByText("Export JSON")).toBeVisible();
  await expect(page.getByText("Import JSON")).toBeVisible();
  await expect(page.getByText("Log out")).toBeVisible();
  await expect(page.getByText("Debug")).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});

test("action delete requires confirm and undo redo restores the row", async ({ page }) => {
  const t = "2026-05-25T12:00:00.000Z";
  const snapshot = {
    version: 5,
    meta: {},
    boxNodes: [
      { id: "root", parentId: null, level: 1, title: "Root", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t }
    ],
    actionDays: [
      {
        id: "day_today",
        date: "2026-05-25",
        createdAt: t,
        updatedAt: t,
        nodes: [
          {
            id: "action_root",
            sourceBoxNodeId: "root",
            parentId: null,
            level: 1,
            title: "Root",
            sort: 1,
            createdAt: t,
            updatedAt: t,
            entries: [
              { id: "entry_keep", type: "action", text: "Keep me", done: false, sort: 1, createdAt: t, updatedAt: t }
            ]
          }
        ]
      }
    ],
    notes: [],
    noteLinks: [],
    ui: { selectedActionDate: "2026-05-25", actionFilter: "all" }
  };
  await page.addInitScript(payload => {
    localStorage.setItem("idea-box-html-v13-action-notes:guest", JSON.stringify(payload));
    localStorage.setItem("idea-box-html-v13-action-notes:local", JSON.stringify(payload));
  }, snapshot);

  await page.goto(`${baseURL}/?local=1#/actions?date=2026-05-25&filter=all`, { waitUntil: "networkidle" });
  const row = page.locator('[data-action-entry-id="entry_keep"]');
  await expect(row).toBeVisible();

  await row.getByLabel("Delete action").click();
  await expect(page.getByText("Delete action?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();

  await row.getByLabel("Delete action").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByLabel("Undo").click();
  await expect(row).toBeVisible();
  await page.getByLabel("Redo").click();
  await expect(row).toHaveCount(0);
});

test("box remove requires confirm and undo redo restores the box", async ({ page }) => {
  const t = "2026-05-25T12:00:00.000Z";
  const snapshot = {
    version: 5,
    meta: {},
    boxNodes: [
      { id: "root", parentId: null, level: 1, title: "Remove target", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t }
    ],
    actionDays: [],
    notes: [],
    noteLinks: [],
    ui: { boxView: "active", boxFilter: "all", showBoxDays: false }
  };
  await page.addInitScript(payload => {
    localStorage.setItem("idea-box-html-v13-action-notes:guest", JSON.stringify(payload));
    localStorage.setItem("idea-box-html-v13-action-notes:local", JSON.stringify(payload));
  }, snapshot);

  await page.goto(`${baseURL}/?local=1#/boxes?view=active&range=all&showDays=0`, { waitUntil: "networkidle" });
  const box = page.locator('[data-box-node-id="root"]');
  await expect(box).toBeVisible();

  await box.getByLabel("Box menu").click();
  await page.getByText("remove", { exact: true }).click();
  await expect(page.getByText("Remove box?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(box).toBeVisible();

  await box.getByLabel("Box menu").click();
  await page.getByText("remove", { exact: true }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(box).toHaveCount(0);
  await page.getByLabel("Undo").click();
  await expect(box).toBeVisible();
  await page.getByLabel("Redo").click();
  await expect(box).toHaveCount(0);
});

test("note editor top toolbar stays fixed while editor scrolls", async ({ page }) => {
  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Toolbar fixed smoke");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type(Array.from({ length: 35 }, (_, index) => `Line ${index + 1}`).join("\n"));

  const before = await page.getByRole("button", { name: "Back" }).boundingBox();
  await page.locator(".note-editor-scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const after = await page.getByRole("button", { name: "Back" }).boundingBox();

  expect(Math.abs((before?.y || 0) - (after?.y || 0))).toBeLessThan(1);
});

test("note table auto fit persists after save and reopen", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Auto fit smoke");

  await page.getByRole("button", { name: "Insert table" }).click();
  await page.locator(".table-panel-form").getByRole("button", { name: "Insert", exact: true }).click();
  await expect(page.locator(".ProseMirror table")).toBeVisible();

  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Table options" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Auto fit" }).click();
  await expect(page.locator(".ProseMirror table[data-layout='auto']")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Auto fit smoke")).toBeVisible();

  await page.getByText("Auto fit smoke").click();
  await expect(page.getByPlaceholder("Title")).toBeVisible();
  await expect(page.locator(".ProseMirror table[data-layout='auto']")).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test("numbered list shortcut continues as an ordered list", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Numbered list smoke");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("1. First");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");

  await expect(page.locator(".ProseMirror ol > li")).toHaveCount(2);
  const listInfo = await page.locator(".ProseMirror ol").evaluate(ol => ({
    style: getComputedStyle(ol).listStyleType,
    text: Array.from(ol.querySelectorAll(":scope > li")).map(li => li.textContent.trim())
  }));
  expect(listInfo).toEqual({ style: "decimal", text: ["First", "Second"] });

  expect(runtimeErrors).toEqual([]);
});

test("dash shortcut starts a bullet list", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Bullet list smoke");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("- First");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");

  await expect(page.locator(".ProseMirror ul > li")).toHaveCount(2);
  const listInfo = await page.locator(".ProseMirror ul").evaluate(ul => ({
    style: getComputedStyle(ul).listStyleType,
    text: Array.from(ul.querySelectorAll(":scope > li")).map(li => li.textContent.trim())
  }));
  expect(listInfo).toEqual({ style: "disc", text: ["First", "Second"] });

  expect(runtimeErrors).toEqual([]);
});

test("note editor color swatch applies and persists selected text color", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Color smoke");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Color me");
  await page.keyboard.press("Control+A");
  await page.getByRole("button", { name: "Text color" }).click();

  await expect(page.locator(".ProseMirror span[data-note-color='#ffd2d7']")).toContainText("Color me");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Color smoke")).toBeVisible();
  await page.getByText("Color smoke").click();
  await expect(page.locator(".ProseMirror span[data-note-color='#ffd2d7']")).toContainText("Color me");

  expect(runtimeErrors).toEqual([]);
});

test("note editor opens color picker without selection and accepts hex color", async ({ page }) => {
  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Color picker smoke");
  await page.locator(".ProseMirror").click();

  await page.getByRole("button", { name: "Text color" }).click();
  await expect(page.getByLabel("Text color hex")).toBeVisible();
  await page.getByLabel("Text color hex").fill("#93c5fd");
  await page.getByRole("button", { name: "ok" }).click();
  await page.keyboard.type("Blue text");

  await expect(page.locator(".ProseMirror span[data-note-color='#93c5fd']")).toContainText("Blue text");
});

test("note editor clears list formatting before applying Aa", async ({ page }) => {
  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Aa list smoke");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("- First");

  await expect(page.locator(".ProseMirror ul > li")).toHaveCount(1);
  await page.getByRole("button", { name: /^Text style:/ }).click();
  await expect(page.locator(".ProseMirror ul")).toHaveCount(0);
  await expect(page.locator(".ProseMirror h1")).toContainText("First");
});

test("note editor recognizes hierarchical numbering and indent fallback", async ({ page }) => {
  await page.goto(`${baseURL}/?local=1#/notes`, { waitUntil: "networkidle" });
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("Hierarchy smoke");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("1.1. Nested");

  await expect(page.locator(".ProseMirror ol[data-list-depth='1'] > li")).toContainText("Nested");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. Top");
  await page.getByRole("button", { name: "Indent" }).click();

  await expect(page.locator(".ProseMirror ol[data-list-depth='1']")).toHaveCount(2);
});

test("creating a free note keeps All view selected", async ({ page }) => {
  await page.goto(`${baseURL}/?local=1#/notes?view=all`, { waitUntil: "networkidle" });
  await expect(page.locator(".filter-row").getByRole("button", { name: "All", exact: true })).toBeVisible();
  await page.getByLabel("Create note").click();
  await page.getByPlaceholder("Title").fill("All view stays");
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.locator(".filter-row").getByRole("button", { name: "All", exact: true })).toBeVisible();
  await expect(page.getByText("All view stays")).toBeVisible();
});

test("box notes show root and sub-box title underline styles", async ({ page }) => {
  const t = "2026-05-24T12:00:00.000Z";
  const snapshot = {
    version: 5,
    meta: {},
    boxNodes: [
      { id: "root", parentId: null, level: 1, title: "Root", sort: 1, boxNoteTitle: "Root Note", boxNoteHtml: "<p>Root body</p>", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t },
      { id: "sub", parentId: "root", level: 2, title: "Sub", sort: 1, boxNoteTitle: "Sub Note", boxNoteHtml: "<p>Sub body</p>", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t }
    ],
    actionDays: [],
    notes: [
      { id: "boxnote_root", title: "Root Note", bodyHtml: "<p>Root body</p>", bodyText: "Root body", noteDate: "2026-05-24", createdAt: t, updatedAt: t, clientUpdatedAt: t },
      { id: "boxnote_sub", title: "Sub Note", bodyHtml: "<p>Sub body</p>", bodyText: "Sub body", noteDate: "2026-05-24", createdAt: t, updatedAt: t, clientUpdatedAt: t }
    ],
    noteLinks: [
      { id: "link_box_root", noteId: "boxnote_root", linkType: "box", boxNodeId: "root", sort: 1, createdAt: t },
      { id: "link_box_sub", noteId: "boxnote_sub", linkType: "box", boxNodeId: "sub", sort: 2, createdAt: t }
    ],
    ui: { notesView: "all" }
  };
  await page.addInitScript(payload => {
    localStorage.setItem("idea-box-html-v13-action-notes:guest", JSON.stringify(payload));
    localStorage.setItem("idea-box-html-v13-action-notes:local", JSON.stringify(payload));
  }, snapshot);

  await page.goto(`${baseURL}/?local=1#/notes?view=all`, { waitUntil: "networkidle" });
  await expect(page.locator('[data-note-id="boxnote_root"] h3')).toHaveClass(/note-title-box/);
  await expect(page.locator('[data-note-id="boxnote_sub"] h3')).toHaveClass(/note-title-subbox/);
});

test("box note badge opens a dedicated box notes page", async ({ page }) => {
  const t = "2026-05-24T12:00:00.000Z";
  const snapshot = {
    version: 5,
    meta: {},
    boxNodes: [
      { id: "root", parentId: null, level: 1, title: "Root", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t }
    ],
    actionDays: [],
    notes: [
      { id: "note_a", title: "First linked note", bodyHtml: "<p>One</p>", bodyText: "One", noteDate: "2026-05-24", createdAt: t, updatedAt: t, clientUpdatedAt: t },
      { id: "note_b", title: "Second linked note", bodyHtml: "<p>Two</p>", bodyText: "Two", noteDate: "2026-05-23", createdAt: t, updatedAt: t, clientUpdatedAt: t }
    ],
    noteLinks: [
      { id: "link_a", noteId: "note_a", linkType: "box", boxNodeId: "root", sort: 1, createdAt: t },
      { id: "link_b", noteId: "note_b", linkType: "box", boxNodeId: "root", sort: 2, createdAt: t }
    ],
    ui: { boxFilter: "all", showBoxDays: false }
  };
  await page.addInitScript(payload => {
    localStorage.setItem("idea-box-html-v13-action-notes:guest", JSON.stringify(payload));
    localStorage.setItem("idea-box-html-v13-action-notes:local", JSON.stringify(payload));
  }, snapshot);

  await page.goto(`${baseURL}/?local=1#/boxes?view=active&range=all&showDays=0`, { waitUntil: "networkidle" });
  const noteButton = page.locator('[data-box-node-id="root"]').getByLabel("View notes");
  await expect(noteButton).toContainText("2");
  await noteButton.click();

  await expect(page).toHaveURL(/#\/box-notes\?box=root/);
  await expect(page.getByText("First linked note")).toBeVisible();
  await expect(page.getByText("Second linked note")).toBeVisible();
  await expect(page.getByLabel("Create box note")).toBeVisible();
});

test("linked note location jumps back to its source box", async ({ page }) => {
  const t = "2026-05-24T12:00:00.000Z";
  const snapshot = {
    version: 5,
    meta: {},
    boxNodes: [
      { id: "root", parentId: null, level: 1, title: "Root", sort: 1, boxNoteTitle: "", boxNoteHtml: "", archivedAt: null, doneAt: null, createdAt: t, updatedAt: t }
    ],
    actionDays: [],
    notes: [
      { id: "note_a", title: "Located note", bodyHtml: "<p>Find me</p>", bodyText: "Find me", noteDate: "2026-05-24", createdAt: t, updatedAt: t, clientUpdatedAt: t }
    ],
    noteLinks: [
      { id: "link_a", noteId: "note_a", linkType: "box", boxNodeId: "root", sort: 1, createdAt: t }
    ],
    ui: { notesView: "all" }
  };
  await page.addInitScript(payload => {
    localStorage.setItem("idea-box-html-v13-action-notes:guest", JSON.stringify(payload));
    localStorage.setItem("idea-box-html-v13-action-notes:local", JSON.stringify(payload));
  }, snapshot);

  await page.goto(`${baseURL}/?local=1#/notes?view=all`, { waitUntil: "networkidle" });
  await page.locator('[data-note-id="note_a"]').getByLabel("Open note origin").click();

  await expect(page).toHaveURL(/#\/boxes\?/);
  await expect(page.locator('[data-box-node-id="root"]')).toHaveClass(/flash-target/);
});
