const NOTE_EDITOR_EMPTY_TOOLBAR = {
  bold: false,
  italic: false,
  underline: false,
  heading: false,
  bullet: false,
  ordered: false,
  checklist: false,
  quote: false,
  table: false,
  canUndo: false,
  canRedo: false,
  indentLevel: 0,
  selectionEmpty: true,
  color: "#ffd2d7",
  textLevel: "body",
  listStyle: "none"
};

let noteEditorSchemaCache = null;
const NOTE_TEXT_LEVELS = ["body", "title", "heading", "subheading", "small"];
const NOTE_BULLET_STYLES = ["disc", "circle", "square"];
const NOTE_ORDERED_STYLES = ["decimal", "lower-alpha", "lower-roman"];
const NOTE_EDITOR_DEFAULT_COLOR = "#ffd2d7";
const NOTE_EDITOR_SWATCHES = ["#ffd2d7", "#ffffff", "#a7a7a7", "#fca5a5", "#fcd34d", "#86efac", "#93c5fd", "#c4b5fd"];

function noteEditorPM() {
  return window.ProseMirrorBundle || null;
}

function clampNoteIndent(value) {
  return Math.max(0, Math.min(4, Number(value) || 0));
}

function noteIndentAttrs(value) {
  const indent = clampNoteIndent(value);
  return indent > 0 ? { "data-indent": String(indent) } : {};
}

function noteParagraphAttrs(indent, size) {
  const attrs = noteIndentAttrs(indent);
  if (size === "small") attrs["data-size"] = "small";
  return attrs;
}

function parseNoteIndent(dom) {
  return clampNoteIndent(dom?.getAttribute?.("data-indent"));
}

function parseNoteParagraphSize(dom) {
  return String(dom?.getAttribute?.("data-size") || "") === "small" ? "small" : "body";
}

function normalizeNoteTextLevel(value) {
  return NOTE_TEXT_LEVELS.includes(value) ? value : "body";
}

function normalizeNoteEditorColor(value) {
  return safeNoteColor(value) || NOTE_EDITOR_DEFAULT_COLOR;
}

function parseListDepth(dom) {
  return clampNoteIndent(dom?.getAttribute?.("data-list-depth"));
}

function parseBulletListStyle(dom) {
  const value = String(dom?.getAttribute?.("data-list-style") || "").toLowerCase();
  return NOTE_BULLET_STYLES.includes(value) ? value : "disc";
}

function parseOrderedListStyle(dom) {
  const value = String(dom?.getAttribute?.("data-list-style") || "").toLowerCase();
  return NOTE_ORDERED_STYLES.includes(value) ? value : "decimal";
}

function listDepthAttrs(depth) {
  const value = clampNoteIndent(depth);
  return value > 0 ? { "data-list-depth": String(value) } : {};
}

function bulletListAttrs(style, depth) {
  const attrs = listDepthAttrs(depth);
  if (style && style !== "disc") attrs["data-list-style"] = style;
  return attrs;
}

function orderedListAttrs(order, style, depth) {
  const attrs = listDepthAttrs(depth);
  if (Number(order || 1) !== 1) attrs.start = Number(order || 1);
  if (style && style !== "decimal") attrs["data-list-style"] = style;
  return attrs;
}

