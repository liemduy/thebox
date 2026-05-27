const iconPaths = {
  MoreHorizontal: (<><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>),
  User: (<><path d="M19 21a7 7 0 0 0-14 0"/><circle cx="12" cy="8" r="4"/></>),
  GripVertical: (<><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>),
  ChevronRight: (<path d="m9 18 6-6-6-6"/>),
  ChevronDown: (<path d="m6 9 6 6 6-6"/>),
  ChevronsRight: (<><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></>),
  ChevronsDown: (<><path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/></>),
  ChevronLeft: (<path d="m15 18-6-6 6-6"/>),
  Plus: (<path d="M5 12h14M12 5v14"/>),
  Check: (<path d="M20 6 9 17l-5-5"/>),
  Search: (<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>),
  Undo2: (<><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>),
  Redo2: (<><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></>),
  PlusSquare: (<><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8M12 8v8"/></>),
  FileText: (<><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></>),
  Notebook: (<><path d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 2v20M8 6H4M8 10H4M8 14H4M8 18H4M12 7h4M12 11h4"/></>),
  MapPin: (<><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0"/><circle cx="12" cy="10" r="3"/></>),
  Archive: (<><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/></>),
  CheckCircle: (<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></>),
  Trash2: (<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></>),
  X: (<path d="M18 6 6 18M6 6l12 12"/>),
  CalendarDays: (<><path d="M8 2v4M16 2v4M3 10h18"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></>),
  Smile: (<><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></>),
  ClipboardList: (<><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/></>),
  CheckSquare: (<><path d="M8 12.5 10.5 15 16 9"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/></>),
  Table2: (<><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M10 4.5v15M16 4.5v15"/></>),
  Bold: (<><path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/></>),
  Italic: (<><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></>),
  Underline: (<><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="22" y2="22"/></>),
  Indent: (<><path d="M21 6H11M21 12H11M21 18H11M7 8l-4 4 4 4"/></>),
  IndentIncrease: (<><path d="M21 6H11M21 12H11M21 18H11M3 8l4 4-4 4"/></>),
  Quote: (<><path d="M6 5v14"/><path d="M11 8h8"/><path d="M11 12h6"/><path d="M11 16h8"/></>),
  List: (<><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></>),
  Download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></>),
  Upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></>),
  LogOut: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></>)
};

function makeIcon(name) {
  return function Icon({ size = 24, strokeWidth = 2, className = "", ...props }) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        {iconPaths[name]}
      </svg>
    );
  };
}

const MoreHorizontal = makeIcon("MoreHorizontal");
const User = makeIcon("User");
const GripVertical = makeIcon("GripVertical");
const ChevronRight = makeIcon("ChevronRight");
const ChevronDown = makeIcon("ChevronDown");
const ChevronsRight = makeIcon("ChevronsRight");
const ChevronsDown = makeIcon("ChevronsDown");
const ChevronLeft = makeIcon("ChevronLeft");
const Plus = makeIcon("Plus");
const Check = makeIcon("Check");
const Search = makeIcon("Search");
const Undo2 = makeIcon("Undo2");
const Redo2 = makeIcon("Redo2");
const PlusSquare = makeIcon("PlusSquare");
const FileText = makeIcon("FileText");
const Notebook = makeIcon("Notebook");
const MapPin = makeIcon("MapPin");
const Archive = makeIcon("Archive");
const CheckCircle = makeIcon("CheckCircle");
const Trash2 = makeIcon("Trash2");
const X = makeIcon("X");
const CalendarDays = makeIcon("CalendarDays");
const Smile = makeIcon("Smile");
const ClipboardList = makeIcon("ClipboardList");
const CheckSquare = makeIcon("CheckSquare");
const Table2 = makeIcon("Table2");
const Bold = makeIcon("Bold");
const Italic = makeIcon("Italic");
const Underline = makeIcon("Underline");
const Indent = makeIcon("Indent");
const IndentIncrease = makeIcon("IndentIncrease");
const Quote = makeIcon("Quote");
const List = makeIcon("List");
const Download = makeIcon("Download");
const Upload = makeIcon("Upload");
const LogOut = makeIcon("LogOut");
