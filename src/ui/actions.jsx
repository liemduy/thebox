function EntryRow({ day, node, entry, handlers, flashTarget }) {
  const rowFlash = flashTarget?.type === "entry" && flashTarget.id === entry.id;
  const entryTags = entryTagList(entry);
  const titleOnlyTags = new Set(tagsFromText(noteTitle(entry)));
  const visibleEntryTags = entryTags.filter(tag => !titleOnlyTags.has(tag)).slice(0, 2);
  if (entry.type === "note") {
    return (
      <div data-action-entry-id={entry.id} className={`flex items-start py-1.5 px-3 hover:bg-[#1A1A1A] rounded-[10px] transition-colors group ${rowFlash ? "flash-target" : ""}`}>
        <button type="button" onClick={() => handlers.openActionNote(day.id, node.id, entry.id)} className="flex items-start flex-1 min-w-0 text-left">
          <div className="mt-[1px] px-1.5 py-[2px] bg-[#FFD2D7] text-black text-[9px] font-extrabold tracking-wider uppercase rounded-[4px] mr-3 shrink-0">Note</div>
          <span className="text-[14px] font-bold text-[#CCCCCC] group-hover:text-white leading-snug truncate">
            <HighlightText text={noteTitle(entry)} />
            {visibleEntryTags.length ? <span className="ml-2 text-[#FFD2D7]">{visibleEntryTags.map(tag => `#${tag}`).join(" ")}</span> : null}
          </span>
        </button>
        <button type="button" onClick={() => handlers.deleteActionNote(day.id, node.id, entry.id)} className="text-[#666] hover:text-red-300 p-1"><Trash2 size={14} /></button>
      </div>
    );
  }
  return (
    <div data-action-entry-id={entry.id} className={`flex items-start py-1.5 px-3 hover:bg-[#1A1A1A] rounded-[10px] transition-colors group ${rowFlash ? "flash-target" : ""}`}>
      <button type="button" onClick={() => handlers.toggleEntry(day.id, node.id, entry.id)} className={`mt-[2px] w-[16px] h-[16px] rounded-[4.5px] border-[1.5px] flex items-center justify-center mr-3 shrink-0 transition-all duration-200 ${entry.done ? "bg-[#FFD2D7] border-[#FFD2D7] text-black" : "border-[#555555] group-hover:border-[#A7A7A7] text-transparent"}`}>
        <Check size={11} strokeWidth={3.5} className={entry.done ? "opacity-100 scale-100" : "opacity-0 scale-50"} />
      </button>
      <div
        contentEditable
        suppressContentEditableWarning
        spellCheck="true"
        onInput={(e) => {
          if (!e.nativeEvent?.isComposing) highlightEditableHashtags(e.currentTarget);
        }}
        onCompositionEnd={(e) => highlightEditableHashtags(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        onBlur={(e) => handlers.renameEntry(day.id, node.id, entry.id, e.currentTarget.textContent)}
        className={`flex-1 min-w-0 outline-none text-[14.5px] leading-snug transition-colors ${entry.done ? "text-[#555555] line-through" : "text-[#CCCCCC] group-hover:text-white"}`}
      >
        <HighlightText text={entry.text} />
      </div>
      <button type="button" onClick={() => handlers.deleteEntry(day.id, node.id, entry.id)} className="text-[#666] hover:text-red-300 p-1 ml-2"><Trash2 size={14} /></button>
    </div>
  );
}

function ActionTreeItem({ state, day, node, level, menuOpenId, setMenuOpenId, menuPlacements, openNodeMenu, handlers, flashTarget }) {
  const filter = state.ui.actionFilter || "all";
  if (!hasVisibleAction(node, day.nodes, filter)) return null;
  const open = !(state.ui.collapsedActionNodes || []).includes(node.id);
  const children = childrenOf(node.id, day.nodes).filter(child => hasVisibleAction(child, day.nodes, filter));
  const entries = visibleEntriesFor(node, filter);
  const sourceBox = getNode(state.boxNodes, node.sourceBoxNodeId);
  const inactive = sourceBox ? boxIsInactive(sourceBox) || boxIsArchived(sourceBox) : false;
  const menuId = `action:${day.id}:${node.id}`;
  const menuOpen = menuOpenId === menuId;
  const menuMeta = menuPlacements?.[menuId] || { direction: "down", maxHeight: 116 };
  const isRoot = level === 0;
  const actionCascadeChildren = item => childrenOf(item.id, day.nodes).filter(child => hasVisibleAction(child, day.nodes, filter));
  const actionCascadeOwnContent = item => visibleEntriesFor(item, filter).length > 0;
  const cascadeMax = cascadeMaxDepth(node, actionCascadeChildren, actionCascadeOwnContent);
  const cascadeDepth = Math.min(cascadeMax, cascadeOpenDepth(node, actionCascadeChildren, item => isActionOpen(state, item), actionCascadeOwnContent));
  const cascade = cascadePlan(cascadeDepth, cascadeMax, state.ui.actionCascadeModes?.[node.id]);
  const CascadeIcon = cascade.direction === "expand"
    ? (cascade.deep ? ChevronsDown : ChevronRight)
    : (cascade.deep ? ChevronsRight : ChevronDown);
  const cascadeLabel = cascade.direction === "expand"
    ? (cascade.deep ? "Expand next level" : "Expand")
    : (cascade.deep ? "Collapse next level" : "Collapse");

  return (
    <div data-action-node-id={node.id} className={`flex flex-col w-full ${flashTarget?.type === "action" && flashTarget.id === node.id ? "flash-target" : ""} ${menuOpen ? "relative z-50" : ""}`}>
      <div className={`flex items-center px-4 hover:bg-white/[0.04] transition-colors relative ${isRoot ? "py-3.5" : "py-2.5 border-t border-white/[0.05]"}`}>
        <div className={`${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"} mr-3 shrink-0 h-8 w-5 grid place-items-center`}>
          <GripVertical size={isRoot ? 20 : 16} />
        </div>
        <div className={`flex-1 min-w-0 pr-2 ${isRoot ? "font-extrabold text-[20.5px] tracking-tight text-[#FFD2D7]" : "font-medium text-[15px] text-[#E0E0E0]"}`}>
          <span className={`block truncate ${inactive ? "text-[#666] line-through" : ""}`}>{node.title}</span>
        </div>
        <StatusBadge node={sourceBox} />
        <div className={`flex items-center gap-1 shrink-0 ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"}`}>
          <button type="button" onClick={(e) => { e.stopPropagation(); handlers.toggleActionOpen(node.id); }} className="h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white hover:bg-[#444444]" aria-label={cascadeLabel} title={cascadeLabel}>
            <CascadeIcon size={isRoot ? 21 : 18} />
          </button>
          <div className="relative">
            <button type="button" onClick={(e) => openNodeMenu(menuId, e, 116)} className={`h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white ${menuOpen ? "bg-[#444444] text-white" : "hover:bg-[#444444]"}`} aria-label="Action menu">
              <MoreHorizontal size={isRoot ? 21 : 18} />
            </button>
            {menuOpen && (
              <div data-floating-menu-id={menuId} data-menu-direction={menuMeta.direction} onClick={e => e.stopPropagation()} style={{ maxHeight: `${menuMeta.maxHeight}px` }} className={`absolute right-0 ${floatingMenuPositionClass(menuMeta)} w-44 bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] z-50 py-1.5 flex flex-col overflow-x-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}>
                <MenuItem icon={<CheckCircle size={16} />} label="+ action" onClick={() => { setMenuOpenId(null); handlers.openActionLines(day.id, node.id); }} />
                <MenuItem icon={<FileText size={16} />} label="+ notes" onClick={() => { setMenuOpenId(null); handlers.openActionNote(day.id, node.id, null); }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="w-full flex flex-col">
          {entries.length > 0 && (
            <div className={`flex flex-col gap-[1px] pt-1 pb-1 pr-4 ${isRoot ? "ml-[42px]" : "ml-[36px]"}`}>
              {entries.map(entry => <EntryRow key={entry.id} day={day} node={node} entry={entry} handlers={handlers} flashTarget={flashTarget} />)}
            </div>
          )}
          {children.length > 0 && (
            <div className={`ml-5 border-l-[1.5px] border-white/[0.05] pl-1 ${entries.length ? "mb-0.5 mt-1" : "my-0.5"}`}>
              {children.map(child => <ActionTreeItem key={child.id} state={state} day={day} node={child} level={level + 1} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId} menuPlacements={menuPlacements} openNodeMenu={openNodeMenu} handlers={handlers} flashTarget={flashTarget} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function compactDateLabel(value) {
  if (!value) return "";
  return displayDate(value).replace(" (today)", "");
}

function DateTextInput({ value, onCommit, allowEmpty = false, ariaLabel = "Date", inputClassName = "" }) {
  const [draft, setDraft] = useState(compactDateLabel(value));
  const [invalid, setInvalid] = useState(false);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(compactDateLabel(value));
      setInvalid(false);
    }
  }, [value]);

  function commit(nextDraft = draft) {
    const raw = String(nextDraft || "").trim();
    if (!raw && allowEmpty) {
      setDraft("");
      setInvalid(false);
      onCommit("");
      return true;
    }

    const parsed = parseUserDate(raw);
    if (!parsed) {
      setInvalid(Boolean(raw));
      if (!raw) setDraft(compactDateLabel(value));
      return false;
    }

    setDraft(compactDateLabel(parsed));
    setInvalid(false);
    onCommit(parsed);
    return true;
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={draft}
      placeholder="dd/mm/yyyy"
      onFocus={(e) => {
        isFocusedRef.current = true;
        window.setTimeout(() => e.currentTarget.select(), 0);
      }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
      onBlur={() => { isFocusedRef.current = false; commit(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (commit()) e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setDraft(compactDateLabel(value));
          setInvalid(false);
          e.currentTarget.blur();
        }
      }}
      className={`min-w-0 bg-transparent outline-none placeholder:text-[#555555] transition-colors ${invalid ? "text-red-200" : "text-white"} ${inputClassName}`}
    />
  );
}

function actionDayHasEntries(day) {
  return (day.nodes || []).some(node => entriesFor(node).length > 0);
}

function ActionDatePickerPanel({ selectedDate, actionDays, onSelect, align = "right" }) {
  const [month, setMonth] = useState(String(selectedDate || todayYMD()).slice(0, 7));
  useEffect(() => { setMonth(String(selectedDate || todayYMD()).slice(0, 7)); }, [selectedDate]);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const selectedMonth = new Date(year, monthNumber - 1, 1);
  const daysWithEntries = new Set((actionDays || [])
    .filter(actionDayHasEntries)
    .map(day => day.date));
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthNumber - 1, index - startOffset + 1);
    return todayYMD(date);
  });

  function shiftMonth(offset) {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div onClick={e => e.stopPropagation()} className={`absolute top-full ${align === "left" ? "left-0 origin-top-left" : "right-0 origin-top-right"} mt-2 w-[292px] max-w-[calc(100vw-2rem)] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] p-3 animate-in fade-in zoom-in-95 duration-100 z-50`}>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => shiftMonth(-1)} className="h-8 w-8 grid place-items-center rounded-full text-[#A7A7A7] hover:text-white hover:bg-[#333333] transition-colors" aria-label="Previous month"><ChevronLeft size={16} /></button>
        <div className="text-white text-[13px] font-extrabold">
          {selectedMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <button type="button" onClick={() => shiftMonth(1)} className="h-8 w-8 grid place-items-center rounded-full text-[#A7A7A7] hover:text-white hover:bg-[#333333] transition-colors" aria-label="Next month"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
          <div key={`${label}-${index}`} className="h-6 grid place-items-center text-[10px] font-extrabold text-[#666666]">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map(date => {
          const inMonth = date.slice(0, 7) === month;
          const hasEntries = daysWithEntries.has(date);
          const selected = date === selectedDate;
          const today = date === todayYMD();
          const dayNumber = Number(date.slice(-2));
          const className = selected
            ? "bg-[#FFD2D7] border-[#FFD2D7] text-black shadow-[0_0_18px_rgba(255,210,215,0.18)]"
            : hasEntries
              ? "bg-[#FFD2D7]/[0.16] border-[#FFD2D7] text-[#FFD2D7]"
              : today
                ? "bg-transparent border-[#555555] text-white"
                : "bg-transparent border-transparent text-[#A7A7A7] hover:border-[#555555] hover:text-white";
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              className={`h-8 rounded-[9px] border text-[12px] font-extrabold transition-all ${className} ${inMonth ? "" : "opacity-35"}`}
              aria-label={displayDate(date)}
              title={hasEntries ? "Has actions/notes" : displayDate(date)}
            >
              {dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