function createNoteEditorSchema() {
  const pm = noteEditorPM();
  if (!pm) return null;
  if (noteEditorSchemaCache) return noteEditorSchemaCache;

  let nodes = pm.addListNodes(pm.basicSchema.spec.nodes, "paragraph block*", "block");
  const paragraphSpec = pm.basicSchema.spec.nodes.get("paragraph");
  const headingSpec = pm.basicSchema.spec.nodes.get("heading");
  const bulletListSpec = nodes.get("bullet_list");
  const orderedListSpec = nodes.get("ordered_list");

  nodes = nodes.update("paragraph", {
    ...paragraphSpec,
    attrs: { indent: { default: 0 }, size: { default: "body" } },
    parseDOM: [{ tag: "p", getAttrs: dom => ({ indent: parseNoteIndent(dom), size: parseNoteParagraphSize(dom) }) }],
    toDOM(node) {
      return ["p", noteParagraphAttrs(node.attrs.indent, node.attrs.size), 0];
    }
  });

  nodes = nodes.update("heading", {
    ...headingSpec,
    attrs: { level: { default: 3 }, indent: { default: 0 } },
    parseDOM: [1, 2, 3, 4, 5, 6].map(level => ({
      tag: `h${level}`,
      getAttrs: dom => ({ level, indent: parseNoteIndent(dom) })
    })),
    toDOM(node) {
      return [`h${node.attrs.level}`, noteIndentAttrs(node.attrs.indent), 0];
    }
  });

  nodes = nodes.update("bullet_list", {
    ...bulletListSpec,
    attrs: { style: { default: "disc" }, depth: { default: 0 } },
    parseDOM: [{
      tag: "ul",
      getAttrs: dom => String(dom?.getAttribute?.("data-type") || "") === "task-list"
        ? false
        : { style: parseBulletListStyle(dom), depth: parseListDepth(dom) }
    }],
    toDOM(node) {
      return ["ul", bulletListAttrs(node.attrs.style, node.attrs.depth), 0];
    }
  });

  nodes = nodes.update("ordered_list", {
    ...orderedListSpec,
    attrs: { order: { default: 1 }, style: { default: "decimal" }, depth: { default: 0 } },
    parseDOM: [{
      tag: "ol",
      getAttrs: dom => ({
        order: dom?.hasAttribute?.("start") ? Number(dom.getAttribute("start") || 1) : 1,
        style: parseOrderedListStyle(dom),
        depth: parseListDepth(dom)
      })
    }],
    toDOM(node) {
      return ["ol", orderedListAttrs(node.attrs.order, node.attrs.style, node.attrs.depth), 0];
    }
  });

  nodes = nodes.addToEnd("task_list", {
    group: "block",
    content: "task_item+",
    parseDOM: [{ tag: "ul[data-type='task-list']" }],
    toDOM() {
      return ["ul", { "data-type": "task-list" }, 0];
    }
  });

  nodes = nodes.addToEnd("table", {
    group: "block",
    content: "table_row+",
    isolating: true,
    attrs: { layout: { default: "fixed" } },
    parseDOM: [{
      tag: "table",
      getAttrs: dom => ({ layout: dom?.getAttribute?.("data-layout") === "auto" ? "auto" : "fixed" })
    }],
    toDOM(node) {
      return ["table", { "data-layout": node.attrs.layout === "auto" ? "auto" : "fixed" }, ["tbody", 0]];
    }
  });

  nodes = nodes.addToEnd("table_row", {
    content: "table_cell+",
    parseDOM: [{ tag: "tr" }],
    toDOM() {
      return ["tr", 0];
    }
  });

  nodes = nodes.addToEnd("table_cell", {
    content: "block+",
    isolating: true,
    parseDOM: [{ tag: "td" }, { tag: "th" }],
    toDOM() {
      return ["td", 0];
    }
  });

  nodes = nodes.addToEnd("task_item", {
    content: "paragraph block*",
    defining: true,
    attrs: { checked: { default: false } },
    parseDOM: [{
      tag: "li[data-type='task-item']",
      getAttrs: dom => ({ checked: String(dom?.getAttribute?.("data-checked") || "") === "true" })
    }],
    toDOM(node) {
      return ["li", { "data-type": "task-item", "data-checked": node.attrs.checked ? "true" : "false" }, 0];
    }
  });

  const marks = pm.basicSchema.spec.marks.addToEnd("underline", {
    parseDOM: [
      { tag: "u" },
      {
        style: "text-decoration",
        getAttrs: value => String(value || "").includes("underline") ? null : false
      }
    ],
    toDOM() {
      return ["u", 0];
    }
  }).addToEnd("text_color", {
    attrs: { color: { default: NOTE_EDITOR_DEFAULT_COLOR } },
    parseDOM: [
      {
        tag: "span[data-note-color]",
        getAttrs: dom => {
          const color = safeNoteColor(dom?.getAttribute?.("data-note-color"));
          return color ? { color } : false;
        }
      },
      {
        style: "color",
        getAttrs: value => {
          const color = safeNoteColor(value);
          return color ? { color } : false;
        }
      }
    ],
    toDOM(mark) {
      const color = normalizeNoteEditorColor(mark.attrs.color);
      return ["span", { "data-note-color": color, style: `color: ${color}` }, 0];
    }
  });

  noteEditorSchemaCache = new pm.Schema({ nodes, marks });
  return noteEditorSchemaCache;
}

function normalizeHtmlForNoteEditor(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = sanitizeHtml(html || "");
  wrapper.querySelectorAll("div").forEach(div => {
    const p = document.createElement("p");
    if (div.hasAttribute("data-indent")) p.setAttribute("data-indent", div.getAttribute("data-indent"));
    if (div.getAttribute("data-size") === "small") p.setAttribute("data-size", "small");
    p.innerHTML = div.innerHTML || "<br>";
    div.replaceWith(p);
  });
  if (!wrapper.textContent.trim() && !wrapper.querySelector("br, ul, ol, blockquote, table, h1, h2, h3")) {
    wrapper.innerHTML = "<p></p>";
  }
  return wrapper.innerHTML;
}

function parseNoteEditorDoc(schema, html) {
  const pm = noteEditorPM();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = normalizeHtmlForNoteEditor(html);
  return pm.DOMParser.fromSchema(schema).parse(wrapper);
}

function serializeNoteEditorDoc(schema, doc) {
  const pm = noteEditorPM();
  const fragment = pm.DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return sanitizeHtml(wrapper.innerHTML);
}

function noteEditorIsEmptyDoc(doc) {
  return doc.childCount === 1 && doc.firstChild?.isTextblock && doc.firstChild.content.size === 0;
}

function noteEditorPlaceholderPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      decorations(state) {
        if (!noteEditorIsEmptyDoc(state.doc)) return null;
        const first = state.doc.firstChild;
        return pm.DecorationSet.create(state.doc, [
          pm.Decoration.node(0, first.nodeSize, { class: "is-editor-empty", "data-placeholder": "Write your note here..." })
        ]);
      }
    }
  });
}

