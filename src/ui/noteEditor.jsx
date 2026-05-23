const NOTE_EDITOR_EMPTY_TOOLBAR = {
  bold: false,
  italic: false,
  underline: false,
  heading: false,
  bullet: false,
  ordered: false,
  checklist: false,
  quote: false,
  canUndo: false,
  canRedo: false,
  indentLevel: 0,
  textLevel: "body"
};

let noteEditorSchemaCache = null;
const NOTE_TEXT_LEVELS = ["body", "title", "heading", "subheading", "small"];

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

function createNoteEditorSchema() {
  const pm = noteEditorPM();
  if (!pm) return null;
  if (noteEditorSchemaCache) return noteEditorSchemaCache;

  let nodes = pm.addListNodes(pm.basicSchema.spec.nodes, "paragraph block*", "block");
  const paragraphSpec = pm.basicSchema.spec.nodes.get("paragraph");
  const headingSpec = pm.basicSchema.spec.nodes.get("heading");

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

  nodes = nodes.addToEnd("task_list", {
    group: "block",
    content: "task_item+",
    parseDOM: [{ tag: "ul[data-type='task-list']" }],
    toDOM() {
      return ["ul", { "data-type": "task-list" }, 0];
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
  if (!wrapper.textContent.trim() && !wrapper.querySelector("br, ul, ol, blockquote, h1, h2, h3")) {
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

function noteEditorChecklistPlugin(schema) {
  const pm = noteEditorPM();
  return new pm.Plugin({
    props: {
      handleClick(view, pos, event) {
        const itemEl = event.target?.closest?.("li[data-type='task-item']");
        if (!itemEl || !view.dom.contains(itemEl)) return false;
        const rect = itemEl.getBoundingClientRect();
        if (event.clientX > rect.left + 30) return false;
        const itemPos = view.posAtDOM(itemEl, 0);
        const item = view.state.doc.nodeAt(itemPos);
        if (!item || item.type !== schema.nodes.task_item) return false;
        view.dispatch(view.state.tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, checked: !item.attrs.checked }).scrollIntoView());
        view.focus();
        return true;
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

function activeListItemType(state) {
  const schema = state.schema;
  if (findParentNodeOfType(state, schema.nodes.task_item)) return schema.nodes.task_item;
  if (findParentNodeOfType(state, schema.nodes.list_item)) return schema.nodes.list_item;
  return null;
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
  const listKind = currentListKind(state);
  const textLevel = textLevelForBlock(textblock?.node, schema);
  return {
    bold: markIsActive(state, schema.marks.strong),
    italic: markIsActive(state, schema.marks.em),
    underline: markIsActive(state, schema.marks.underline),
    heading: textLevel !== "body",
    bullet: listKind === "bullet",
    ordered: listKind === "ordered",
    checklist: listKind === "checklist",
    quote: Boolean(findParentNodeOfType(state, schema.nodes.blockquote)),
    canUndo: pm.undo(state),
    canRedo: pm.redo(state),
    indentLevel: clampNoteIndent(textblock?.node.attrs.indent),
    textLevel
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

function cycleListCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    const bulletList = findParentNodeOfType(state, schema.nodes.bullet_list);
    const orderedList = findParentNodeOfType(state, schema.nodes.ordered_list);
    if (findParentNodeOfType(state, schema.nodes.task_list)) return pm.liftListItem(schema.nodes.task_item)(state, dispatch);
    if (bulletList) {
      if (dispatch) dispatch(state.tr.setNodeMarkup(bulletList.pos, schema.nodes.ordered_list, { order: 1 }).scrollIntoView());
      return true;
    }
    if (orderedList) return pm.liftListItem(schema.nodes.list_item)(state, dispatch);
    return pm.wrapInList(schema.nodes.bullet_list)(state, dispatch);
  };
}

function toggleChecklistCommand(schema) {
  const pm = noteEditorPM();
  return (state, dispatch) => {
    if (findParentNodeOfType(state, schema.nodes.task_list)) {
      return pm.liftListItem(schema.nodes.task_item)(state, dispatch);
    }
    if (findParentNodeOfType(state, schema.nodes.bullet_list) || findParentNodeOfType(state, schema.nodes.ordered_list)) {
      return false;
    }
    return pm.wrapInList(schema.nodes.task_list)(state, dispatch);
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
      return command(state, dispatch);
    }
    return updateSelectedBlockIndent(schema, delta)(state, dispatch);
  };
}

function runNoteEditorCommand(view, commandName) {
  const pm = noteEditorPM();
  if (!view || !pm) return false;
  const schema = view.state.schema;
  const commands = {
    bold: pm.toggleMark(schema.marks.strong),
    italic: pm.toggleMark(schema.marks.em),
    underline: pm.toggleMark(schema.marks.underline),
    heading: cycleTextLevelCommand(schema),
    list: cycleListCommand(schema),
    checklist: toggleChecklistCommand(schema),
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
      dispatchTransaction(transaction) {
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
      }
    });
    viewRef.current = view;

    const api = {
      getHtml() {
        return serializeNoteEditorDoc(schema, view.state.doc);
      },
      focus() {
        view.focus();
      },
      run(commandName) {
        const handled = runNoteEditorCommand(view, commandName);
        toolbarRef.current?.(readNoteEditorToolbarState(view));
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
