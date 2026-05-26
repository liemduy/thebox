const DEFAULT_WORKSPACE_NAME = "Liem's Planner";
const LOGO_STYLE_COUNT = 15;

function normalizeWorkspaceName(value, options = {}) {
  const compact = String(value || "").replace(/\s+/g, " ").trimStart().slice(0, 21);
  const words = compact.split(" ").filter(Boolean).slice(0, 2);
  const trailingSpace = !options.final && compact.endsWith(" ") && words.length < 2;
  return `${words.join(" ")}${trailingSpace ? " " : ""}`;
}

function workspaceInitials(name) {
  const words = normalizeWorkspaceName(name || DEFAULT_WORKSPACE_NAME, { final: true }).split(" ").filter(Boolean);
  const letters = words.length > 1
    ? `${words[0][0] || ""}${words[1][0] || ""}`
    : String(words[0] || DEFAULT_WORKSPACE_NAME).slice(0, 2);
  return letters.toUpperCase() || "LP";
}

function workspaceNameParts(name) {
  const words = normalizeWorkspaceName(name || DEFAULT_WORKSPACE_NAME, { final: true }).split(" ").filter(Boolean);
  return {
    first: words[0] || "Liem's",
    second: words[1] || ""
  };
}

function logoStyleIndex(style) {
  return Math.abs(Number(style) || 0) % LOGO_STYLE_COUNT;
}

function logoStyleClass(style) {
  const index = logoStyleIndex(style);
  return [
    "bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] text-[#111] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]",
    "bg-[#111111] border border-[#FFD2D7] text-[#FFD2D7] rounded-[12px] shadow-[inset_0_4px_0_rgba(255,210,215,0.18)]",
    "bg-[#151515] border border-[#3d3d3d] text-white rounded-[10px]",
    "bg-[#FFD2D7] text-black rounded-[9px] shadow-[0_8px_18px_rgba(255,210,215,0.16)]",
    "bg-[#101010] border border-[#444444] text-white rounded-[12px] shadow-[inset_0_-7px_0_rgba(255,210,215,0.10)]",
    "bg-transparent border border-dashed border-[#FFD2D7] text-[#FFD2D7] rounded-[8px]",
    "bg-[#FFD2D7] text-black rounded-[5px_12px_12px_12px]",
    "bg-[#101010] border border-[#343434] text-[#FFD2D7] rounded-[12px] shadow-[inset_0_0_0_1px_rgba(255,210,215,0.08)]",
    "bg-[#F2F2F2] text-black rounded-[10px] shadow-[4px_4px_0_#2D2D2D]",
    "bg-[#111111] border border-[#FFD2D7] text-white rounded-[14px]",
    "bg-[#151515] border border-[#3E3E3E] text-white rounded-[12px]",
    "bg-[#F7DDE1] text-black rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.28)]",
    "bg-[#101010] border border-[#3A3A3A] text-[#FFD2D7] rounded-[6px]",
    "bg-[#0a0a0a] border border-[#555555] text-white rounded-[12px]",
    "bg-black border border-[#FFD2D7] text-[#FFD2D7] rounded-[10px] shadow-[0_0_18px_rgba(255,210,215,0.18)]"
  ][index];
}

