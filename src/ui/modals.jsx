function NoteTableGlyph({ active = false, menuHint = false }) {
  return (
    <span className={`note-table-glyph ${active ? "is-active" : ""}`}>
      <span className="note-table-glyph-grid" aria-hidden="true" />
      {menuHint ? (
        <span className="note-table-menu-hint" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      ) : null}
    </span>
  );
}

function NoteColorGlyph({ color = "#ffd2d7", active = false }) {
  const safeColor = safeNoteColor(color) || NOTE_EDITOR_DEFAULT_COLOR;
  return (
    <span className={`note-color-glyph ${active ? "is-active" : ""}`} aria-hidden="true">
      <span className="note-color-glyph-fill" style={{ background: safeColor }} />
    </span>
  );
}

function readVisualViewportMetrics() {
  if (typeof window === "undefined") return { keyboardInset: 0, visualHeight: 0, visualTop: 0 };
  const viewport = window.visualViewport;
  const layoutHeight = window.innerHeight || 0;
  const visualHeight = Math.round(viewport?.height || layoutHeight || 0);
  const visualTop = Math.round(viewport?.offsetTop || 0);
  const keyboardInset = Math.max(0, Math.round(layoutHeight - visualHeight - visualTop));
  return { keyboardInset, visualHeight, visualTop };
}

function useVisualViewportMetrics() {
  const [metrics, setMetrics] = useState(readVisualViewportMetrics);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setMetrics(readVisualViewportMetrics()));
    };
    const viewport = window.visualViewport;
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return metrics;
}