function noteEditorHashtagPlugin() {
  const pm = noteEditorPM();
  const key = new pm.PluginKey("note-hashtag-decorations");
  return new pm.Plugin({
    key,
    props: {
      decorations(state) {
        const decorations = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text?.includes("#")) return;
          const regex = /(^|[^\p{L}\p{N}_-])#([\p{L}\p{N}_-]{1,48})/gu;
          let match;
          while ((match = regex.exec(node.text))) {
            const start = match.index + match[1].length;
            const end = start + match[2].length + 1;
            decorations.push(pm.Decoration.inline(pos + start, pos + end, { class: "note-hashtag" }));
          }
        });
        return decorations.length ? pm.DecorationSet.create(state.doc, decorations) : null;
      }
    }
  });
}

function taskItemFromDom(view, itemEl, schema) {
  const rawPositions = [];
  try { rawPositions.push(view.posAtDOM(itemEl, 0)); } catch {}
  try { rawPositions.push(view.posAtDOM(itemEl, itemEl.childNodes.length)); } catch {}
  for (const rawPos of rawPositions) {
    const pos = Math.max(0, Math.min(view.state.doc.content.size, Number(rawPos) || 0));
    const $pos = view.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type === schema.nodes.task_item) {
        return { node, pos: $pos.before(depth) };
      }
    }
  }
  return null;
}

function noteEditorChecklistPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      handleClick(view, pos, event) {
        const targetEl = event.target?.closest?.("li[data-type='task-item']");
        const pointEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("li[data-type='task-item']");
        const itemEl = targetEl || pointEl;
        if (!itemEl || !view.dom.contains(itemEl)) return false;
        const rect = itemEl.getBoundingClientRect();
        if (event.clientX > rect.left + 34) return false;
        const item = taskItemFromDom(view, itemEl, schema);
        if (!item) return false;
        view.dispatch(view.state.tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked: !item.node.attrs.checked }).scrollIntoView());
        view.focus();
        return true;
      }
    }
  });
}

function noteEditorListShortcutPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== " " || from !== to) return false;
        const state = view.state;
        if (currentListKind(state) !== "none" || insideTable(state)) return false;
        const block = currentTextblockWithPos(state);
        if (!block || block.node.type !== schema.nodes.paragraph) return false;
        const blockStart = block.pos + 1;
        const blockEnd = blockStart + block.node.content.size;
        if (from !== blockEnd) return false;
        const markerText = state.doc.textBetween(blockStart, from, "\n", "\n");
        if (markerText === "-") {
          const wrapBullet = pm.wrapInList(schema.nodes.bullet_list, { style: "disc" });
          if (!wrapBullet(state, null)) return false;
          view.dispatch(state.tr.delete(blockStart, from));
          wrapBullet(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
          view.focus();
          return true;
        }
        const hierarchy = markerText.match(/^\d{1,3}(?:\.\d{1,3}){1,4}\.?$/);
        if (hierarchy) {
          const parts = markerText.replace(/\.$/, "").split(".").map(part => Math.max(1, Math.min(999, Number(part) || 1)));
          const depth = clampNoteIndent(parts.length - 1);
          const order = parts[parts.length - 1] || 1;
          const wrapOrdered = pm.wrapInList(schema.nodes.ordered_list, { order, style: "decimal", depth });
          if (!wrapOrdered(state, null)) return false;
          view.dispatch(state.tr.delete(blockStart, from));
          wrapOrdered(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
          view.focus();
          return true;
        }
        const match = markerText.match(/^(\d{1,3})[.)]$/);
        if (!match) return false;
        const order = Math.max(1, Math.min(999, Number(match[1]) || 1));
        const wrapOrdered = pm.wrapInList(schema.nodes.ordered_list, { order, style: "decimal" });
        if (!wrapOrdered(state, null)) return false;
        view.dispatch(state.tr.delete(blockStart, from));
        wrapOrdered(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
        view.focus();
        return true;
      }
    }
  });
}

function placeSelectionAfterTable(view, schema, rawPos) {
  const pm = noteEditorPM();
  if (!view || !pm) return false;
  const pos = Math.max(0, Math.min(view.state.doc.content.size, Number(rawPos) || 0));
  let tr = view.state.tr;
  const nodeAfter = tr.doc.nodeAt(pos);
  if (!nodeAfter || !nodeAfter.isTextblock) tr = tr.insert(pos, schema.nodes.paragraph.create());
  tr = selectNearPosition(pm, tr, pos + 1).scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return true;
}

function noteEditorTableExitPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      decorations(state) {
        const decorations = [];
        state.doc.descendants((node, pos) => {
          if (node.type !== schema.nodes.table) return true;
          decorations.push(pm.Decoration.widget(pos + node.nodeSize, (view, getPos) => {
            const zone = document.createElement("div");
            zone.className = "note-table-exit-zone";
            zone.setAttribute("contenteditable", "false");
            zone.setAttribute("aria-hidden", "true");
            zone.addEventListener("pointerdown", event => {
              event.preventDefault();
              event.stopPropagation();
              placeSelectionAfterTable(view, schema, getPos());
            });
            return zone;
          }, { side: 1 }));
          return false;
        });
        return decorations.length ? pm.DecorationSet.create(state.doc, decorations) : null;
      }
    }
  });
}

