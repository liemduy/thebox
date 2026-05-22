function Header({ syncStatus, syncLabel, isSearchOpen, setIsSearchOpen, isHeaderMenuOpen, setIsHeaderMenuOpen, onSyncNow, onExport, onImportClick, onOpenDebug, onSignOut, fileInputRef, onImportFile }) {
  const syncText = syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Local" : syncStatus === "error" ? "Error" : "Saved";
  const syncColor = syncStatus === "saved"
    ? "#FFD2D7"
    : syncStatus === "error"
      ? "#fb7185"
      : syncStatus === "saving"
        ? "#FFD2D7"
        : "#666666";
  return (
    <header className="app-header flex justify-between items-center p-5 border-b border-[#333333] bg-[#0a0a0a] relative z-40">
      <div className="flex items-center gap-3">
        <div className="relative w-[40px] h-[40px] flex items-center justify-center bg-gradient-to-tr from-[#FFD2D7] to-[#e4b3b9] rounded-[12px] shadow-[0_0_15px_rgba(255,210,215,0.2)]">
          <span className="font-black text-[20px] text-[#111] tracking-tighter">LP</span>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-black rounded-full border-2 border-[#FFD2D7]" />
        </div>
        <h1 className="font-extrabold text-[20px] tracking-tight text-white flex items-baseline gap-1.5">
          Liem's <span className="text-[#FFD2D7] font-medium text-[17px] italic font-serif">Planner</span>
        </h1>
      </div>
      <div className="flex gap-4 text-[#A7A7A7] items-center">
        <button type="button" onClick={(e) => { e.stopPropagation(); onSyncNow(); }} title={syncLabel || syncText} aria-label={syncLabel || syncText} className="transition-transform hover:scale-110 active:scale-95" style={{ color: syncColor }}>
          {syncStatus === "saving" ? <MoreHorizontal size={20} className="animate-pulse" /> : <Check size={20} />}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setIsSearchOpen(!isSearchOpen); }} className={`transition-colors outline-none ${isSearchOpen ? "text-[#FFD2D7]" : "hover:text-white"}`} aria-label="Search">
          <Search size={20} />
        </button>
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); setIsHeaderMenuOpen(!isHeaderMenuOpen); }} className={`p-1.5 rounded-full transition-colors ${isHeaderMenuOpen ? "bg-[#222] text-white" : "hover:text-white"}`} aria-label="Tools">
            <MoreHorizontal size={20} />
          </button>
          {isHeaderMenuOpen && (
            <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-48 bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#333333] p-1.5 animate-in fade-in zoom-in-95 duration-100 z-50">
              <button type="button" onClick={onExport} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><Download size={16} /> Export JSON</button>
              <button type="button" onClick={onImportClick} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><Upload size={16} /> Import JSON</button>
              <button type="button" onClick={onOpenDebug} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#333] rounded-lg transition-colors text-[14px]"><FileText size={16} /> Debug</button>
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
