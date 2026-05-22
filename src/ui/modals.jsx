function RichNoteModal({ modal, state, onClose, onSave, onDelete, onConfirmDelete }) {
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const [toolbarFrame, setToolbarFrame] = useState({ bottom: 0, keyboardOpen: false, mobile: false });
  const isBoxNote = modal.type === "boxNote";
  const isCentralNote = modal.type === "centralNote";
  const box = isBoxNote ? getNode(state.boxNodes, modal.boxId) : null;
  const centralNote = isCentralNote ? getNote(state, modal.noteId) : null;
  const day = !isBoxNote && !isCentralNote ? state.actionDays.find(d => d.id === modal.dayId) : null;
  const actionNode = day ? getNode(day.nodes, modal.nodeId) : null;
  const entry = actionNode && modal.entryId ? entriesFor(actionNode).find(e => e.id === modal.entryId) : null;
  const initialHtml = isCentralNote ? (centralNote?.bodyHtml || "") : isBoxNote ? (box?.boxNoteHtml || "") : (entry?.bodyHtml || "");
  const initialTitle = isCentralNote ? (centralNote?.title || "") : isBoxNote ? (box?.boxNoteTitle || "") : (entry?.title || "");
  const canDelete = Boolean(onDelete && (isCentralNote ? centralNote : isBoxNote ? boxHasNote(box) : entry));

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeHtml(initialHtml);
      window.requestAnimationFrame(() => highlightEditableHashtags(editorRef.current));
    }
    if (titleRef.current) titleRef.current.value = initialTitle;
    setTimeout(() => (titleRef.current || editorRef.current)?.focus(), 40);
  }, [modal]);

  useEffect(() => {
    let frameId = 0;
    const isMobileViewport = () => {
      const narrow = window.matchMedia?.("(max-width: 640px)")?.matches;
      const coarse = window.matchMedia?.("(pointer: coarse)")?.matches && window.innerWidth <= 768;
      return Boolean(narrow || coarse);
    };
    const updateToolbarFrame = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const mobile = isMobileViewport();
        const layoutHeight = Math.max(window.innerHeight, document.documentElement?.clientHeight || 0);
        const viewportHeight = viewport?.height || window.innerHeight;
        const viewportOffsetTop = viewport?.offsetTop || 0;
        const keyboardInset = Math.max(0, layoutHeight - viewportHeight - viewportOffsetTop);
        const keyboardOpen = mobile && keyboardInset > 80;
        const next = {
          bottom: keyboardOpen ? Math.round(keyboardInset) : 0,
          keyboardOpen,
          mobile
        };
        setToolbarFrame(prev => (
          prev.bottom === next.bottom &&
          prev.keyboardOpen === next.keyboardOpen &&
          prev.mobile === next.mobile
        ) ? prev : next);
      });
    };
    const viewport = window.visualViewport;
    updateToolbarFrame();
    const timers = [
      window.setTimeout(updateToolbarFrame, 120),
      window.setTimeout(updateToolbarFrame, 420)
    ];
    viewport?.addEventListener("resize", updateToolbarFrame);
    viewport?.addEventListener("scroll", updateToolbarFrame);
    window.addEventListener("resize", updateToolbarFrame);
    window.addEventListener("orientationchange", updateToolbarFrame);
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      window.cancelAnimationFrame(frameId);
      viewport?.removeEventListener("resize", updateToolbarFrame);
      viewport?.removeEventListener("scroll", updateToolbarFrame);
      window.removeEventListener("resize", updateToolbarFrame);
      window.removeEventListener("orientationchange", updateToolbarFrame);
    };
  }, [modal]);

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
    if (format === "bold") return wrapInline("strong");
    if (format === "italic") return wrapInline("em");
    if (format === "underline") return wrapInline("u");
    if (format === "indent") return wrapBlock("blockquote");
    if (format === "list") return insertList();
    if (format === "heading") return wrapBlock("h3");
  }

  function save() {
    const html = sanitizeHtml(editorRef.current?.innerHTML || "");
    if (isCentralNote) onSave({ noteId: modal.noteId || null, title: titleRef.current?.value || "", bodyHtml: html, noteDate: modal.noteDate || centralNote?.noteDate || todayYMD(), link: modal.link || null });
    else if (isBoxNote) onSave({ boxId: modal.boxId, title: titleRef.current?.value || "", bodyHtml: html });
    else onSave({ dayId: modal.dayId, nodeId: modal.nodeId, entryId: modal.entryId || null, title: titleRef.current?.value || "Note", bodyHtml: html });
  }

  function deleteNote() {
    if (!canDelete) return;
    const runDelete = () => {
      if (isCentralNote) onDelete({ noteId: modal.noteId });
      else if (isBoxNote) onDelete({ boxId: modal.boxId });
      else onDelete({ dayId: modal.dayId, nodeId: modal.nodeId, entryId: modal.entryId });
    };
    if (onConfirmDelete) {
      onConfirmDelete(runDelete);
      return;
    }
    runDelete();
  }

  const mobileToolbarRoom = toolbarFrame.keyboardOpen ? toolbarFrame.bottom + 66 : 92;
  const modalShellStyle = toolbarFrame.mobile
    ? {
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
        paddingBottom: toolbarFrame.keyboardOpen ? `${mobileToolbarRoom}px` : "calc(92px + env(safe-area-inset-bottom, 0px))"
      }
    : undefined;
  const modalShellClassName = toolbarFrame.mobile
    ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    : "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 pb-28 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200";
  const modalCardClassName = toolbarFrame.mobile
    ? "bg-[#1A1A1A] border border-[#323232] rounded-[20px] w-full max-w-[380px] p-4 shadow-2xl animate-in zoom-in-95 duration-200 relative z-10 max-h-[calc(100dvh-150px)] overflow-auto thin-scroll"
    : "bg-[#1A1A1A] border border-[#323232] rounded-[24px] w-full max-w-[340px] p-5 shadow-2xl animate-in zoom-in-95 duration-200 relative z-10";
  const editorClassName = toolbarFrame.mobile
    ? "rich-editor min-h-[185px] max-h-[40dvh] overflow-auto thin-scroll w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-[#E0E0E0] text-[14px] leading-relaxed outline-none focus:border-[#FFD2D7] transition-colors mb-4"
    : "rich-editor min-h-[150px] max-h-[260px] overflow-auto thin-scroll w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-[#E0E0E0] text-[14px] leading-relaxed outline-none focus:border-[#FFD2D7] transition-colors mb-5";
  const toolbarClassName = toolbarFrame.mobile
    ? `fixed left-0 right-0 w-full max-w-none translate-x-0 bg-[#232323] border-t border-[#3E3E3E] border-x-0 border-b-0 rounded-none px-5 ${toolbarFrame.keyboardOpen ? "py-3" : "pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"} flex items-center justify-between shadow-[0_-12px_30px_rgba(0,0,0,0.32)] z-50`
    : "fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[340px] bg-[#232323] border border-[#3E3E3E] rounded-[14px] px-5 py-3.5 flex items-center justify-between shadow-2xl z-50";
  const toolbarStyle = toolbarFrame.mobile ? { bottom: `${toolbarFrame.bottom}px` } : undefined;

  return (
    <div className={modalShellClassName} style={modalShellStyle} onClick={onClose}>
      <div className={modalCardClassName} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-[18px] text-white">{isCentralNote ? modal.noteId ? "Edit note" : "New note" : isBoxNote ? "Box notes" : modal.entryId ? "Edit note" : "Add note"}</h3>
          <div className="flex items-center gap-2">
            {canDelete && (
              <button type="button" onClick={deleteNote} className="text-[#666] hover:text-red-300 transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full" aria-label="Delete note"><Trash2 size={18} /></button>
            )}
            <button type="button" onClick={onClose} className="text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full" aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <input ref={titleRef} type="text" placeholder="Note title" defaultValue={initialTitle} className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white text-[15px] font-bold outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors mb-3" />
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck="true"
          data-placeholder="Write your note here..."
          onInput={(e) => {
            if (!e.nativeEvent?.isComposing) highlightEditableHashtags(e.currentTarget);
          }}
          onCompositionEnd={(e) => highlightEditableHashtags(e.currentTarget)}
          className={editorClassName}
        />
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 bg-[#2D2D2D] hover:bg-[#3E3E3E] text-white font-bold py-3.5 rounded-[12px] transition-colors">Cancel</button>
          <button type="button" onClick={save} className="flex-1 bg-[#FFD2D7] hover:scale-[1.02] active:scale-95 text-black font-bold py-3.5 rounded-[12px] transition-transform">Done</button>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()} onMouseDown={e => e.preventDefault()} className={toolbarClassName} style={toolbarStyle}>
        <div className="flex gap-4 text-[#A7A7A7]">
          <button type="button" onClick={() => applyFormat("bold")} className="hover:text-[#FFD2D7] transition-colors"><Bold size={18} /></button>
          <button type="button" onClick={() => applyFormat("italic")} className="hover:text-[#FFD2D7] transition-colors"><Italic size={18} /></button>
          <button type="button" onClick={() => applyFormat("underline")} className="hover:text-[#FFD2D7] transition-colors"><Underline size={18} /></button>
          <button type="button" onClick={() => applyFormat("indent")} className="hover:text-[#FFD2D7] transition-colors"><Indent size={18} /></button>
          <button type="button" onClick={() => applyFormat("list")} className="hover:text-[#FFD2D7] transition-colors"><List size={18} /></button>
        </div>
        <button type="button" onClick={() => applyFormat("heading")} className="text-[#A7A7A7] hover:text-[#FFD2D7] transition-colors font-serif font-bold text-[16px] leading-none tracking-tight">Aa</button>
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