function createNoteEditorState(schema, html) {
  const pm = noteEditorPM();
  const doc = parseNoteEditorDoc(schema, html);
  const commands = noteEditorKeymapCommands(schema);
  return pm.EditorState.create({
    doc,
    plugins: [
      pm.history({ depth: 120 }),
      noteEditorHashtagPlugin(),
      noteEditorChecklistPlugin(schema),
      noteEditorListShortcutPlugin(schema),
      noteEditorTableExitPlugin(schema),
      noteEditorPlaceholderPlugin(schema),
      pm.keymap(commands),
      pm.keymap(pm.baseKeymap)
    ]
  });
}

function noteEditorKeymapCommands(schema) {
  const pm = noteEditorPM();
  return {
    "Mod-b": pm.toggleMark(schema.marks.strong),
    "Mod-i": pm.toggleMark(schema.marks.em),
    "Mod-u": pm.toggleMark(schema.marks.underline),
    "Mod-z": pm.undo,
    "Shift-Mod-z": pm.redo,
    "Mod-y": pm.redo,
    "Enter": splitActiveListItemCommand(schema),
    "Tab": indentCommand(schema, 1),
    "Shift-Tab": indentCommand(schema, -1)
  };
}

function markIsActive(state, markType) {
  const { from, to, empty, $from } = state.selection;
  if (empty) return Boolean(markType.isInSet(state.storedMarks || $from.marks()));
  return state.doc.rangeHasMark(from, to, markType);
}

function currentTextColor(state, markType) {
  if (!markType) return NOTE_EDITOR_DEFAULT_COLOR;
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    const mark = markType.isInSet(state.storedMarks || $from.marks());
    return normalizeNoteEditorColor(mark?.attrs?.color);
  }
  let found = "";
  state.doc.nodesBetween(from, to, node => {
    if (!node.isText || found) return true;
    const mark = markType.isInSet(node.marks || []);
    if (mark) found = normalizeNoteEditorColor(mark.attrs.color);
    return !found;
  });
  return found || NOTE_EDITOR_DEFAULT_COLOR;
}

function currentTextblockWithPos(state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isTextblock) return { node, pos: $from.before(depth), depth };
  }
  return null;
}

function findParentNodeOfType(state, type) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === type) return { node, pos: $from.before(depth), depth };
  }
  return null;
}

function currentListKind(state) {
  const schema = state.schema;
  if (findParentNodeOfType(state, schema.nodes.task_list)) return "checklist";
  if (findParentNodeOfType(state, schema.nodes.bullet_list)) return "bullet";
  if (findParentNodeOfType(state, schema.nodes.ordered_list)) return "ordered";
  return "none";
}

function currentListInfo(state) {
  const schema = state.schema;
  const task = findParentNodeOfType(state, schema.nodes.task_list);
  if (task) return { kind: "checklist", node: task.node, pos: task.pos, style: "checklist", depth: 0 };
  const bullet = findParentNodeOfType(state, schema.nodes.bullet_list);
  if (bullet) return { kind: "bullet", node: bullet.node, pos: bullet.pos, style: bullet.node.attrs.style || "disc", depth: clampNoteIndent(bullet.node.attrs.depth) };
  const ordered = findParentNodeOfType(state, schema.nodes.ordered_list);
  if (ordered) return { kind: "ordered", node: ordered.node, pos: ordered.pos, style: ordered.node.attrs.style || "decimal", depth: clampNoteIndent(ordered.node.attrs.depth) };
  return { kind: "none", node: null, pos: null, style: "none", depth: 0 };
}

function activeListItemType(state) {
  const schema = state.schema;
  if (findParentNodeOfType(state, schema.nodes.task_item)) return schema.nodes.task_item;
  if (findParentNodeOfType(state, schema.nodes.list_item)) return schema.nodes.list_item;
  return null;
}

function insideTable(state) {
  return Boolean(findParentNodeOfType(state, state.schema.nodes.table));
}

function currentTableInfo(state) {
  const schema = state.schema;
  const { $from } = state.selection;
  let tableDepth = null;
  let rowDepth = null;
  let cellDepth = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.table_cell && cellDepth == null) cellDepth = depth;
    if (node.type === schema.nodes.table_row && rowDepth == null) rowDepth = depth;
    if (node.type === schema.nodes.table && tableDepth == null) tableDepth = depth;
  }
  if (tableDepth == null) return null;
  const table = $from.node(tableDepth);
  const row = rowDepth != null ? $from.node(rowDepth) : null;
  const cell = cellDepth != null ? $from.node(cellDepth) : null;
  return {
    table,
    tablePos: $from.before(tableDepth),
    row,
    rowPos: rowDepth != null ? $from.before(rowDepth) : null,
    rowIndex: rowDepth != null ? $from.index(tableDepth) : 0,
    cell,
    cellPos: cellDepth != null ? $from.before(cellDepth) : null,
    cellIndex: cellDepth != null ? $from.index(rowDepth) : 0,
    rowCount: table.childCount,
    colCount: table.firstChild?.childCount || 0
  };
}

function textLevelForBlock(node, schema) {
  if (!node) return "body";
  if (node.type === schema.nodes.heading) {
    if (Number(node.attrs.level) === 1) return "title";
    if (Number(node.attrs.level) === 2) return "heading";
    return "subheading";
  }
  if (node.type === schema.nodes.paragraph && node.attrs.size === "small") return "small";
  return "body";
}