function LogoDecoration({ style }) {
  const index = Math.abs(Number(style) || 0) % LOGO_STYLE_COUNT;
  if (index === 0) return <span className="absolute -top-1 -right-1 w-3 h-3 bg-black rounded-full border-2 border-[#FFD2D7]" />;
  if (index === 1) return <><span className="absolute left-2 right-2 top-[7px] h-px bg-[#FFD2D7]/60" /><span className="absolute left-[9px] top-[4px] h-[6px] w-[3px] rounded-full bg-[#FFD2D7]" /><span className="absolute right-[9px] top-[4px] h-[6px] w-[3px] rounded-full bg-[#FFD2D7]" /></>;
  if (index === 2) return <><span className="absolute left-[5px] top-[8px] h-[3px] w-[3px] rounded-full bg-[#FFD2D7]" /><span className="absolute left-[5px] top-[16px] h-[3px] w-[3px] rounded-full bg-[#FFD2D7]" /><span className="absolute left-[5px] top-[24px] h-[3px] w-[3px] rounded-full bg-[#FFD2D7]" /></>;
  if (index === 3) return <><span className="absolute right-[7px] top-[8px] h-[7px] w-[7px] border border-black rounded-[2px]" /><span className="absolute right-[8px] top-[9px] h-[4px] w-[6px] border-b-2 border-l-2 border-black rotate-[-35deg]" /></>;
  if (index === 4) return <><span className="absolute left-1/2 top-[-3px] h-[9px] w-[17px] -translate-x-1/2 rounded-b-[5px] border border-[#FFD2D7]/70 bg-[#0a0a0a]" /><span className="absolute left-1/2 top-[2px] h-px w-[10px] -translate-x-1/2 bg-[#FFD2D7]/70" /></>;
  if (index === 5) return <><span className="absolute left-[7px] top-[7px] h-[5px] w-[5px] border-l border-t border-[#FFD2D7]" /><span className="absolute right-[7px] bottom-[7px] h-[5px] w-[5px] border-r border-b border-[#FFD2D7]" /></>;
  if (index === 6) return <span className="absolute left-[6px] top-[-1px] h-[8px] w-[17px] rounded-t-[5px] bg-[#FFD2D7] border border-black/10" />;
  if (index === 7) return <><span className="absolute left-[9px] right-[9px] top-[12px] h-px bg-[#FFD2D7]/25" /><span className="absolute left-[9px] right-[9px] top-[20px] h-px bg-[#FFD2D7]/25" /><span className="absolute left-[9px] right-[9px] top-[28px] h-px bg-[#FFD2D7]/25" /><span className="absolute left-[17px] top-[8px] bottom-[8px] w-px bg-[#FFD2D7]/20" /></>;
  if (index === 8) return <><span className="absolute -right-[4px] top-[5px] h-[31px] w-[31px] rounded-[9px] border border-[#555555] -z-10" /><span className="absolute -right-[2px] top-[3px] h-[33px] w-[33px] rounded-[9px] border border-[#777777] -z-10" /></>;
  if (index === 9) return <><span className="absolute left-[-3px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[#0a0a0a] border border-[#FFD2D7]" /><span className="absolute right-[-3px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[#0a0a0a] border border-[#FFD2D7]" /></>;
  if (index === 10) return <><span className="absolute left-[9px] top-[8px] bottom-[8px] w-px bg-[#FFD2D7]/65" /><span className="absolute left-[7px] top-[10px] h-[5px] w-[5px] rounded-full bg-[#FFD2D7]" /><span className="absolute left-[7px] bottom-[10px] h-[5px] w-[5px] rounded-full bg-[#FFD2D7]" /></>;
  if (index === 11) return <><span className="absolute inset-[6px] rounded-full border border-black/15" /><span className="absolute bottom-[6px] h-px w-[16px] bg-black/20" /></>;
  if (index === 12) return <><span className="absolute left-0 top-0 bottom-0 w-[5px] bg-[#FFD2D7]" /><span className="absolute left-[11px] right-[7px] top-[11px] h-px bg-[#FFD2D7]/35" /><span className="absolute left-[11px] right-[7px] bottom-[11px] h-px bg-[#FFD2D7]/35" /></>;
  if (index === 13) return <><span className="absolute left-[6px] top-[6px] h-[6px] w-[6px] border-l border-t border-[#FFD2D7]" /><span className="absolute right-[6px] top-[6px] h-[6px] w-[6px] border-r border-t border-[#FFD2D7]" /><span className="absolute left-[6px] bottom-[6px] h-[6px] w-[6px] border-l border-b border-[#FFD2D7]" /><span className="absolute right-[6px] bottom-[6px] h-[6px] w-[6px] border-r border-b border-[#FFD2D7]" /></>;
  return <><span className="absolute inset-[5px] rounded-[7px] border border-[#FFD2D7]/30" /><span className="absolute -bottom-[2px] left-1/2 h-[3px] w-[18px] -translate-x-1/2 rounded-full bg-[#FFD2D7]/60 blur-[1px]" /></>;
}

function BrandLogo({ name, style, onClick, className = "w-[40px] h-[40px]", textClassName = "text-[18px]", ariaLabel = "Workspace logo", title = "Workspace logo" }) {
  const content = (
    <>
      <LogoDecoration style={style} />
      <span className={`relative z-10 font-black tracking-tighter ${textClassName}`}>{workspaceInitials(name)}</span>
    </>
  );
  const classes = `relative isolate shrink-0 flex items-center justify-center transition-all ${className} ${logoStyleClass(style)}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${classes} active:scale-95`} aria-label={ariaLabel} title={title}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} aria-label={ariaLabel} title={title}>
      {content}
    </div>
  );
}

