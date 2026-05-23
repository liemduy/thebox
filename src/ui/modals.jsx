function RichNoteModal({ modal, state, onSave, syncStatus = "saved", syncLabel = "", onSyncNow = () => {} }) {
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const [historyTick, setHistoryTick] = useState(0);
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

  function editorRange() {
    const editor = editorRef.current;
    if (!editor) return null;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return null;
    if (!selection.rangeCount || !editor.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? { editor, selection, range } : null;
  }

  function selectInserted(selection, node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function replaceSelectionWith(node) {
    const context = editorRange();
    if (!context) return;
    const { editor, selection, range } = context;
    range.deleteContents();
    range.insertNode(node);
    editor.normalize();
    selectInserted(selection, node);
  }

  function wrapInline(tagName) {
    const context = editorRange();
    if (!context) return;
    const { editor, selection, range } = context;
    const el = document.createElement(tagName);
    if (range.collapsed) {
      el.appendChild(document.createTextNode("text"));
      range.insertNode(el);
    } else {
      try {
        range.surroundContents(el);
      } catch {
        el.appendChild(range.extractContents());
        range.insertNode(el);
      }
    }
    editor.normalize();
    selectInserted(selection, el);
  }

  function wrapBlock(tagName) {
    const context = editorRange();
    if (!context) return;
    const { range } = context;
    const el = document.createElement(tagName);
    if (range.collapsed) el.textContent = tagName === "h3" ? "Heading" : "Quote";
    else el.appendChild(range.extractContents());
    replaceSelectionWith(el);
  }

  function insertList() {
    const context = editorRange();
    if (!context) return;
    const text = context.range.toString().trim();
    const lines = (text ? text.split(/\n+/) : ["List item"]).map(line => cleanTitle(line || "List item"));
    const ul = document.createElement("ul");
    lines.forEach(line => {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    });
    replaceSelectionWith(ul);
  }

  function applyFormat(format) {
    if (format === "bold") wrapInline("strong");
    if (format === "italic") wrapInline("em");
    if (format === "underline") wrapInline("u");
    if (format === "indent") wrapBlock("blockquote");
    if (format === "list") insertList();
    if (format === "heading") wrapBlock("h3");
    window.requestAnimationFrame(rememberHistory);
  }

  function save() {
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
  const topButtonClassName = "h-10 w-8 shrink-0 grid place-items-center text-[#A7A7A7] hover:text-[#FFD2D7] disabled:opacity-35 disabled:hover:text-[#A7A7A7] transition-colors";
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

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white animate-in fade-in duration-150 flex justify-center overflow-hidden">
      <div className="fixed left-0 right-0 top-0 z-[60] bg-[#0a0a0a]/95 border-b border-white/[0.04]" style={headerStyle}>
        <div className="mx-auto w-full max-w-md h-[52px] px-2 flex items-center gap-1">
          <button type="button" onClick={save} className="h-10 min-w-[38px] grid place-items-center text-[#FFD2D7] hover:text-white transition-colors text-[30px] font-light leading-none" aria-label="Back">
            &lt;
          </button>
          <div className="flex-1 min-w-0 overflow-x-auto thin-scroll flex items-center gap-1">
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat("heading")} className="h-10 w-9 shrink-0 text-[#A7A7A7] hover:text-[#FFD2D7] transition-colors font-serif font-bold text-[16px] leading-none tracking-tight" aria-label="Heading">Aa</button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat("bold")} className={topButtonClassName} aria-label="Bold"><Bold size={17} /></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat("italic")} className={topButtonClassName} aria-label="Italic"><Italic size={17} /></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat("underline")} className={topButtonClassName} aria-label="Underline"><Underline size={17} /></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat("indent")} className={topButtonClassName} aria-label="Quote"><Indent size={17} /></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat("list")} className={topButtonClassName} aria-label="List"><List size={17} /></button>
            <div className="h-5 w-px bg-[#333333] mx-1 shrink-0" />
            <button type="button" disabled={!canUndoNote} onMouseDown={e => e.preventDefault()} onClick={undoNoteEdit} className={topButtonClassName} aria-label="Undo note edit"><Undo2 size={17} /></button>
            <button type="button" disabled={!canRedoNote} onMouseDown={e => e.preventDefault()} onClick={redoNoteEdit} className={topButtonClassName} aria-label="Redo note edit"><Redo2 size={17} /></button>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSyncNow(); }} title={syncLabel || syncText} aria-label={syncLabel || syncText} className="h-10 min-w-[38px] grid place-items-center transition-transform hover:scale-110 active:scale-95" style={{ color: syncColor }}>
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