function nextNoteTextLevel(current) {
  const index = NOTE_TEXT_LEVELS.indexOf(normalizeNoteTextLevel(current));
  return NOTE_TEXT_LEVELS[(index + 1) % NOTE_TEXT_LEVELS.length];
}

function readNoteEditorToolbarState(view) {
  if (!view) return NOTE_EDITOR_EMPTY_TOOLBAR;
  const pm = noteEditorPM();
  const state = view.state;
  const schema = state.schema;
  const textblock = currentTextblockWithPos(state);
  const listInfo = currentListInfo(state);
  const textLevel = textLevelForBlock(textblock?.node, schema);
  return {
    bold: markIsActive(state, schema.marks.strong),
    italic: markIsActive(state, schema.marks.em),
    underline: markIsActive(state, schema.marks.underline),
    heading: textLevel !== "body",
    bullet: listInfo.kind === "bullet",
    ordered: listInfo.kind === "ordered",
    checklist: listInfo.kind === "checklist",
    quote: Boolean(findParentNodeOfType(state, schema.nodes.blockquote)),
    table: insideTable(state),
    canUndo: pm.undo(state),
    canRedo: pm.redo(state),
    indentLevel: clampNoteIndent(textblock?.node.attrs.indent),
    selectionEmpty: state.selection.empty,
    color: currentTextColor(state, schema.marks.text_color),
    textLevel,
    listStyle: listInfo.style
  };
}

function selectedTextblockPositions(state) {
  const schema = state.schema;
  const blocks = [];
  const seen = new Set();
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (!node.isTextblock || (node.type !== schema.nodes.paragraph && node.type !== schema.nodes.heading)) return true;
    if (!seen.has(pos)) {
      seen.add(pos);
      blocks.push({ node, pos });
    }
    return false;
  });
  if (!blocks.length) {
    const current = currentTextblockWithPos(state);
    if (current && (current.node.type === schema.nodes.paragraph || current.node.type === schema.nodes.heading)) {
      blocks.push({ node: current.node, pos: current.pos });
    }
  }
  return blocks;
}

function updateSelectedBlockIndent(schema, delta) {
  return (state, dispatch) => {
    const blocks = selectedTextblockPositions(state);
    if (!blocks.length) return false;
    let tr = state.tr;
    let changed = false;
    blocks.forEach(({ node, pos }) => {
      const nextIndent = clampNoteIndent(Number(node.attrs.indent || 0) + delta);
      if (nextIndent === Number(node.attrs.indent || 0)) return;
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: nextIndent });
      changed = true;
    });
    if (changed && dispatch) dispatch(tr.scrollIntoView());
    return changed;
  };
}

function cycleTextLevelCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const block = currentTextblockWithPos(state);
    const indent = clampNoteIndent(block?.node.attrs.indent);
    const nextLevel = nextNoteTextLevel(textLevelForBlock(block?.node, schema));
    if (nextLevel === "title") {
      return pm.setBlockType(schema.nodes.heading, { level: 1, indent })(state, dispatch);
    }
    if (nextLevel === "heading") {
      return pm.setBlockType(schema.nodes.heading, { level: 2, indent })(state, dispatch);
    }
    if (nextLevel === "subheading") {
      return pm.setBlockType(schema.nodes.heading, { level: 3, indent })(state, dispatch);
    }
    return pm.setBlockType(schema.nodes.paragraph, { indent, size: nextLevel === "small" ? "small" : "body" })(state, dispatch);
  };
}

function splitActiveListItemCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const itemType = activeListItemType(state);
    return itemType ? pm.splitListItem(itemType)(state, dispatch) : false;
  };
}

function setListMarkup(state, dispatch, listInfo, type, attrs = {}) {
  if (!listInfo.node || listInfo.pos == null) return false;
  if (dispatch) dispatch(state.tr.setNodeMarkup(listInfo.pos, type, attrs).scrollIntoView());
  return true;
}

function cycleListCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const listInfo = currentListInfo(state);
    if (listInfo.kind === "checklist") return pm.liftListItem(schema.nodes.task_item)(state, dispatch);
    if (listInfo.kind === "bullet") {
      const index = NOTE_BULLET_STYLES.indexOf(listInfo.style);
      if (index >= 0 && index < NOTE_BULLET_STYLES.length - 1) {
        return setListMarkup(state, dispatch, listInfo, schema.nodes.bullet_list, { style: NOTE_BULLET_STYLES[index + 1], depth: listInfo.depth || 0 });
      }
      return setListMarkup(state, dispatch, listInfo, schema.nodes.ordered_list, { order: 1, style: "decimal", depth: listInfo.depth || 0 });
    }
    if (listInfo.kind === "ordered") {
      const index = NOTE_ORDERED_STYLES.indexOf(listInfo.style);
      if (index >= 0 && index < NOTE_ORDERED_STYLES.length - 1) {
        return setListMarkup(state, dispatch, listInfo, schema.nodes.ordered_list, { order: listInfo.node.attrs.order || 1, style: NOTE_ORDERED_STYLES[index + 1], depth: listInfo.depth || 0 });
      }
      return pm.liftListItem(schema.nodes.list_item)(state, dispatch);
    }
    return pm.wrapInList(schema.nodes.bullet_list, { style: "disc" })(state, dispatch);
  };
}