function Header({ workspaceName, logoStyle, onWorkspaceNameChange, onCycleLogoStyle, syncStatus, syncLabel, isSearchOpen, setIsSearchOpen, isHeaderMenuOpen, setIsHeaderMenuOpen, onSyncNow, onExport, onImportClick, onSignOut, fileInputRef, onImportFile }) {
  const displayName = normalizeWorkspaceName(workspaceName, { final: true }) || DEFAULT_WORKSPACE_NAME;
  const [draftName, setDraftName] = useState(displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const titleInputRef = useRef(null);
  useEffect(() => setDraftName(displayName), [displayName]);
  useEffect(() => {
    if (!isEditingName) return;
    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 20);
  }, [isEditingName]);
  const syncText = syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Local" : syncStatus === "error" ? "Error" : "Saved";
  const syncColor = syncStatus === "saved"
    ? "#FFD2D7"
    : syncStatus === "error"
      ? "#fb7185"
      : syncStatus === "saving"
        ? "#FFD2D7"
        : "#666666";

  function commitWorkspaceName() {
    const next = normalizeWorkspaceName(draftName, { final: true }) || DEFAULT_WORKSPACE_NAME;
    setDraftName(next);
    setIsEditingName(false);
    if (next !== displayName) onWorkspaceNameChange?.(next);
  }

  function cancelWorkspaceNameEdit() {
    setDraftName(displayName);
    setIsEditingName(false);
  }

  function startWorkspaceNameEdit(event) {
    event.stopPropagation();
    setDraftName(displayName);
    setIsEditingName(true);
  }

  const titleParts = workspaceNameParts(displayName);

  return (
    <header className="app-header flex justify-between items-center p-5 border-b border-[#333333] bg-[#0a0a0a] sticky top-0 z-40">
      <div className="flex items-center gap-3 min-w-0">
        <BrandLogo
          name={displayName}
          style={logoStyle}
          onClick={(e) => { e.stopPropagation(); onCycleLogoStyle?.(); }}
          className="w-[40px] h-[40px]"
          textClassName="text-[18px]"
          ariaLabel="Change logo style"
          title="Change logo style"
        />
        <div className="min-w-0">
          {isEditingName ? (
            <input
              ref={titleInputRef}
              value={draftName}
              onChange={(e) => setDraftName(normalizeWorkspaceName(e.target.value))}
              onBlur={commitWorkspaceName}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") cancelWorkspaceNameEdit();
              }}
              onClick={(e) => e.stopPropagation()}
              maxLength={21}
              aria-label="Workspace name"
              className="block w-full max-w-[168px] bg-transparent border-none outline-none p-0 text-white font-extrabold text-[19px] leading-tight tracking-tight truncate focus:text-[#FFD2D7]"
            />
          ) : (
            <button type="button" onClick={startWorkspaceNameEdit} aria-label="Workspace name" className="workspace-title-display flex max-w-[168px] items-baseline gap-1.5 text-left leading-tight truncate">
              <span className="truncate font-extrabold text-[19px] tracking-tight text-[#FFD2D7]">{titleParts.first}</span>
              {titleParts.second ? <span className="workspace-title-second shrink-0 text-[#FFD2D7] font-medium text-[16px] italic font-serif">{titleParts.second}</span> : null}
            </button>
          )}
          <div className="text-[#777777] italic text-[11px] leading-tight font-semibold">&mdash;thebox</div>
        </div>
      </div>
      <div className="flex gap-4 text-[#A7A7A7] items-center shrink-0">
        <button type="button" onClick={(e) => { e.stopPropagation(); onSyncNow(); }} title={syncLabel || syncText} aria-label={syncLabel || syncText} className="transition-transform hover:scale-110 active:scale-95" style={{ color: syncColor }}>
          {syncStatus === "saving" ? <MoreHorizontal size={20} className="animate-pulse" /> : <Check size={20} />}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setIsSearchOpen(!isSearchOpen); }} className={`transition-colors outline-none ${isSearchOpen ? "text-[#FFD2D7]" : "hover:text-white"}`} aria-label="Search">
          <Search size={20} />
        </button>
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); setIsHeaderMenuOpen(!isHeaderMenuOpen); }} className={`p-1.5 rounded-full transition-colors ${isHeaderMenuOpen ? "bg-[#222] text-white" : "hover:text-white"}`} aria-label="Account">
            <User size={20} />
          </button>
          {isHeaderMenuOpen && (
            <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-48 bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#333333] p-1.5 animate-in fade-in zoom-in-95 duration-100 z-50">
              <button type="button" onClick={onExport} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><Download size={16} /> Export JSON</button>
              <button type="button" onClick={onImportClick} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><Upload size={16} /> Import JSON</button>
              <div className="h-px bg-[#333] my-1" />
              <button type="button" onClick={onSignOut} className="flex items-center gap-3 w-full px-3 py-2.5 text-red-400 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><LogOut size={16} /> Log out</button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} onChange={onImportFile} className="hidden" type="file" accept="application/json" />
      </div>
    </header>
  );
}
