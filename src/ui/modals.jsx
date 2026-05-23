function RichNoteModal({ modal, state, onSave, syncStatus = "saved", syncLabel = "", onSyncNow = () => {} }) {
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [toolbarState, setToolbarState] = useState({ bold: false, italic: false, underline: false, heading: false, bullet: false, ordered: false });
  const historyRef = useRef({ undo: [], redo: [], last: null });
  const isBoxNote = modal.type === "boxNote";
  const isCentralNote = modal.type === "centralNote";
  const box = isBoxNote ? getNode(state.boxNodes, modal.boxId) : null;
  const centralNote = isCentralNote ? getNote(state, modal.noteId) : null;
  const day = !isBoxNote && !isCentralNote ? state.actionDays.find(d => d.id === modal.dayId) : null;
  const actionNode = day ? getNode(day.nodes, modal.nodeId) : null;
  const entry = actionNode && modal.entryId ? entriesFor(actionNode).find(e => e.id === modal.entryId) : null;
  const initialHtml = isCentralNote ? (centralNote?.bodyHtml || "") : isBoxNote ? (box?.boxNoteHtml || "") : (entry?.bodyHtml || "");
  const initialTitle = isCentralNote ? (centralNote?.title || "") : isBoxNote ? (box?.boxNoteTitle || "") : (entry?.title || "");

  useEffect(() => {
    const html = sanitizeHtml(initialHtml);
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
      window.requestAnimationFrame(() => highlightEditableHashtags(editorRef.current));
    }
    if (titleRef.current) titleRef.current.value = initialTitle;
    historyRef.current = { undo: [], redo: [], last: { title: initialTitle, bodyHtml: html } };
    setHistoryTick(tick => tick + 1);
    setTimeout(() => (titleRef.current || editorRef.current)?.focus(), 40);
  }, [modal]);

  function noteSnapshot() {
    return {
      title: titleRef.current?.value || "",
      bodyHtml: editorRef.current?.innerHTML || ""
    };
  }

  function sameSnapshot(a, b) {
    return Boolean(a && b && a.title === b.title && a.bodyHtml === b.bodyHtml);
  }

  function rememberHistory() {
    const current = noteSnapshot();
    const history = historyRef.current;
    if (sameSnapshot(history.last, current)) return;
    if (history.last) history.undo.push(history.last);
    if (history.undo.length > 80) history.undo.shift();
    history.last = current;
    history.redo = [];
    setHistoryTick(tick => tick + 1);
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) return;
    if (titleRef.current) titleRef.current.value = snapshot.title || "";
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeHtml(snapshot.bodyHtml || "");
      window.requestAnimationFrame(() => highlightEditableHashtags(editorRef.current));
    }
    historyRef.current.last = noteSnapshot();
    setHistoryTick(tick => tick + 1);
  }

  function undoNoteEdit() {
    const history = historyRef.current;
    const previous = history.undo.pop();
    if (!previous) return;
    history.redo.push(noteSnapshot());
    restoreSnapshot(previous);
  }

  function redoNoteEdit() {
    const history = historyRef.current;
    const next = history.redo.pop();
    if (!next) return;
    history.undo.push(noteSnapshot());
    restoreSnapshot(next);
  }

  function selectionInEditor() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    return Boolean(editor && selection?.rangeCount && editor.contains(selection.anchorNode));
  }

  function focusEditorSelection() {
    const editor = editorRef.current;
    if (!editor) return false;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return false;
    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return true;
  }

  function closestInEditor(tags) {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return null;
    let node = selection.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const wanted = new Set(tags);
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && wanted.has(node.tagName)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function selectionRange() {
    const selection = window.getSelection();
    return selection?.rangeCount ? selection.getRangeAt(0) : null;
  }

  function setCaretAtEnd(node) {
    const selection = window.getSelection();
    if (!selection || !node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function currentBlock() {
    return closestInEditor(["LI", "DIV", "P", "H2", "H3", "BLOCKQUOTE"]);
  }

  function textToHtml(value) {
    const span = document.createElement("span");
    span.textContent = value || "";
    return span.innerHTML;
  }

  function visibleText(value) {
    return String(value || "").replace(/\u200B/g, "").trim();
  }

  function cloneInlineHtml(element) {
    const html = sanitizeHtml(element?.innerHTML || "");
    return html || textToHtml(element?.textContent || "");
  }

  function makePlainBlockFrom(element) {
    const div = document.createElement("div");
    div.innerHTML = cloneInlineHtml(element);
    if (!String(div.textContent || "").trim()) div.appendChild(document.createElement("br"));
    return div;
  }

  function makeHeadingFrom(element) {
    const h3 = document.createElement("h3");
    h3.innerHTML = cloneInlineHtml(element);
    if (!String(h3.textContent || "").trim()) h3.textContent = "Heading";
    return h3;
  }

  function pendingOrActiveInlineState() {
    return {
      bold: commandState("bold") || Boolean(closestInEditor(["B", "STRONG"])),
      italic: commandState("italic") || Boolean(closestInEditor(["I", "EM"])),
      underline: commandState("underline") || Boolean(closestInEditor(["U"]))
    };
  }

  function commandState(command) {
    try { return Boolean(document.queryCommandState(command)); } catch { return false; }
  }

  function inlineConfig(format) {
    if (format === "bold") return { tagName: "strong", tags: ["B", "STRONG"] };
    if (format === "italic") return { tagName: "em", tags: ["I", "EM"] };
    return { tagName: "u", tags: ["U"] };
  }

  function insertInlineTypingShell(tagName, range) {
    const wrapper = document.createElement(tagName);
    const marker = document.createTextNode("\u200B");
    wrapper.appendChild(marker);
    range.insertNode(wrapper);
    setCaretAtEnd(marker);
    return wrapper;
  }

  function placeCaretInEditableBlock(element) {
    if (!element) return;
    if (!visibleText(element.textContent)) {
      element.innerHTML = "";
      const marker = document.createTextNode("\u200B");
      element.appendChild(marker);
      setCaretAtEnd(marker);
      return;
    }
    setCaretAtEnd(element);
  }

  function moveCaretPastInline(element) {
    if (!element?.parentNode) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStartAfter(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectedRange() {
    if (!focusEditorSelection()) return null;
    const selection = window.getSelection();
    return selection?.rangeCount ? selection.getRangeAt(0) : null;
  }

  function textLines(value) {
    return String(value || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
  }

  function rangeLines(range) {
    if (!range) return [];
    const wrapper = document.createElement("div");
    wrapper.appendChild(range.cloneContents());
    return htmlLines(wrapper).length ? htmlLines(wrapper) : textLines(range.toString());
  }

  function htmlLines(node) {
    if (!node) return [];
    const html = String(node.innerHTML || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|h2|h3|blockquote)>/gi, "\n");
    const div = document.createElement("div");
    div.innerHTML = sanitizeHtml(html);
    return textLines(div.textContent || node.textContent || "");
  }

  function lineBlocks(lines) {
    const fragment = document.createDocumentFragment();
    (lines.length ? lines : [""]).forEach(line => {
      const div = document.createElement("div");
      div.textContent = line;
      fragment.appendChild(div);
    });
    return fragment;
  }

  function makeList(tagName, lines) {
    const list = document.createElement(tagName);
    (lines.length ? lines : [""]).forEach(line => {
      const li = document.createElement("li");
      li.textContent = line;
      list.appendChild(li);
    });
    return list;
  }

  function listItems(list) {
    return [...(list?.children || [])].filter(child => child.tagName === "LI");
  }

  function listLines(list) {
    return listItems(list).map(li => visibleText(htmlLines(li).join(" "))).filter(Boolean);
  }

  function makeListFromBlock(tagName, block) {
    const list = document.createElement(tagName);
    const li = document.createElement("li");
    li.innerHTML = cloneInlineHtml(block);
    if (!String(li.textContent || "").trim()) li.appendChild(document.createElement("br"));
    list.appendChild(li);
    return { list, li };
  }

  function makeEmptyListAtRange(tagName, range) {
    const list = document.createElement(tagName);
    const li = document.createElement("li");
    li.appendChild(document.createElement("br"));
    list.appendChild(li);
    range.insertNode(list);
    return { list, li };
  }

  function restoreAfterNode(node) {
    const selection = window.getSelection();
    if (!selection || !node?.parentNode) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function replaceRangeWith(nodeOrFragment) {
    const range = selectedRange();
    if (!range) return null;
    const last = nodeOrFragment.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? nodeOrFragment.lastChild : nodeOrFragment;
    range.deleteContents();
    range.insertNode(nodeOrFragment);
    if (last) restoreAfterNode(last);
    return last;
  }

  function unwrapElement(element) {
    if (!element?.parentNode) return;
    const fragment = document.createDocumentFragment();
    let last = null;
    while (element.firstChild) {
      last = element.firstChild;
      fragment.appendChild(element.firstChild);
    }
    element.replaceWith(fragment);
    restoreAfterNode(last || element.parentNode?.lastChild);
  }

  function cleanupEditorDom() {
    const editor = editorRef.current;
    if (!editor) return;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
      if (node.nodeValue?.includes("\u200B")) node.nodeValue = node.nodeValue.replace(/\u200B/g, "");
    });
    editor.querySelectorAll("b,strong,i,em,u,h2,h3,blockquote,ul,ol,li").forEach(node => {
      if (!visibleText(node.textContent) && !node.querySelector("br")) node.remove();
    });
    editor.querySelectorAll("[style]").forEach(node => node.removeAttribute("style"));
    editor.normalize();
  }

  function updateToolbarState() {
    if (!selectionInEditor()) return;
    const block = closestInEditor(["H2", "H3"]);
    const list = closestInEditor(["UL", "OL"]);
    const inline = pendingOrActiveInlineState();
    setToolbarState({
      bold: inline.bold,
      italic: inline.italic,
      underline: inline.underline,
      heading: Boolean(block),
      bullet: list?.tagName === "UL",
      ordered: list?.tagName === "OL"
    });
  }

  useEffect(() => {
    const update = () => window.requestAnimationFrame(updateToolbarState);
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  function afterFormat() {
    window.requestAnimationFrame(() => {
      cleanupEditorDom();
      if (editorRef.current) highlightEditableHashtags(editorRef.current);
      updateToolbarState();
      rememberHistory();
    });
  }

  function toggleInline(format) {
    const config = inlineConfig(format);
    if (!focusEditorSelection()) return;
    if (editorRef.current) unwrapLiveHashtagSpans(editorRef.current);
    const range = selectionRange();
    const active = closestInEditor(config.tags);
    if (!range) return;
    if (range.collapsed) {
      if (active) {
        if (!visibleText(active.textContent) && (active.textContent || "").includes("\u200B")) {
          const parent = active.parentNode;
          active.remove();
          setCaretAtEnd(parent || editorRef.current);
        } else {
          moveCaretPastInline(active);
        }
      } else {
        insertInlineTypingShell(config.tagName, range);
      }
      updateToolbarState();
      return;
    }
    if (active) {
      unwrapElement(active);
      return afterFormat();
    }
    if (!range.toString().trim()) return;
    const wrapper = document.createElement(config.tagName);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    restoreAfterNode(wrapper);
    afterFormat();
  }

  function toggleHeading() {
    if (!focusEditorSelection()) return;
    if (editorRef.current) unwrapLiveHashtagSpans(editorRef.current);
    const heading = closestInEditor(["H2", "H3"]);
    if (heading) {
      const div = makePlainBlockFrom(heading);
      heading.replaceWith(div);
      setCaretAtEnd(div);
      return afterFormat();
    }
    const range = selectionRange();
    if (!range) return;
    if (range.collapsed) {
      const block = currentBlock();
      if (block && block !== editorRef.current && block.tagName !== "LI" && block.tagName !== "BLOCKQUOTE") {
        const h3 = makeHeadingFrom(block);
        block.replaceWith(h3);
        setCaretAtEnd(h3);
      } else {
        const h3 = document.createElement("h3");
        h3.textContent = "Heading";
        range.insertNode(h3);
        setCaretAtEnd(h3);
      }
      return afterFormat();
    }
    const lines = rangeLines(range);
    const h3 = document.createElement("h3");
    h3.textContent = lines.join(" ") || "Heading";
    replaceRangeWith(h3);
    afterFormat();
  }

  function cycleListStyle() {
    if (!focusEditorSelection()) return;
    if (editorRef.current) unwrapLiveHashtagSpans(editorRef.current);
    const list = closestInEditor(["UL", "OL"]);
    if (list?.tagName === "UL") {
      const activeLi = closestInEditor(["LI"]);
      const activeIndex = Math.max(0, listItems(list).indexOf(activeLi));
      const ol = makeList("ol", listLines(list));
      list.replaceWith(ol);
      const targetLi = listItems(ol)[activeIndex] || ol;
      placeCaretInEditableBlock(targetLi);
      if (!visibleText(targetLi?.textContent) && (targetLi?.textContent || "").includes("\u200B")) {
        updateToolbarState();
        return;
      }
      return afterFormat();
    }
    if (list?.tagName === "OL") {
      const activeLi = closestInEditor(["LI"]);
      const activeIndex = Math.max(0, listItems(list).indexOf(activeLi));
      const blocks = listItems(list).map(li => {
        const div = document.createElement("div");
        div.innerHTML = cloneInlineHtml(li);
        if (!visibleText(div.textContent)) div.appendChild(document.createElement("br"));
        return div;
      });
      const fallback = document.createElement("div");
      fallback.appendChild(document.createElement("br"));
      const nextBlocks = blocks.length ? blocks : [fallback];
      list.replaceWith(...nextBlocks);
      placeCaretInEditableBlock(nextBlocks[activeIndex] || nextBlocks[nextBlocks.length - 1]);
      return afterFormat();
    }
    const range = selectionRange();
    if (!range) return;
    if (range.collapsed) {
      const block = currentBlock();
      let targetLi = null;
      if (block && block !== editorRef.current && block.tagName !== "LI") {
        const { list: ul, li } = makeListFromBlock("ul", block);
        block.replaceWith(ul);
        targetLi = li;
      } else {
        const { li } = makeEmptyListAtRange("ul", range);
        targetLi = li;
      }
      placeCaretInEditableBlock(targetLi);
      if (!visibleText(targetLi?.textContent) && (targetLi?.textContent || "").includes("\u200B")) {
        updateToolbarState();
        return;
      }
      return afterFormat();
    }
    const ul = makeList("ul", rangeLines(range));
    replaceRangeWith(ul);
    const items = listItems(ul);
    placeCaretInEditableBlock(items[items.length - 1] || ul);
    afterFormat();
  }

  function indentListItemIn() {
    const li = closestInEditor(["LI"]);
    const list = li?.parentElement;
    const previous = li?.previousElementSibling;
    if (!li || !list || previous?.tagName !== "LI") return false;
    let nested = [...previous.children].find(child => child.tagName === list.tagName);
    if (!nested) {
      nested = document.createElement(list.tagName.toLowerCase());
      previous.appendChild(nested);
    }
    nested.appendChild(li);
    setCaretAtEnd(li);
    return true;
  }

  function indentListItemOut() {
    const li = closestInEditor(["LI"]);
    const list = li?.parentElement;
    const parentLi = list?.parentElement?.tagName === "LI" ? list.parentElement : null;
    const parentList = parentLi?.parentElement;
    if (!li || !list || !parentLi || !parentList) return false;
    parentList.insertBefore(li, parentLi.nextSibling);
    if (!list.children.length) list.remove();
    setCaretAtEnd(li);
    return true;
  }

  function indentIn() {
    if (!focusEditorSelection()) return;
    if (indentListItemIn()) return afterFormat();
    const block = closestInEditor(["DIV", "P", "H2", "H3", "UL", "OL", "BLOCKQUOTE"]);
    const quote = document.createElement("blockquote");
    if (block && block !== editorRef.current) {
      block.replaceWith(quote);
      quote.appendChild(block);
      restoreAfterNode(quote);
    } else {
      const range = selectedRange();
      if (!range) return;
      quote.appendChild(lineBlocks(rangeLines(range)));
      replaceRangeWith(quote);
    }
    afterFormat();
  }

  function indentOut() {
    if (!focusEditorSelection()) return;
    if (indentListItemOut()) return afterFormat();
    const quote = closestInEditor(["BLOCKQUOTE"]);
    if (!quote) return;
    const fragment = document.createDocumentFragment();
    while (quote.firstChild) fragment.appendChild(quote.firstChild);
    const parent = quote.parentNode;
    quote.replaceWith(fragment);
    restoreAfterNode(parent?.lastChild);
    afterFormat();
  }

  function clearFormat() {
    const range = selectedRange();
    if (!range) return;
    if (editorRef.current) unwrapLiveHashtagSpans(editorRef.current);
    const block = closestInEditor(["B", "STRONG", "I", "EM", "U", "H2", "H3", "LI", "DIV", "P", "BLOCKQUOTE"]);
    const selected = rangeLines(range);
    if (selected.length && !range.collapsed) {
      const last = replaceRangeWith(lineBlocks(selected));
      restoreAfterNode(last);
    } else if (block && block !== editorRef.current) {
      const fragment = lineBlocks(htmlLines(block));
      const parent = block.parentNode;
      block.replaceWith(fragment);
      restoreAfterNode(parent?.lastChild);
    } else {
      const end = document.createTextNode("");
      editorRef.current.appendChild(end);
      const selection = window.getSelection();
      const clearRange = document.createRange();
      clearRange.setStart(end, 0);
      clearRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(clearRange);
    }
    afterFormat();
  }

  function applyFormat(format) {
    if (format === "bold" || format === "italic" || format === "underline") return toggleInline(format);
    if (format === "indent-in") return indentIn();
    if (format === "indent-out") return indentOut();
    if (format === "list") return cycleListStyle();
    if (format === "heading") return toggleHeading();
    if (format === "clear") return clearFormat();
  }

  function save() {
    cleanupEditorDom();
    const html = sanitizeHtml(editorRef.current?.innerHTML || "");
    if (isCentralNote) onSave({ noteId: modal.noteId || null, title: titleRef.current?.value || "", bodyHtml: html, noteDate: modal.noteDate || centralNote?.noteDate || todayYMD(), link: modal.link || null });
    else if (isBoxNote) onSave({ boxId: modal.boxId, title: titleRef.current?.value || "", bodyHtml: html });
    else onSave({ dayId: modal.dayId, nodeId: modal.nodeId, entryId: modal.entryId || null, title: titleRef.current?.value || "Note", bodyHtml: html });
  }

  const editorScreenStyle = {
    paddingTop: "calc(env(safe-area-inset-top, 0px) + 52px)"
  };
  const headerStyle = { paddingTop: "env(safe-area-inset-top, 0px)" };
  const editorClassName = "rich-editor min-h-[calc(100dvh-180px)] w-full bg-transparent border-none outline-none px-0 pt-3 pb-16 text-[#E0E0E0] text-[17px] leading-relaxed";
  const topButtonClassName = (active = false) => `relative h-10 w-7 shrink-0 grid place-items-center disabled:opacity-35 disabled:hover:text-[#606060] transition-colors after:absolute after:left-2 after:right-2 after:bottom-1 after:h-px after:rounded-full after:transition-opacity ${active ? "text-[#FFD2D7] after:bg-[#FFD2D7] after:opacity-100" : "text-[#A7A7A7] hover:text-white after:opacity-0"}`;
  const canUndoNote = historyTick >= 0 && historyRef.current.undo.length > 0;
  const canRedoNote = historyTick >= 0 && historyRef.current.redo.length > 0;
  const syncText = syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Local" : syncStatus === "error" ? "Error" : "Saved";
  const syncColor = syncStatus === "saved"
    ? "#FFD2D7"
    : syncStatus === "error"
      ? "#fb7185"
      : syncStatus === "saving"
        ? "#FFD2D7"
        : "#666666";
  const keepToolbarFocus = (event) => event.preventDefault();
  const toolbarButtonProps = (action) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      action();
    },
    onMouseDown: keepToolbarFocus,
    onClick: (event) => {
      if (event.detail === 0) action();
    },
    tabIndex: -1
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white animate-in fade-in duration-150 flex justify-center overflow-hidden">
      <div className="fixed left-0 right-0 top-0 z-[60] bg-[#0a0a0a]/95 border-b border-white/[0.035]" style={headerStyle}>
        <div className="mx-auto w-full max-w-md h-[52px] px-1.5 flex items-center gap-0.5">
          <button type="button" onClick={save} className="h-10 min-w-8 grid place-items-center text-[#FFD2D7] hover:text-white transition-colors text-[30px] font-light leading-none" aria-label="Back">
            &lt;
          </button>
          <div className="flex-1 min-w-0 overflow-x-auto thin-scroll flex items-center gap-0.5">
            <button type="button" {...toolbarButtonProps(() => applyFormat("heading"))} className={`${topButtonClassName(toolbarState.heading)} w-8 font-serif font-bold text-[16px] leading-none tracking-tight`} aria-label={toolbarState.heading ? "Body text" : "Heading"}>Aa</button>
            <button type="button" {...toolbarButtonProps(() => applyFormat("bold"))} className={topButtonClassName(toolbarState.bold)} aria-label="Bold"><Bold size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => applyFormat("italic"))} className={topButtonClassName(toolbarState.italic)} aria-label="Italic"><Italic size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => applyFormat("underline"))} className={topButtonClassName(toolbarState.underline)} aria-label="Underline"><Underline size={17} /></button>
            <div className="h-5 w-px bg-white/[0.08] mx-1 shrink-0" />
            <button type="button" {...toolbarButtonProps(() => applyFormat("indent-out"))} className={topButtonClassName(false)} aria-label="Outdent"><Indent size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => applyFormat("indent-in"))} className={topButtonClassName(false)} aria-label="Indent"><IndentIncrease size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => applyFormat("list"))} className={topButtonClassName(toolbarState.bullet || toolbarState.ordered)} aria-label={toolbarState.ordered ? "Turn list off" : toolbarState.bullet ? "Numbered list" : "Bullet list"}>
              <span className="text-[15px] font-extrabold leading-none">{toolbarState.ordered ? "1." : "•"}</span>
            </button>
            <button type="button" {...toolbarButtonProps(() => applyFormat("clear"))} className={`${topButtonClassName(false)} w-8 font-serif font-bold text-[15px] leading-none`} aria-label="Clear formatting">
              <span>A<span className="font-sans text-[11px] align-super">x</span></span>
            </button>
            <div className="h-5 w-px bg-white/[0.08] mx-1 shrink-0" />
            <button type="button" disabled={!canUndoNote} {...toolbarButtonProps(undoNoteEdit)} className={topButtonClassName(false)} aria-label="Undo note edit"><Undo2 size={17} /></button>
            <button type="button" disabled={!canRedoNote} {...toolbarButtonProps(redoNoteEdit)} className={topButtonClassName(false)} aria-label="Redo note edit"><Redo2 size={17} /></button>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSyncNow(); }} title={syncLabel || syncText} aria-label={syncLabel || syncText} className="h-10 min-w-8 grid place-items-center transition-transform hover:scale-110 active:scale-95" style={{ color: syncColor }}>
            {syncStatus === "saving" ? <MoreHorizontal size={20} className="animate-pulse" /> : <Check size={20} />}
          </button>
        </div>
      </div>
      <div className="w-full max-w-md h-[100dvh] bg-[#0a0a0a] flex flex-col" style={editorScreenStyle}>
        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <input ref={titleRef} type="text" placeholder="Title" defaultValue={initialTitle} onInput={rememberHistory} className="w-full bg-transparent border-none outline-none px-0 pt-2 pb-1 text-white text-[24px] font-extrabold leading-tight placeholder:text-[#555555] tracking-normal" />
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck="true"
            data-placeholder="Write your note here..."
            onInput={(e) => {
              if (!e.nativeEvent?.isComposing) highlightEditableHashtags(e.currentTarget);
              rememberHistory();
            }}
            onCompositionEnd={(e) => {
              highlightEditableHashtags(e.currentTarget);
              rememberHistory();
            }}
            className={editorClassName}
          />
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm px-5 animate-in fade-in duration-150" onClick={onCancel}>
      <div className="w-full max-w-[320px] bg-[#1A1A1A] border border-[#323232] rounded-[18px] p-5 shadow-2xl animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <h3 className="text-white text-[18px] font-extrabold leading-tight">{dialog.title || "Are you sure?"}</h3>
        {dialog.body ? <p className="mt-2 text-[#A7A7A7] text-[13px] leading-relaxed">{dialog.body}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onCancel} className="px-4 py-3 rounded-[12px] bg-[#2D2D2D] text-white text-[13px] font-extrabold hover:bg-[#3E3E3E] transition-colors">Cancel</button>
          <button type="button" onClick={onConfirm} className={`px-4 py-3 rounded-[12px] text-[13px] font-extrabold transition-colors ${dialog.danger ? "bg-red-400 text-black hover:bg-red-300" : "bg-[#FFD2D7] text-black hover:bg-[#ffe1e5]"}`}>
            {dialog.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPreviewModal({ modal, onClose, onImport }) {
  const summary = modal.summary || {};
  const rows = [
    ["Boxes", summary.boxes || 0],
    ["Action days", summary.actionDays || 0],
    ["Actions", summary.actionEntries || 0],
    ["Action notes", summary.actionNotes || 0],
    ["Notes", summary.notes || 0],
    ["Note links", summary.noteLinks || 0]
  ];
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 backdrop-blur-sm px-5 animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-[340px] bg-[#1A1A1A] border border-[#323232] rounded-[20px] p-5 shadow-2xl animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-white text-[18px] font-extrabold leading-tight">Import preview</h3>
            <p className="mt-1 text-[#A7A7A7] text-[12px] leading-relaxed truncate max-w-[240px]">{modal.fileName || "backup.json"}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {rows.map(([label, value]) => (
            <div key={label} className="bg-[#111111] border border-[#2D2D2D] rounded-[12px] px-3 py-2.5">
              <div className="text-[#A7A7A7] text-[11px] font-bold">{label}</div>
              <div className="text-white text-[18px] font-extrabold">{value}</div>
            </div>
          ))}
        </div>
        <p className="text-[#A7A7A7] text-[12px] leading-relaxed mb-4">
          {modal.legacy ? "Legacy backup detected. It will be normalized before import." : `Backup v${modal.backupVersion || BACKUP_VERSION} detected.`}
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => onImport("merge")} className="px-4 py-3 rounded-[12px] bg-[#2D2D2D] text-white text-[13px] font-extrabold hover:bg-[#3E3E3E] transition-colors">Merge</button>
          <button type="button" onClick={() => onImport("replace")} className="px-4 py-3 rounded-[12px] bg-[#FFD2D7] text-black text-[13px] font-extrabold hover:bg-[#ffe1e5] transition-colors">Replace</button>
        </div>
      </div>
    </div>
  );
}

