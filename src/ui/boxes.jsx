function StatusBadge({ node }) {
  if (boxIsArchived(node)) return <span className="ml-2 text-[10px] uppercase tracking-wider bg-[#2D2D2D] text-[#A7A7A7] px-1.5 py-[2px] rounded">archived</span>;
  if (boxIsDone(node)) return <span className="ml-2 text-[10px] uppercase tracking-wider bg-[#FFD2D7] text-black px-1.5 py-[2px] rounded">done</span>;
  return null;
}

function BoxActionTimeline({ boxId, groups, isRoot, expandedKeys, onToggleDay, onOpenActionDate }) {
  if (!groups.length) return null;
  return (
    <div className={`flex flex-col gap-2 pb-2 pr-4 ${isRoot ? "ml-[42px]" : "ml-[36px]"}`}>
      {groups.map(({ day, items }) => {
        const actions = items.filter(item => item.entry.type === "action");
        const done = actions.filter(item => item.entry.done).length;
        const key = `${boxId}:${day.date}`;
        const expanded = (expandedKeys || []).includes(key);
        return (
          <div key={day.id} className="rounded-[12px] bg-[#101010] border border-white/[0.04] overflow-hidden">
            <button type="button" onClick={() => onToggleDay(boxId, day.date)} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#171717] transition-colors">
              <span className="flex items-center gap-1.5 min-w-0">
                {expanded ? <ChevronDown size={14} className="text-[#A7A7A7] shrink-0" /> : <ChevronRight size={14} className="text-[#A7A7A7] shrink-0" />}
                <span className="text-[12px] font-extrabold text-[#FFD2D7] truncate">{displayDate(day.date)}</span>
              </span>
              {actions.length ? <span className="text-[11px] text-[#A7A7A7] font-bold shrink-0">{done}/{actions.length}</span> : <span className="text-[11px] text-[#A7A7A7] font-bold shrink-0">{items.length} note</span>}
            </button>
            {expanded && <div className="px-2 pb-2 flex flex-col gap-1">
              {items.map(({ entry, actionNode, sourceTitle }) => (
                <button key={`${actionNode.id}:${entry.id}`} type="button" onClick={() => onOpenActionDate(day.date, actionNode.id, entry.id)} className="group flex items-start gap-2 rounded-[9px] px-2 py-1.5 text-left hover:bg-[#1A1A1A] transition-colors">
                  {entry.type === "note" ? (
                    <span className="mt-[2px] px-1.5 py-[2px] bg-[#FFD2D7] text-black text-[9px] font-extrabold tracking-wider uppercase rounded-[4px] shrink-0">Note</span>
                  ) : (
                    <span className={`mt-[3px] w-[15px] h-[15px] rounded-[4px] border-[1.5px] grid place-items-center shrink-0 ${entry.done ? "bg-[#FFD2D7] border-[#FFD2D7] text-black" : "border-[#555] text-transparent"}`}>
                      <Check size={10} strokeWidth={3.5} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] leading-snug truncate ${entry.type === "action" && entry.done ? "text-[#666] line-through" : "text-[#CCCCCC] group-hover:text-white"}`}>
                      {entry.type === "note" ? noteTitle(entry) : entry.text}
                    </span>
                  </span>
                </button>
              ))}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

function BoxTreeItem({ state, node, level, view, menuOpenId, setMenuOpenId, menuPlacements, openNodeMenu, handlers, dragState, setDragState, flashTarget }) {
  const children = childrenOf(node.id, state.boxNodes).filter(child => shouldShowChildInView(child, view));
  const open = isBoxOpen(state, node);
  const isRoot = level === 0;
  const inactive = boxIsInactive(node) || boxIsArchived(node);
  const showBoxDays = state.ui.showBoxDays !== false;
  const timeline = showBoxDays ? actionTimelineForBox(state, node) : [];
  const hasNote = boxHasNote(node);
  const hasBody = children.length > 0 || timeline.length > 0;
  const boxCascadeChildren = item => childrenOf(item.id, state.boxNodes).filter(child => shouldShowChildInView(child, view));
  const boxCascadeOwnContent = item => state.ui.showBoxDays !== false && actionTimelineForBox(state, item).length > 0;
  const cascadeMax = cascadeMaxDepth(node, boxCascadeChildren, boxCascadeOwnContent);
  const cascadeDepth = Math.min(cascadeMax, cascadeOpenDepth(node, boxCascadeChildren, item => isBoxOpen(state, item), boxCascadeOwnContent));
  const cascade = cascadePlan(cascadeDepth, cascadeMax, state.ui.boxCascadeModes?.[node.id]);
  const CascadeIcon = cascade.direction === "expand"
    ? (cascade.deep ? ChevronsDown : ChevronRight)
    : (cascade.deep ? ChevronsRight : ChevronDown);
  const cascadeLabel = cascade.direction === "expand"
    ? (cascade.deep ? "Expand next level" : "Expand")
    : (cascade.deep ? "Collapse next level" : "Collapse");
  const menuId = `box:${node.id}`;
  const menuOpen = menuOpenId === menuId;
  const menuMeta = menuPlacements?.[menuId] || { direction: "down", maxHeight: inactive ? 72 : 248 };
  const dragging = dragState?.id === node.id;
  const dropTarget = dragState?.overId === node.id;
  const pointerDragRef = useRef(null);

  function setDragOver(targetId) {
    if (!targetId || targetId === node.id) {
      pointerDragRef.current = pointerDragRef.current ? { ...pointerDragRef.current, overId: null } : null;
      setDragState(prev => prev?.id === node.id ? { ...prev, overId: null } : prev);
      return;
    }
    const target = getNode(state.boxNodes, targetId);
    if (!target || (target.parentId ?? null) !== (node.parentId ?? null)) return;
    pointerDragRef.current = pointerDragRef.current ? { ...pointerDragRef.current, overId: targetId } : null;
    setDragState(prev => prev?.id === node.id ? { ...prev, overId: targetId } : prev);
  }

  function sameLevelDropIdFromPoint(x, y) {
    let boxEl = document.elementFromPoint(x, y)?.closest?.("[data-box-node-id]");
    while (boxEl) {
      const targetId = boxEl.getAttribute("data-box-node-id");
      const target = getNode(state.boxNodes, targetId);
      if (target && targetId !== node.id && (target.parentId ?? null) === (node.parentId ?? null)) return targetId;
      boxEl = boxEl.parentElement?.closest?.("[data-box-node-id]");
    }
    return null;
  }

  function onTouchDragStart(e) {
    if (inactive || e.pointerType === "mouse" || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { id: node.id, parentId: node.parentId ?? null, overId: null, pointerId: e.pointerId };
    pointerDragRef.current = start;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.body.classList.add("touch-dragging");
    setMenuOpenId(null);
    setDragState(start);

    const move = (event) => {
      if (!pointerDragRef.current || event.pointerId !== pointerDragRef.current.pointerId) return;
      event.preventDefault();
      setDragOver(sameLevelDropIdFromPoint(event.clientX, event.clientY));
    };
    const finish = (event) => {
      if (!pointerDragRef.current || event.pointerId !== pointerDragRef.current.pointerId) return;
      event.preventDefault();
      const overId = pointerDragRef.current.overId;
      try { e.currentTarget?.releasePointerCapture?.(event.pointerId); } catch {}
      pointerDragRef.current = null;
      document.body.classList.remove("touch-dragging");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      if (overId && overId !== node.id) handlers.reorderBox(node.id, overId);
      setDragState(null);
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish, { passive: false });
    document.addEventListener("pointercancel", finish, { passive: false });
  }

  function onDrop(e) {
    e.preventDefault();
    if (!dragState || dragState.id === node.id || dragState.parentId !== (node.parentId ?? null)) return;
    handlers.reorderBox(dragState.id, node.id);
    setDragState(null);
  }

  return (
    <div
      data-box-node-id={node.id}
      className={`flex flex-col w-full ${flashTarget?.type === "box" && flashTarget.id === node.id ? "flash-target" : ""} ${menuOpen ? "relative z-50" : ""} ${dragging ? "dragging-row" : ""} ${dropTarget ? "drop-target" : ""}`}
      onDragOver={(e) => {
        if (dragState?.id && dragState.id !== node.id && dragState.parentId === (node.parentId ?? null)) {
          e.preventDefault();
          setDragState(prev => prev?.overId === node.id ? prev : { ...prev, overId: node.id });
        }
      }}
      onDrop={onDrop}
    >
      <div className={`flex items-center px-4 hover:bg-white/[0.04] transition-colors relative ${isRoot ? "py-3.5" : "py-2.5 border-t border-white/[0.05]"}`}>
        <button
          type="button"
          draggable={!inactive}
          onPointerDown={onTouchDragStart}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => { e.stopPropagation(); e.dataTransfer?.setData("text/plain", node.id); setDragState({ id: node.id, parentId: node.parentId ?? null, overId: null }); }}
          onDragEnd={() => setDragState(null)}
          onClick={(e) => e.stopPropagation()}
          className={`drag-handle ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"} mr-3 cursor-grab active:cursor-grabbing hover:text-white shrink-0 h-8 w-5 grid place-items-center`}
          aria-label="Drag"
        >
          <GripVertical size={isRoot ? 20 : 16} />
        </button>

        <div className={`flex-1 min-w-0 pr-2 ${isRoot ? "font-extrabold text-[20.5px] tracking-tight text-[#FFD2D7]" : `font-medium text-[15px] ${boxIsDone(node) ? "text-[#666] line-through" : "text-[#E0E0E0]"}`}`}>
          <div
            contentEditable={!inactive}
            suppressContentEditableWarning
            spellCheck="false"
            data-placeholder={isRoot ? "Box title" : "Sub-box title"}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
            onBlur={(e) => handlers.renameBox(node.id, e.currentTarget.textContent)}
            className="outline-none truncate min-h-[1.25em]"
          >
            {node.title}
          </div>
        </div>
        <StatusBadge node={node} />

        <div className={`flex items-center gap-1 shrink-0 ${isRoot ? "text-[#A7A7A7]" : "text-[#666666]"}`}>
          {hasNote && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlers.openBoxNote(node.id); }}
              className="h-8 w-7 grid place-items-center rounded-full text-[#FFD2D7] hover:text-white hover:bg-[#444444] transition-colors"
              aria-label="View notes"
              title="View notes"
            >
              <Notebook size={isRoot ? 18 : 16} strokeWidth={2.1} />
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); handlers.toggleBoxOpen(node.id); }} className="h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white hover:bg-[#444444]" aria-label={cascadeLabel} title={cascadeLabel}>
            <CascadeIcon size={isRoot ? 21 : 18} />
          </button>
          <div className="relative">
            <button type="button" onClick={(e) => openNodeMenu(menuId, e, inactive ? 72 : 248)} className={`h-8 w-8 grid place-items-center rounded-full transition-colors hover:text-white ${menuOpen ? "bg-[#444444] text-white" : "hover:bg-[#444444]"}`} aria-label="Box menu">
              <MoreHorizontal size={isRoot ? 21 : 18} />
            </button>
            {menuOpen && (
              <div data-floating-menu-id={menuId} data-menu-direction={menuMeta.direction} onClick={e => e.stopPropagation()} style={{ maxHeight: `${menuMeta.maxHeight}px` }} className={`absolute right-0 ${floatingMenuPositionClass(menuMeta)} w-44 bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] z-50 py-1.5 flex flex-col overflow-x-hidden overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}>
                {inactive ? (
                  <MenuItem icon={<CheckCircle size={16} />} label="restore" onClick={() => { setMenuOpenId(null); handlers.restoreBox(node.id); }} />
                ) : (
                  <>
                    <MenuItem icon={<PlusSquare size={16} />} label="+ sub" onClick={() => { setMenuOpenId(null); handlers.addSub(node.id); }} />
                    <MenuItem icon={<FileText size={16} />} label={hasNote ? "view notes" : "+ notes"} accent={hasNote} onClick={() => { setMenuOpenId(null); handlers.openBoxNote(node.id); }} />
                    <MenuItem icon={<CheckCircle size={16} />} label="done" onClick={() => { setMenuOpenId(null); handlers.doneBox(node.id); }} />
                    <MenuItem icon={<Archive size={16} />} label="archive" divider onClick={() => { setMenuOpenId(null); handlers.archiveBox(node.id); }} />
                    <MenuItem icon={<Trash2 size={16} />} label="remove" danger onClick={() => { setMenuOpenId(null); handlers.deleteBox(node.id); }} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {hasBody && open && (
        <div className="w-full flex flex-col">
          <BoxActionTimeline boxId={node.id} groups={timeline} isRoot={isRoot} expandedKeys={state.ui.expandedBoxActionDays || []} onToggleDay={handlers.toggleBoxTimelineDay} onOpenActionDate={handlers.openActionDate} />
          {children.length > 0 && (
            <div className="ml-5 border-l-[1.5px] border-white/[0.05] pl-1 my-0.5">
              {children.map(child => (
                <BoxTreeItem key={child.id} state={state} node={child} level={level + 1} view={view} menuOpenId={menuOpenId} setMenuOpenId={setMenuOpenId} menuPlacements={menuPlacements} openNodeMenu={openNodeMenu} handlers={handlers} dragState={dragState} setDragState={setDragState} flashTarget={flashTarget} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