function RichNoteModal({ modal, state, onSave, syncStatus = "saved", syncLabel = "", onSyncNow = () => {} }) {
  const titleRef = useRef(null);
  const editorApiRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const draftDirtyRef = useRef(false);
  const draftCentralNoteIdRef = useRef(null);
  const draftActionEntryIdRef = useRef(null);
  const draftActionTargetRef = useRef("");
  const [toolbarState, setToolbarState] = useState(NOTE_EDITOR_EMPTY_TOOLBAR);
  const [colorPanel, setColorPanel] = useState(false);
  const [draftColor, setDraftColor] = useState(NOTE_EDITOR_DEFAULT_COLOR);
  const viewportMetrics = useVisualViewportMetrics();
  const isBoxNote = modal.type === "boxNote";
  const isCentralNote = modal.type === "centralNote";
  const isActionNote = modal.type === "actionNote";
  const box = isBoxNote ? getNode(state.boxNodes, modal.boxId) : null;
  const centralNote = isCentralNote ? getNote(state, modal.noteId) : null;
  const day = !isBoxNote && !isCentralNote ? state.actionDays.find(d => d.id === modal.dayId) : null;
  const actionNode = day ? getNode(day.nodes, modal.nodeId) : null;
  const entry = actionNode && modal.entryId ? entriesFor(actionNode).find(e => e.id === modal.entryId) : null;
  const initialHtml = isCentralNote ? (centralNote?.bodyHtml || "") : isBoxNote ? (box?.boxNoteHtml || "") : (entry?.bodyHtml || "");
  const initialTitle = isCentralNote ? (centralNote?.title || "") : isBoxNote ? (box?.boxNoteTitle || "") : (entry?.title || "");
  const draftActionTarget = isActionNote ? `${modal.dayId || ""}-${modal.nodeId || ""}` : "";
  if (isActionNote && !modal.entryId && (draftActionTargetRef.current !== draftActionTarget || !draftActionEntryIdRef.current)) {
    draftActionTargetRef.current = draftActionTarget;
    draftActionEntryIdRef.current = uid("entry");
  } else if (!isActionNote) {
    draftActionTargetRef.current = "";
    draftActionEntryIdRef.current = null;
  }
  const actionEntryKey = isActionNote ? (modal.entryId || draftActionEntryIdRef.current || "new") : (modal.entryId || "new");
  const editorKey = `${modal.type}-${modal.noteId || modal.boxId || ""}-${modal.dayId || ""}-${modal.nodeId || ""}-${actionEntryKey}`;

  useEffect(() => {
    draftCentralNoteIdRef.current = isCentralNote ? (modal.noteId || uid("note")) : null;
    draftDirtyRef.current = false;
    clearTimeout(autosaveTimerRef.current);
    setToolbarState(NOTE_EDITOR_EMPTY_TOOLBAR);
    setTablePanel(null);
    setColorPanel(false);
    setDraftColor(NOTE_EDITOR_DEFAULT_COLOR);
    window.setTimeout(() => titleRef.current?.focus(), 40);
  }, [editorKey]);

  useEffect(() => {
    if (!colorPanel) setDraftColor(toolbarState.color || NOTE_EDITOR_DEFAULT_COLOR);
  }, [toolbarState.color, colorPanel]);

  function draftPayload(options = {}) {
    const html = sanitizeHtml(editorApiRef.current?.getHtml() || "");
    const title = titleRef.current?.value || "";
    const keepOpen = Boolean(options.keepOpen);
    if (isCentralNote) return { noteId: modal.noteId || draftCentralNoteIdRef.current || null, title, bodyHtml: html, noteDate: modal.noteDate || centralNote?.noteDate || todayYMD(), link: modal.link || null, keepOpen };
    if (isBoxNote) return { boxId: modal.boxId, title, bodyHtml: html, keepOpen };
    return { dayId: modal.dayId, nodeId: modal.nodeId, entryId: modal.entryId || draftActionEntryIdRef.current || null, title: title || "Note", bodyHtml: html, keepOpen };
  }

  function draftHasContent(payload) {
    return Boolean(cleanOptionalTitle(payload?.title || "") || htmlToText(payload?.bodyHtml || ""));
  }

  function persistDraft(options = {}) {
    const payload = draftPayload(options);
    const existingTarget = Boolean(modal.noteId || modal.entryId || isBoxNote);
    if (options.keepOpen && !existingTarget && !draftHasContent(payload)) return false;
    onSave(payload);
    draftDirtyRef.current = false;
    return true;
  }

  function save() {
    clearTimeout(autosaveTimerRef.current);
    persistDraft({ keepOpen: false });
  }

  function scheduleDraftAutosave() {
    draftDirtyRef.current = true;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => persistDraft({ keepOpen: true }), 1400);
  }

  function saveDraftInPlace() {
    clearTimeout(autosaveTimerRef.current);
    persistDraft({ keepOpen: true });
  }

  useEffect(() => {
    const flushDraft = () => {
      if (draftDirtyRef.current) saveDraftInPlace();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };
    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("beforeunload", flushDraft);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(autosaveTimerRef.current);
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("beforeunload", flushDraft);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [editorKey]);

  function runEditorCommand(command, options = {}) {
    const api = editorApiRef.current;
    if (!api) {
      console.warn("Note editor is not ready", command);
      return false;
    }
    return Boolean(api.run(command, options));
  }

  function runEditorCommandAfterFocus(command, options = {}) {
    window.setTimeout(() => {
      try {
        editorApiRef.current?.focus();
        runEditorCommand(command, options);
      } catch (error) {
        console.warn("Could not run note editor command", command, error);
      }
    }, 40);
  }

  const {
    tablePanel,
    setTablePanel,
    tableRows,
    tableCols,
    setTableRows,
    setTableCols,
    openTablePanel,
    updateTableDimension,
    settleTableDimension,
    insertCustomTable,
    submitCustomTable,
    runTableCommand,
    tablePanelButtonProps
  } = useNoteTablePanel(toolbarState, runEditorCommandAfterFocus);

  const editorViewportStyle = {
    "--note-keyboard-inset": `${viewportMetrics.keyboardInset}px`,
    "--note-visual-height": `${viewportMetrics.visualHeight || 0}px`,
    "--note-visual-top": `${viewportMetrics.visualTop || 0}px`,
    "--note-header-safe-top": "max(env(safe-area-inset-top, 0px), 12px)"
  };
  const editorScreenStyle = {
    paddingTop: "calc(var(--note-visual-top, 0px) + var(--note-header-safe-top, env(safe-area-inset-top, 0px)) + 52px)"
  };
  const headerStyle = {
    top: "var(--note-visual-top, 0px)",
    paddingTop: "var(--note-header-safe-top, env(safe-area-inset-top, 0px))"
  };
  const editorScrollStyle = {
    paddingBottom: "calc(var(--note-keyboard-inset, 0px) + 8.5rem + env(safe-area-inset-bottom, 0px))",
    scrollPaddingBottom: "calc(var(--note-keyboard-inset, 0px) + 9rem + env(safe-area-inset-bottom, 0px))"
  };
  const editorClassName = "rich-editor min-h-[calc(100dvh-180px)] w-full bg-transparent border-none outline-none px-0 pt-3 pb-28 text-[#E0E0E0] text-[17px] leading-relaxed";
  const topButtonClassName = (active = false) => `relative h-10 w-7 shrink-0 grid place-items-center disabled:opacity-35 disabled:hover:text-[#606060] transition-colors after:absolute after:left-2 after:right-2 after:bottom-1 after:h-px after:rounded-full after:transition-opacity ${active ? "text-[#FFD2D7] after:bg-[#FFD2D7] after:opacity-100" : "text-[#A7A7A7] hover:text-white after:opacity-0"}`;
  const syncText = syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Local" : syncStatus === "error" ? "Error" : "Saved";
  const syncColor = syncStatus === "saved"
    ? "#FFD2D7"
    : syncStatus === "error"
      ? "#fb7185"
      : syncStatus === "saving"
        ? "#FFD2D7"
        : "#666666";
  const textLevelLabels = { body: "Body", title: "Title", heading: "Heading", subheading: "Subheading", small: "Small" };
  const textLevelLabel = textLevelLabels[toolbarState.textLevel] || "Body";
  const listStyleLabels = {
    none: "Bullet list",
    disc: "Disc bullets",
    circle: "Circle bullets",
    square: "Square bullets",
    decimal: "Numbered list",
    "lower-alpha": "Lettered list",
    "lower-roman": "Roman list",
    checklist: "Checklist"
  };
  const listButtonText = toolbarState.ordered
    ? ({ decimal: "1.", "lower-alpha": "a.", "lower-roman": "i." }[toolbarState.listStyle] || "1.")
    : ({ disc: "\u2022", circle: "\u25e6", square: "\u25aa" }[toolbarState.listStyle] || "\u2022");
  const listLabel = listStyleLabels[toolbarState.listStyle] || "Bullet list";
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
  const colorButtonColor = safeNoteColor(draftColor) || toolbarState.color || NOTE_EDITOR_DEFAULT_COLOR;
  const tablePanelStyle = { top: "calc(var(--note-visual-top, 0px) + var(--note-header-safe-top, env(safe-area-inset-top, 0px)) + 54px)" };
  const colorPanelStyle = tablePanelStyle;

  function applyDraftColor() {
    const color = safeNoteColor(draftColor) || NOTE_EDITOR_DEFAULT_COLOR;
    setDraftColor(color);
    runEditorCommand("color", { color });
    setColorPanel(false);
  }

  function handleColorButton() {
    setTablePanel(null);
    if (toolbarState.selectionEmpty === false) {
      runEditorCommand("color", { color: colorButtonColor });
      return;
    }
    setColorPanel(prev => {
      const next = !prev;
      if (next) editorApiRef.current?.blur?.();
      return next;
    });
  }

  function openTablePanelFromToolbar() {
    setColorPanel(false);
    editorApiRef.current?.blur?.();
    openTablePanel();
  }

  return (
    <div className={`fixed inset-0 z-50 bg-[#0a0a0a] text-white animate-in fade-in duration-150 flex justify-center overflow-hidden ${colorPanel || tablePanel ? "is-format-panel-open" : ""}`} style={editorViewportStyle}>
      <div className="fixed left-0 right-0 top-0 z-[60] bg-[#0a0a0a]/95 border-b border-white/[0.035]" style={headerStyle}>
        <div className="mx-auto w-full max-w-md h-[52px] px-1.5 flex items-center gap-0.5">
          <button type="button" onClick={save} className="h-10 min-w-8 grid place-items-center text-[#FFD2D7] hover:text-white transition-colors text-[30px] font-light leading-none" aria-label="Back">
            &lt;
          </button>
          <div className="note-toolbar-scroll flex-1 min-w-0 overflow-x-auto flex items-center gap-0.5">
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("heading"))} className={`${topButtonClassName(toolbarState.heading)} w-9 font-serif font-bold text-[16px] leading-none tracking-tight`} title={`Text style: ${textLevelLabel}`} aria-label={`Text style: ${textLevelLabel}`}>Aa</button>
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("bold"))} className={topButtonClassName(toolbarState.bold)} aria-label="Bold"><Bold size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("italic"))} className={topButtonClassName(toolbarState.italic)} aria-label="Italic"><Italic size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("underline"))} className={topButtonClassName(toolbarState.underline)} aria-label="Underline"><Underline size={17} /></button>
            <button type="button" {...toolbarButtonProps(handleColorButton)} className={topButtonClassName(colorPanel)} aria-label="Text color" title="Text color"><NoteColorGlyph color={colorButtonColor} active={colorPanel} /></button>
            <div className="h-5 w-px bg-white/[0.08] mx-1 shrink-0" />
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("indent-out"))} className={topButtonClassName(false)} aria-label="Outdent"><Indent size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("indent-in"))} className={topButtonClassName(false)} aria-label="Indent"><IndentIncrease size={17} /></button>
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("quote"))} className={topButtonClassName(toolbarState.quote)} aria-label="Quote"><Quote size={16} /></button>
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("checklist"))} className={topButtonClassName(toolbarState.checklist)} aria-label="Checklist"><CheckSquare size={16} /></button>
            <button type="button" {...toolbarButtonProps(openTablePanelFromToolbar)} className={topButtonClassName(toolbarState.table || tablePanel)} aria-label={toolbarState.table ? "Table options" : "Insert table"}><NoteTableGlyph active={toolbarState.table || Boolean(tablePanel)} menuHint={toolbarState.table} /></button>
            <button type="button" {...toolbarButtonProps(() => runEditorCommand("list"))} className={topButtonClassName(toolbarState.bullet || toolbarState.ordered)} aria-label={listLabel}>
              <span className="text-[15px] font-extrabold leading-none">{listButtonText}</span>
            </button>
          </div>
          <div className="note-fixed-history-actions flex items-center gap-0.5 shrink-0">
            <button type="button" disabled={!toolbarState.canUndo} {...toolbarButtonProps(() => runEditorCommand("undo"))} className={topButtonClassName(false)} aria-label="Undo note edit"><Undo2 size={17} /></button>
            <button type="button" disabled={!toolbarState.canRedo} {...toolbarButtonProps(() => runEditorCommand("redo"))} className={topButtonClassName(false)} aria-label="Redo note edit"><Redo2 size={17} /></button>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); saveDraftInPlace(); }} title={syncLabel || syncText} aria-label={syncLabel || syncText} className="note-sync-button h-10 min-w-8 grid place-items-center transition-transform hover:scale-110 active:scale-95" style={{ color: syncColor }}>
            {syncStatus === "saving" ? <MoreHorizontal size={20} className="animate-pulse" /> : <Check size={20} />}
          </button>
        </div>
      </div>
      {colorPanel ? (
        <div className="fixed inset-0 z-[61]" onPointerDown={() => setColorPanel(false)}>
          <div className="fixed left-0 right-0 flex justify-center px-3 animate-in fade-in slide-in-from-bottom-4 duration-150" style={colorPanelStyle}>
            <div className="note-color-panel w-full max-w-[316px] bg-[#1A1A1A] border border-[#444444] shadow-2xl px-3 py-3" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              <div className="note-color-grid">
                {NOTE_EDITOR_SWATCHES.map(color => (
                  <button
                    key={color}
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      setDraftColor(color);
                    }}
                    className={`note-color-swatch ${normalizeNoteEditorColor(draftColor) === color ? "is-selected" : ""}`}
                    style={{ background: color }}
                    aria-label={`Use ${color}`}
                  />
                ))}
              </div>
              <div className="note-color-custom-row">
                <input
                  value={draftColor}
                  onPointerDown={e => e.stopPropagation()}
                  onChange={e => setDraftColor(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyDraftColor();
                    }
                  }}
                  placeholder="#ffd2d7"
                  aria-label="Text color hex"
                  className="note-color-input"
                />
                <button type="button" {...toolbarButtonProps(applyDraftColor)} className="note-color-confirm">ok</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {tablePanel ? (
        <div className="fixed inset-0 z-[61]" onPointerDown={() => setTablePanel(null)}>
          <div className="fixed left-0 right-0 flex justify-center px-3 animate-in fade-in slide-in-from-bottom-4 duration-150" style={tablePanelStyle}>
            <div className="table-action-panel w-full max-w-[360px] bg-[#1A1A1A] border border-[#444444] shadow-2xl px-3 py-3" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              {tablePanel === "insert" ? (
                <form className="table-panel-form" onSubmit={submitCustomTable}>
                  <div className="table-dimension-row">
                    <span className="table-dimension-label">Row</span>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Rows" value={tableRows} onFocus={e => e.currentTarget.select()} onChange={updateTableDimension(setTableRows)} onBlur={() => settleTableDimension(setTableRows, tableRows, 2, 12)} className="table-dimension-input" />
                    <span className="table-dimension-label">Col</span>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Cols" value={tableCols} onFocus={e => e.currentTarget.select()} onChange={updateTableDimension(setTableCols)} onBlur={() => settleTableDimension(setTableCols, tableCols, 2, 8)} className="table-dimension-input" />
                  </div>
                  <div className="table-panel-footer">
                    <button type="button" {...tablePanelButtonProps(() => setTablePanel(null))} className="table-panel-link table-panel-muted">Cancel</button>
                    <button type="submit" {...tablePanelButtonProps(insertCustomTable)} className="table-panel-link table-panel-accent">Insert</button>
                  </div>
                </form>
              ) : (
                <div className="table-menu-grid">
                  <button type="button" {...tablePanelButtonProps(() => runTableCommand("table-row-add"))} className="table-menu-action">Row +</button>
                  <button type="button" {...tablePanelButtonProps(() => runTableCommand("table-col-add"))} className="table-menu-action">Col +</button>
                  <button type="button" {...tablePanelButtonProps(() => runTableCommand("table-autofit"))} className="table-menu-action table-menu-accent">Auto fit</button>
                  <button type="button" {...tablePanelButtonProps(() => runTableCommand("table-row-delete"))} className="table-menu-action">Row -</button>
                  <button type="button" {...tablePanelButtonProps(() => runTableCommand("table-col-delete"))} className="table-menu-action">Col -</button>
                  <button type="button" {...tablePanelButtonProps(() => runTableCommand("table-delete"))} className="table-menu-action table-menu-danger">Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="w-full max-w-md h-[100dvh] bg-[#0a0a0a] flex flex-col" style={editorScreenStyle}>
        <div className="note-editor-scroll flex-1 min-h-0 overflow-y-auto thin-scroll px-5 pt-4" style={editorScrollStyle}>
          <input ref={titleRef} type="text" placeholder="Title" defaultValue={initialTitle} onInput={scheduleDraftAutosave} onBlur={saveDraftInPlace} className="note-title-input w-full bg-transparent border-none outline-none px-0 pt-3 pb-2 text-white font-black leading-[1.04] placeholder:text-[#555555] tracking-normal" />
          <ProseMirrorNoteEditor
            key={editorKey}
            initialHtml={initialHtml}
            className={editorClassName}
            onReady={(api) => {
              editorApiRef.current = api;
            }}
            onToolbarState={setToolbarState}
            onChange={scheduleDraftAutosave}
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