function DebugPanel({ info, onClose }) {
  const rows = [
    ["Build", info.buildId],
    ["Cache", info.cacheName],
    ["Route", info.route],
    ["User", info.user],
    ["Online", info.online ? "yes" : "no"],
    ["Standalone", info.standalone ? "yes" : "no"],
    ["Service worker", info.serviceWorker],
    ["Sync", `${info.syncStatus} - ${info.syncLabel}`],
    ["Pending sync", info.pendingSync ? "yes" : "no"],
    ["Local updated", info.localUpdatedAt || "n/a"],
    ["Cloud updated", info.cloudUpdatedAt || "n/a"],
    ["Last synced", info.lastSyncedAt || "n/a"],
    ["Snapshot", `${info.snapshotKb} KB`],
    ["Boxes", String(info.counts.boxes)],
    ["Action days", String(info.counts.actionDays)],
    ["Entries", String(info.counts.entries)],
    ["Notes", String(info.counts.notes)],
    ["Note links", String(info.counts.noteLinks)]
  ];
  function exportDebug() {
    const blob = new Blob([JSON.stringify(info, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liems-planner-debug-${todayYMD()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 backdrop-blur-sm px-5 animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-[380px] max-h-[82dvh] overflow-auto thin-scroll bg-[#1A1A1A] border border-[#323232] rounded-[20px] p-5 shadow-2xl animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-white text-[18px] font-extrabold leading-tight">Debug</h3>
            <p className="mt-1 text-[#A7A7A7] text-[12px] leading-relaxed">Local, sync, and PWA status.</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[108px_1fr] gap-3 bg-[#111111] border border-[#2D2D2D] rounded-[10px] px-3 py-2">
              <div className="text-[#A7A7A7] text-[11px] font-bold">{label}</div>
              <div className="text-white text-[12px] font-bold break-words">{value}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={exportDebug} className="mt-4 w-full px-4 py-3 rounded-[12px] bg-[#FFD2D7] text-black text-[13px] font-extrabold hover:bg-[#ffe1e5] transition-colors">Export debug JSON</button>
      </div>
    </div>
  );
}

function ActionLinesModal({ modal, onClose, onSave }) {
  const textareaRef = useRef(null);
  useEffect(() => { setTimeout(() => textareaRef.current?.focus(), 40); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#1A1A1A] border border-[#323232] rounded-[24px] w-full max-w-[340px] p-5 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-[18px] text-white">Add actions</h3>
          <button type="button" onClick={onClose} className="text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full"><X size={18} /></button>
        </div>
        <textarea ref={textareaRef} placeholder="Type each action on a new line..." rows={8} className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-4 text-[#E0E0E0] text-[14px] leading-relaxed outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors resize-none mb-6" />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-[#2D2D2D] hover:bg-[#3E3E3E] text-white font-bold py-3.5 rounded-[12px] transition-colors">Cancel</button>
          <button type="button" onClick={() => onSave(modal.dayId, modal.nodeId, textareaRef.current?.value || "")} className="flex-1 bg-[#FFD2D7] hover:scale-[1.02] active:scale-95 text-black font-bold py-3.5 rounded-[12px] transition-transform">Done</button>
        </div>
      </div>
    </div>
  );
}