function taskListFromListNode(schema, listNode) {
  const items = [];
  listNode.forEach(child => {
    const content = child.content;
    items.push(schema.nodes.task_item.create({ checked: false }, content));
  });
  return schema.nodes.task_list.create(null, items);
}

function insertEmptyChecklist(schema, state, dispatch) {
  const item = schema.nodes.task_item.create({ checked: false }, schema.nodes.paragraph.create());
  const list = schema.nodes.task_list.create(null, [item]);
  if (dispatch) dispatch(state.tr.replaceSelectionWith(list).scrollIntoView());
  return true;
}

function toggleChecklistCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const listInfo = currentListInfo(state);
    if (listInfo.kind === "checklist") {
      return pm.liftListItem(schema.nodes.task_item)(state, dispatch);
    }
    if ((listInfo.kind === "bullet" || listInfo.kind === "ordered") && listInfo.node) {
      const taskList = taskListFromListNode(schema, listInfo.node);
      if (dispatch) dispatch(state.tr.replaceWith(listInfo.pos, listInfo.pos + listInfo.node.nodeSize, taskList).scrollIntoView());
      return true;
    }
    return pm.wrapInList(schema.nodes.task_list)(state, dispatch) || insertEmptyChecklist(schema, state, dispatch);
  };
}

function createEmptyTable(schema, rows = 2, cols = 2) {
  const tableRows = [];
  const safeRows = Math.max(1, Math.min(12, Number(rows) || 2));
  const safeCols = Math.max(1, Math.min(8, Number(cols) || 2));
  for (let rowIndex = 0; rowIndex < safeRows; rowIndex += 1) {
    const cells = [];
    for (let colIndex = 0; colIndex < safeCols; colIndex += 1) {
      cells.push(schema.nodes.table_cell.create(null, schema.nodes.paragraph.create()));
    }
    tableRows.push(schema.nodes.table_row.create(null, cells));
  }
  return schema.nodes.table.create(null, tableRows);
}

function createEmptyTableRow(schema, cols = 2) {
  const safeCols = Math.max(1, Math.min(8, Number(cols) || 2));
  const cells = [];
  for (let colIndex = 0; colIndex < safeCols; colIndex += 1) {
    cells.push(schema.nodes.table_cell.create(null, schema.nodes.paragraph.create()));
  }
  return schema.nodes.table_row.create(null, cells);
}

function tableCellStart(tablePos, table, rowIndex, cellIndex) {
  let rowOffset = 0;
  for (let index = 0; index < rowIndex; index += 1) rowOffset += table.child(index).nodeSize;
  const row = table.child(rowIndex);
  let cellOffset = 0;
  for (let index = 0; index < cellIndex; index += 1) cellOffset += row.child(index).nodeSize;
  return tablePos + 1 + rowOffset + 1 + cellOffset;
}

function selectNearPosition(pm, tr, pos) {
  const safePos = Math.max(0, Math.min(tr.doc.content.size, Number(pos) || 0));
  return tr.setSelection(pm.TextSelection.near(tr.doc.resolve(safePos)));
}

function findNearestTableInDoc(doc, schema, around, expectedSize) {
  let best = null;
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.table) return true;
    if (expectedSize && node.nodeSize !== expectedSize) return false;
    const score = Math.abs(pos - around);
    if (!best || score < best.score) best = { node, pos, score };
    return false;
  });
  return best;
}

function ensureParagraphAfterTableCommand(schema, pm) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info) return false;
    const tableEnd = info.tablePos + info.table.nodeSize;
    if (dispatch) {
      let tr = state.tr;
      const nodeAfter = state.doc.nodeAt(tableEnd);
      if (!nodeAfter || !nodeAfter.isTextblock) tr = tr.insert(tableEnd, schema.nodes.paragraph.create());
      tr = selectNearPosition(pm, tr, tableEnd + 1).scrollIntoView();
      dispatch(tr);
    }
    return true;
  };
}

function deleteTableCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info) return false;
    if (dispatch) {
      let tr = state.tr.replaceWith(info.tablePos, info.tablePos + info.table.nodeSize, schema.nodes.paragraph.create()).scrollIntoView();
      tr = selectNearPosition(pm, tr, info.tablePos + 1);
      dispatch(tr);
    }
    return true;
  };
}

function addTableRowCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || !info.row) return false;
    const insertPos = info.rowPos + info.row.nodeSize;
    if (dispatch) dispatch(state.tr.insert(insertPos, createEmptyTableRow(schema, info.colCount)).scrollIntoView());
    return true;
  };
}

function deleteTableRowCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || !info.row) return false;
    if (info.rowCount <= 1) return deleteTableCommand(schema)(state, dispatch);
    if (dispatch) dispatch(state.tr.delete(info.rowPos, info.rowPos + info.row.nodeSize).scrollIntoView());
    return true;
  };
}

function addTableColumnCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || info.cellIndex == null) return false;
    let tr = state.tr;
    const inserts = [];
    for (let rowIndex = 0; rowIndex < info.table.childCount; rowIndex += 1) {
      const row = info.table.child(rowIndex);
      const safeIndex = Math.min(info.cellIndex, row.childCount - 1);
      const cell = row.child(safeIndex);
      const cellPos = tableCellStart(info.tablePos, info.table, rowIndex, safeIndex);
      inserts.push({ pos: cellPos + cell.nodeSize, node: schema.nodes.table_cell.create(null, schema.nodes.paragraph.create()) });
    }
    inserts.sort((a, b) => b.pos - a.pos).forEach(insert => { tr = tr.insert(insert.pos, insert.node); });
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function deleteTableColumnCommand(schema) {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info || info.cellIndex == null) return false;
    if (info.colCount <= 1) return deleteTableCommand(schema)(state, dispatch);
    let tr = state.tr;
    const deletes = [];
    for (let rowIndex = 0; rowIndex < info.table.childCount; rowIndex += 1) {
      const row = info.table.child(rowIndex);
      const safeIndex = Math.min(info.cellIndex, row.childCount - 1);
      const cell = row.child(safeIndex);
      const cellPos = tableCellStart(info.tablePos, info.table, rowIndex, safeIndex);
      deletes.push({ from: cellPos, to: cellPos + cell.nodeSize });
    }
    deletes.sort((a, b) => b.from - a.from).forEach(range => { tr = tr.delete(range.from, range.to); });
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };
}

function toggleAutoFitTableCommand() {
  return (state, dispatch) => {
    const info = currentTableInfo(state);
    if (!info) return false;
    const nextLayout = info.table.attrs.layout === "auto" ? "fixed" : "auto";
    if (dispatch) {
      dispatch(state.tr.setNodeMarkup(info.tablePos, undefined, { ...info.table.attrs, layout: nextLayout }).scrollIntoView());
    }
    return true;
  };
}

function insertTableCommand(schema, options = {}) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const table = createEmptyTable(schema, options.rows || 2, options.cols || 2);
    if (dispatch) {
      const from = state.selection.from;
      let tr = state.tr.replaceSelectionWith(table);
      const mappedFrom = tr.mapping.map(from, -1);
      const inserted = findNearestTableInDoc(tr.doc, schema, mappedFrom, table.nodeSize);
      const tablePos = inserted?.pos ?? Math.max(0, mappedFrom - 1);
      const tableEnd = tablePos + table.nodeSize;
      const nodeAfter = tr.doc.nodeAt(tableEnd);
      if (!nodeAfter || !nodeAfter.isTextblock) tr = tr.insert(tableEnd, schema.nodes.paragraph.create());
      tr = tr.scrollIntoView();
      const focusPos = Math.min(tr.doc.content.size - 1, tablePos + 4);
      if (focusPos > 0) tr = selectNearPosition(pm, tr, focusPos);
      dispatch(tr);
    }
    return true;
  };
}

function toggleQuoteCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    if (findParentNodeOfType(state, schema.nodes.blockquote)) return pm.lift(state, dispatch);
    const list = findParentNodeOfType(state, schema.nodes.bullet_list) || findParentNodeOfType(state, schema.nodes.ordered_list);
    if (list) {
      const listSelection = pm.NodeSelection.create(state.doc, list.pos);
      const selectedState = state.apply(state.tr.setSelection(listSelection));
      return pm.wrapIn(schema.nodes.blockquote)(selectedState, dispatch);
    }
    return pm.wrapIn(schema.nodes.blockquote)(state, dispatch);
  };
}

function indentCommand(schema, delta) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    if (currentListKind(state) !== "none") {
      const itemType = activeListItemType(state);
      if (!itemType) return false;
      const command = delta > 0 ? pm.sinkListItem(itemType) : pm.liftListItem(itemType);
      if (command(state, dispatch)) return true;
      const listInfo = currentListInfo(state);
      if (!listInfo.node || listInfo.pos == null || listInfo.kind === "checklist") return false;
      const nextDepth = clampNoteIndent((listInfo.depth || 0) + delta);
      if (nextDepth === (listInfo.depth || 0)) return false;
      const attrs = listInfo.kind === "ordered"
        ? { order: listInfo.node.attrs.order || 1, style: listInfo.style || "decimal", depth: nextDepth }
        : { style: listInfo.style || "disc", depth: nextDepth };
      return setListMarkup(state, dispatch, listInfo, listInfo.node.type, attrs);
    }
    return updateSelectedBlockIndent(schema, delta)(state, dispatch);
  };
}

function setTextColorCommand(schema, color) {
  const pm = noteEditorPM();
  const safeColor = normalizeNoteEditorColor(color);
  return (state, dispatch) => {
    const markType = schema.marks.text_color;
    if (!markType) return false;
    const { from, to, empty } = state.selection;
    if (dispatch) {
      let tr = state.tr.removeMark(from, to, markType);
      if (empty) tr = tr.addStoredMark(markType.create({ color: safeColor }));
      else tr = tr.addMark(from, to, markType.create({ color: safeColor })).scrollIntoView();
      dispatch(tr);
    }
    return true;
  };
}

