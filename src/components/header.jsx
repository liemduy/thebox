const DEFAULT_WORKSPACE_NAME = "Liem's Planner";
const LOGO_STYLE_COUNT = 5;

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

function logoStyleClass(style) {
  const index = Math.abs(Number(style) || 0) % LOGO_STYLE_COUNT;
  return [
    "bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] text-[#111] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]",
    "bg-transparent border border-[#FFD2D7] text-[#FFD2D7] rounded-[12px]",
    "bg-[#F2F2F2] text-black rounded-full",
    "bg-[#151515] border border-[#444444] text-white rounded-[10px]",
    "bg-[#FFD2D7] text-black rounded-[4px]"
  ][index];
}

function Header({ workspaceName, logoStyle, onWorkspaceNameChange, onCycleLogoStyle, syncStatus, syncLabel, isSearchOpen, setIsSearchOpen, isHeaderMenuOpen, setIsHeaderMenuOpen, onSyncNow, onExport, onImportClick, onSignOut, fileInputRef, onImportFile }) {
  const displayName = normalizeWorkspaceName(workspaceName, { final: true }) || DEFAULT_WORKSPACE_NAME;
  const [draftName, setDraftName] = useState(displayName);
  useEffect(() => setDraftName(displayName), [displayName]);
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
    if (next !== displayName) onWorkspaceNameChange?.(next);
  }

  return (
    <header className="app-header flex justify-between items-center p-5 border-b border-[#333333] bg-[#0a0a0a] relative z-40">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCycleLogoStyle?.(); }}
          className={`relative w-[40px] h-[40px] shrink-0 flex items-center justify-center transition-all active:scale-95 ${logoStyleClass(logoStyle)}`}
          aria-label="Change logo style"
          title="Change logo style"
        >
          <span className="font-black text-[18px] tracking-tighter">{workspaceInitials(displayName)}</span>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-black rounded-full border-2 border-[#FFD2D7]" />
        </button>
        <div className="min-w-0">
          <input
            value={draftName}
            onChange={(e) => setDraftName(normalizeWorkspaceName(e.target.value))}
            onBlur={commitWorkspaceName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraftName(displayName);
                e.currentTarget.blur();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            maxLength={21}
            aria-label="Workspace name"
            className="block w-full max-w-[168px] bg-transparent border-none outline-none p-0 text-white font-extrabold text-[19px] leading-tight tracking-tight truncate focus:text-[#FFD2D7]"
          />
          <div className="text-[#777777] italic text-[11px] leading-tight font-semibold">—thebox</div>
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
