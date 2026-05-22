function MenuItem({ icon, label, danger = false, accent = false, divider = false, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2.5 px-3 py-2.5 text-[14px] text-left transition-colors w-full ${divider ? "border-b border-[#3E3E3E]" : ""} ${danger ? "text-red-400 hover:bg-[#3E3E3E] hover:text-red-300 font-medium" : accent ? "text-[#FFD2D7] hover:bg-[#3E3E3E] font-bold" : "text-white hover:bg-[#3E3E3E]"}`}>
      <span className={danger || accent ? "" : "text-[#A7A7A7]"}>{icon}</span>
      {label}
    </button>
  );
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHashtagSegments(text, keyPrefix = "tag") {
  const source = String(text || "");
  const pieces = [];
  const regex = /(^|[^\p{L}\p{N}_-])#([\p{L}\p{N}_-]{1,48})/gu;
  let last = 0;
  let match;
  while ((match = regex.exec(source))) {
    const tagStart = match.index + match[1].length;
    const tagEnd = tagStart + match[2].length + 1;
    if (tagStart > last) pieces.push(source.slice(last, tagStart));
    pieces.push(<span key={`${keyPrefix}-${tagStart}`} className="text-[#FFD2D7] font-bold">#{match[2]}</span>);
    last = tagEnd;
  }
  if (last < source.length) pieces.push(source.slice(last));
  return pieces.length ? pieces : source;
}

function caretTextOffset(root) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !root?.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function restoreCaretTextOffset(root, offset) {
  if (!root || offset === null || offset === undefined) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function unwrapLiveHashtagSpans(root) {
  root?.querySelectorAll?.("span.note-hashtag").forEach(span => {
    span.replaceWith(document.createTextNode(span.textContent || ""));
  });
  root?.normalize?.();
}

function wrapHashtagsInTextNode(node) {
  const source = node.textContent || "";
  const regex = /(^|[^\p{L}\p{N}_-])#([\p{L}\p{N}_-]{1,48})/gu;
  let match;
  let last = 0;
  const fragment = document.createDocumentFragment();
  let changed = false;
  while ((match = regex.exec(source))) {
    const tagStart = match.index + match[1].length;
    const tagEnd = tagStart + match[2].length + 1;
    if (tagStart > last) fragment.appendChild(document.createTextNode(source.slice(last, tagStart)));
    const span = document.createElement("span");
    span.className = "note-hashtag";
    span.textContent = source.slice(tagStart, tagEnd);
    fragment.appendChild(span);
    last = tagEnd;
    changed = true;
  }
  if (!changed) return;
  if (last < source.length) fragment.appendChild(document.createTextNode(source.slice(last)));
  node.replaceWith(fragment);
}

function highlightEditableHashtags(root) {
  if (!root) return;
  const offset = caretTextOffset(root);
  unwrapLiveHashtagSpans(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.includes("#") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  nodes.forEach(wrapHashtagsInTextNode);
  restoreCaretTextOffset(root, offset);
}

function HighlightText({ text, query, className = "" }) {
  const source = String(text || "");
  const term = String(query || "").trim();
  if (!term) return <span className={className}>{renderHashtagSegments(source)}</span>;
  const parts = source.split(new RegExp(`(${escapeRegExp(term)})`, "ig"));
  return (
    <span className={className}>
      {parts.map((part, index) => part.toLowerCase() === term.toLowerCase()
        ? <mark key={index} className="search-hit bg-transparent">{part}</mark>
        : <React.Fragment key={index}>{renderHashtagSegments(part, `tag-${index}`)}</React.Fragment>
      )}
    </span>
  );
}

function searchKindLabel(kind) {
  if (kind === "act") return "Act";
  return kind === "box" ? "Box" : "Note";
}

function SearchPanel({ isOpen, query, setQuery, results, filters, onToggleFilter, onOpenResult }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className={`bg-[#111111] border-b border-[#333333] overflow-hidden transition-all duration-300 ease-in-out z-30 relative ${isOpen ? "max-h-80 opacity-100 py-3 px-5" : "max-h-0 opacity-0 py-0 px-5 border-transparent"}`}>
      <div className="flex items-center bg-[#0a0a0a] rounded-full px-3 py-1.5 border border-[#333333] focus-within:border-[#FFD2D7] transition-colors">
        <Search size={16} className="text-[#A7A7A7] mr-2" />
        <input type="text" placeholder="Search boxes, actions, notes..." value={query} onChange={(e) => setQuery(e.target.value)} className="bg-transparent border-none outline-none text-white text-[14px] w-full placeholder:text-[#666666]" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        {[["box", "Box"], ["action", "Act"], ["note", "Note"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onToggleFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-colors ${filters?.[key] !== false ? "bg-[#FFD2D7] text-black" : "border border-[#444444] text-[#A7A7A7] hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {query.trim() && (
        <div className="mt-3 max-h-44 overflow-auto thin-scroll flex flex-col gap-1">
          {results.length ? results.map(result => (
            <button key={result.id} type="button" onClick={() => onOpenResult(result)} className="text-left px-3 py-2 rounded-xl hover:bg-[#1A1A1A] transition-colors">
              <span className="text-[11px] uppercase tracking-wider text-[#FFD2D7] font-extrabold">{searchKindLabel(result.kind)}{result.meta ? <span className="text-[#777] normal-case tracking-normal font-bold"> - {result.meta}</span> : null}</span>
              <strong className="block text-[14px] text-white truncate"><HighlightText text={result.title} query={query} /></strong>
              {result.text ? <em className="block text-[12px] text-[#A7A7A7] not-italic truncate"><HighlightText text={result.text} query={query} /></em> : null}
            </button>
          )) : <div className="text-[#A7A7A7] text-[13px] px-3 py-2">No results.</div>}
        </div>
      )}
    </div>
  );
}