function clearBlockEffectsForCommand(view, schema, commandName) {
  const pm = noteEditorPM();
  if (!view || !pm || !["heading", "quote"].includes(commandName)) return;
  if (commandName === "quote" && findParentNodeOfType(view.state, schema.nodes.blockquote)) return;

  for (let index = 0; index < 5 && currentListKind(view.state) !== "none"; index += 1) {
    const itemType = activeListItemType(view.state);
    if (!itemType) break;
    const lifted = pm.liftListItem(itemType)(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
    if (!lifted) break;
  }

  if (findParentNodeOfType(view.state, schema.nodes.blockquote)) {
    pm.lift(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
  }

  if (commandName === "quote") {
    const block = currentTextblockWithPos(view.state);
    if (block?.node?.type === schema.nodes.heading) {
      pm.setBlockType(schema.nodes.paragraph, { indent: clampNoteIndent(block.node.attrs.indent), size: "body" })(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
    }
  }
}

function runNoteEditorCommand(view, commandName, options = {}) {
  const pm = noteEditorPM();
  if (!view || !pm) return false;
  const schema = view.state.schema;
  clearBlockEffectsForCommand(view, schema, commandName);
  const commands = {
    bold: pm.toggleMark(schema.marks.strong),
    italic: pm.toggleMark(schema.marks.em),
    underline: pm.toggleMark(schema.marks.underline),
    heading: cycleTextLevelCommand(schema),
    list: cycleListCommand(schema),
    checklist: toggleChecklistCommand(schema),
    table: insertTableCommand(schema, options),
    "insert-table": insertTableCommand(schema, options),
    "table-row-add": addTableRowCommand(schema),
    "table-row-delete": deleteTableRowCommand(schema),
    "table-col-add": addTableColumnCommand(schema),
    "table-col-delete": deleteTableColumnCommand(schema),
    "table-delete": deleteTableCommand(schema),
    "table-autofit": toggleAutoFitTableCommand(),
    "table-after": ensureParagraphAfterTableCommand(schema, pm),
    color: setTextColorCommand(schema, options.color || NOTE_EDITOR_DEFAULT_COLOR),
    quote: toggleQuoteCommand(schema),
    "indent-in": indentCommand(schema, 1),
    "indent-out": indentCommand(schema, -1),
    undo: pm.undo,
    redo: pm.redo
  };
  const command = commands[commandName];
  if (!command) return false;
  const handled = command(view.state, transaction => view.dispatch(transaction.scrollIntoView()), view);
  if (handled) view.focus();
  return handled;
}

function noteEditorKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round((window.innerHeight || 0) - viewport.height - (viewport.offsetTop || 0)));
}

function scrollNoteEditorSelectionIntoView(view, options = {}) {
  if (!view || typeof window === "undefined") return;
  const scrollEl = view.dom.closest(".note-editor-scroll");
  if (!scrollEl) return;
  const keyboardInset = noteEditorKeyboardInset();
  if (options.keyboardOnly && keyboardInset < 48) return;

  let coords;
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const scrollRect = scrollEl.getBoundingClientRect();
  const topLimit = Math.max(scrollRect.top + 16, viewportTop + 72);
  const bottomLimit = Math.min(scrollRect.bottom - 28, viewportBottom - (keyboardInset > 48 ? 104 : 36));
  if (bottomLimit <= topLimit) return;

  if (coords.bottom > bottomLimit) {
    scrollEl.scrollTop += coords.bottom - bottomLimit + 24;
  } else if (coords.top < topLimit) {
    scrollEl.scrollTop += coords.top - topLimit - 24;
  }
}

function ProseMirrorNoteEditor({ initialHtml, className = "", onReady, onToolbarState }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const readyRef = useRef(onReady);
  const toolbarRef = useRef(onToolbarState);

  useEffect(() => {
    readyRef.current = onReady;
    toolbarRef.current = onToolbarState;
  }, [onReady, onToolbarState]);

  useEffect(() => {
    const pm = noteEditorPM();
    const schema = createNoteEditorSchema();
    const host = hostRef.current;
    if (!pm || !schema || !host) return undefined;

    host.innerHTML = "";
    const view = new pm.EditorView(host, {
      state: createNoteEditorState(schema, initialHtml),
      handleDOMEvents: {
        focus(view) {
          window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view, { keyboardOnly: true }));
          return false;
        },
        keyup(view) {
          window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view, { keyboardOnly: true }));
          return false;
        }
      },
      dispatchTransaction(transaction) {
        const shouldScroll = transaction.docChanged || transaction.getMeta("scrollIntoView");
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
        if (shouldScroll) window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view));
      }
    });
    viewRef.current = view;

    const api = {
      getHtml() {
        return serializeNoteEditorDoc(schema, view.state.doc);
      },
      focus() {
        view.focus();
        window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view, { keyboardOnly: true }));
      },
      run(commandName, options = {}) {
        view.focus();
        view.dispatch(view.state.tr.setSelection(view.state.selection));
        const handled = runNoteEditorCommand(view, commandName, options);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
        window.requestAnimationFrame(() => scrollNoteEditorSelectionIntoView(view));
        return handled;
      },
      setHtml(html) {
        const nextState = createNoteEditorState(schema, html);
        view.updateState(nextState);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
      }
    };

    readyRef.current?.(api);
    toolbarRef.current?.(readNoteEditorToolbarState(view));

    return () => {
      readyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
      host.innerHTML = "";
    };
  }, [initialHtml]);

  return <div ref={hostRef} className={className} />;
}
