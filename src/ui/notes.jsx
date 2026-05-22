function NoteCard({ state, note, query = "", onOpen, onDelete, flashTarget }) {
  const preview = notePreview(note);
  const linked = noteIsLinked(state, note.id);
  return (
    <div data-note-id={note.id} className={`group bg-[#141414] border border-white/[0.04] rounded-[12px] px-4 py-3.5 ${flashTarget?.type === "note" && flashTarget.id === note.id ? "flash-target" : ""}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => onOpen(note.id)} className="min-w-0 flex-1 text-left">
          <h3 className={`font-extrabold text-[15.5px] leading-snug truncate ${linked ? "text-white not-italic" : "text-[#FFD2D7] italic"}`}>
            <HighlightText text={noteDisplayTitle(note)} query={query} />
          </h3>
          <p className="text-[#A7A7A7] text-[13px] leading-snug mt-1 truncate">
            <HighlightText text={preview || "No preview"} query={query} />
          </p>
        </button>
        <button type="button" onClick={() => onDelete(note.id)} className="text-[#666] hover:text-red-300 transition-colors p-1.5 -mr-1 shrink-0" aria-label="Delete note">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function NotesPanel({ state, notes, tags, isViewMenuOpen, setIsViewMenuOpen, isViewByMenuOpen, setIsViewByMenuOpen, onCreateNote, onOpenNote, onDeleteNote, onSetView, onSetViewBy, onOpenExport, flashTarget }) {
  const groups = groupNotesByDate(notes);
  const view = state.ui.notesView || "linked";
  const viewLabel = view === "linked" ? "Linked" : view === "free" ? "Free" : "All";
  const tagsInput = state.ui.notesTagsInput || "";
  const datesInput = state.ui.notesDatesInput || "";
  const selectedTags = exportTagsFromInput(tagsInput);
  const tagHints = tagHintsForInput(tags, tagsInput);
  const dateFilters = parseExportDateFilters(datesInput);
  const hasViewBy = Boolean(selectedTags.length || datesInput.trim());
  const dateFilterLabel = datesInput.trim()
    ? (dateFilters.length ? `${dateFilters.length} date${dateFilters.length > 1 ? "s" : ""}` : "Invalid date")
    : "";
  const emptyTitle = hasViewBy ? "No notes match" : "No notes yet";
  const emptyAction = hasViewBy ? "Clear filters" : "Create note";
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 flex-1 flex flex-col">
      <div className="filter-row flex flex-wrap items-center gap-2.5 mb-5 relative z-20">
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); setIsViewMenuOpen(!isViewMenuOpen); }} className="flex items-center gap-1.5 px-6 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform">
            {viewLabel}
          </button>
          {isViewMenuOpen && (
            <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 mt-2 w-[130px] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] py-1.5 flex flex-col origin-top-left animate-in fade-in zoom-in-95 duration-100">
              {[["linked", "Linked"], ["free", "Free"], ["all", "All"]].map(([value, label]) => (
                <button key={value} type="button" onClick={() => { onSetView(value); setIsViewMenuOpen(false); }} className="px-4 py-2.5 text-[14px] font-medium text-left text-white hover:bg-[#3E3E3E] transition-colors">{label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); setIsViewByMenuOpen(!isViewByMenuOpen); setIsViewMenuOpen(false); }} className={`px-5 py-2 active:scale-95 text-[13px] font-bold rounded-full border transition-all ${hasViewBy ? "bg-[#FFD2D7] border-[#FFD2D7] text-black shadow-[0_0_18px_rgba(255,210,215,0.18)]" : "bg-transparent text-white border-[#878787] hover:border-white"}`}>
            View by
          </button>
          {isViewByMenuOpen && (
            <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 mt-2 w-[300px] max-w-[calc(100vw-2.5rem)] bg-[#1A1A1A] rounded-xl shadow-2xl border border-[#444444] p-3 flex flex-col gap-3 origin-top-left animate-in fade-in zoom-in-95 duration-100">
              <label className="block">
                <span className="block text-[11px] text-[#A7A7A7] font-extrabold mb-1.5">Hashtags</span>
                <input value={tagsInput} onChange={(e) => onSetViewBy({ tagsInput: e.target.value })} placeholder="#idea, #work" className="w-full bg-[#111111] border border-[#323232] rounded-[10px] px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555]" />
                {tagHints.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tagHints.map(tag => (
                      <button key={tag} type="button" onClick={() => onSetViewBy({ tagsInput: replaceLastCsvToken(tagsInput, tag) })} className="text-[11px] font-bold text-[#FFD2D7] bg-[#FFD2D7]/[0.08] px-2 py-1 rounded-full">#{tag}</button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="block">
                <span className="block text-[11px] text-[#A7A7A7] font-extrabold mb-1.5">Dates</span>
                <input value={datesInput} onChange={(e) => onSetViewBy({ datesInput: e.target.value })} placeholder="22/05/2026, 01/05/2026 - 22/05/2026" className="w-full bg-[#111111] border border-[#323232] rounded-[10px] px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555]" />
                {datesInput.trim() ? (
                  <div className={`mt-2 text-[11px] font-bold ${dateFilters.length ? "text-[#A7A7A7]" : "text-red-300"}`}>
                    {dateFilters.length ? `${dateFilters.length} date filter${dateFilters.length > 1 ? "s" : ""}` : "Use dd/mm/yyyy or dd/mm/yyyy - dd/mm/yyyy"}
                  </div>
                ) : null}
              </label>
              <button type="button" onClick={() => onSetViewBy({ tagsInput: "", datesInput: "" })} className="self-start text-[12px] font-extrabold text-[#FFD2D7] hover:text-white transition-colors px-1">Clear</button>
            </div>
          )}
        </div>
        <button type="button" onClick={onOpenExport} className="px-5 py-2 bg-transparent hover:border-white active:scale-95 text-white text-[13px] font-bold rounded-full border border-[#878787] transition-all flex items-center gap-2">
          <Download size={14} /> Export
        </button>
        <button type="button" onClick={onCreateNote} className="ml-auto px-5 py-2 bg-[#FFD2D7] hover:scale-105 active:scale-95 text-black text-[13px] font-bold rounded-full transition-transform" aria-label="Create note">
          +note
        </button>
      </div>
      {hasViewBy && (
        <div className="-mt-2 mb-5 flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold">
          {selectedTags.slice(0, 3).map(tag => <span key={tag} className="px-2 py-1 rounded-full bg-[#FFD2D7]/[0.08] text-[#FFD2D7]">#{tag}</span>)}
          {selectedTags.length > 3 ? <span className="px-2 py-1 rounded-full bg-[#111111] text-[#A7A7A7]">+{selectedTags.length - 3}</span> : null}
          {dateFilterLabel ? <span className={`px-2 py-1 rounded-full bg-[#111111] ${dateFilters.length ? "text-[#A7A7A7]" : "text-red-300"}`}>{dateFilterLabel}</span> : null}
          <button type="button" onClick={() => onSetViewBy({ tagsInput: "", datesInput: "" })} className="px-2 py-1 text-[#A7A7A7] hover:text-white transition-colors">Clear</button>
        </div>
      )}

      {groups.length ? (
        <div className="space-y-5">
          {groups.map(group => (
            <section key={group.date}>
              <div className="text-[12px] font-extrabold text-[#A7A7A7] mb-2 px-1">{displayDate(group.date)}</div>
              <div className="space-y-3">
                {group.items.map(note => <NoteCard key={note.id} state={state} note={note} onOpen={onOpenNote} onDelete={onDeleteNote} flashTarget={flashTarget} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center pb-20 text-center">
          <div className="w-20 h-20 bg-[#1E1E1E] rounded-full flex items-center justify-center mb-6"><FileText size={36} className="text-[#A7A7A7]" /></div>
          <h3 className="text-white font-bold text-[18px] mb-2">{emptyTitle}</h3>
          <button type="button" onClick={hasViewBy ? () => onSetViewBy({ tagsInput: "", datesInput: "" }) : onCreateNote} className="mt-4 bg-[#FFD2D7] text-black font-bold px-7 py-3 rounded-full flex items-center gap-2">
            {hasViewBy ? <X size={18} /> : <Plus size={18} />} {emptyAction}
          </button>
        </div>
      )}
    </div>
  );
}

function replaceLastCsvToken(input, value) {
  const parts = String(input || "").split(",");
  parts[parts.length - 1] = ` #${value}`;
  return parts.map((part, index) => index === 0 ? part.trimStart() : part.trim()).join(", ").replace(/^, /, "");
}

function tagHintsForInput(tags, input) {
  const selected = exportTagsFromInput(input);
  const needle = normalizeTag(String(input || "").split(",").pop() || "");
  const candidates = tags.filter(tag => !selected.includes(tag));
  const ranked = needle
    ? [
        ...candidates.filter(tag => tag.startsWith(needle)),
        ...candidates.filter(tag => !tag.startsWith(needle) && tag.includes(needle))
      ]
    : candidates;
  return [...new Set(ranked)].slice(0, needle ? 6 : 4);
}

function ExportNotesModal({ tags, onClose, onExport }) {
  const [tagInput, setTagInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const tagHints = tagHintsForInput(tags, tagInput);
  const dateFilters = parseExportDateFilters(dateInput);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#1A1A1A] border border-[#323232] rounded-[24px] w-full max-w-[360px] p-5 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-[18px] text-white">Export notes</h3>
          <button type="button" onClick={onClose} className="text-[#A7A7A7] hover:text-white transition-colors p-1.5 bg-[#2D2D2D] hover:bg-[#3E3E3E] rounded-full" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="block text-[12px] text-[#A7A7A7] font-extrabold mb-2">Hashtags</span>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="#idea, #work" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white text-[14px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors" />
            {tagHints.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tagHints.map(tag => (
                  <button key={tag} type="button" onClick={() => setTagInput(prev => replaceLastCsvToken(prev, tag))} className="text-[11px] font-bold text-[#FFD2D7] bg-[#FFD2D7]/[0.08] px-2 py-1 rounded-full">#{tag}</button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="block">
            <span className="block text-[12px] text-[#A7A7A7] font-extrabold mb-2">Dates</span>
            <input value={dateInput} onChange={(e) => setDateInput(e.target.value)} placeholder="22/05/2026, 01/05/2026 - 22/05/2026" className="w-full bg-[#111111] border border-[#323232] rounded-[12px] p-3 text-white text-[14px] outline-none focus:border-[#FFD2D7] placeholder:text-[#555555] transition-colors" />
            {dateInput.trim() ? (
              <div className={`mt-2 text-[11px] font-bold ${dateFilters.length ? "text-[#A7A7A7]" : "text-red-300"}`}>
                {dateFilters.length ? `${dateFilters.length} date filter${dateFilters.length > 1 ? "s" : ""}` : "Use dd/mm/yyyy or dd/mm/yyyy - dd/mm/yyyy"}
              </div>
            ) : null}
          </label>
          <button type="button" onClick={() => onExport({ tagsInput: tagInput, datesInput: dateInput })} className="mt-1 bg-[#FFD2D7] hover:scale-[1.02] active:scale-95 text-black font-bold py-3.5 rounded-[12px] transition-transform flex items-center justify-center gap-2">
            <Download size={17} /> Export
          </button>
        </div>
      </div>
    </div>
  );
}
