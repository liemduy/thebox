function normalizeTableDimension(value, fallback, max) {
  const parsed = Number.parseInt(String(value || "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function useNoteTablePanel(toolbarState, runEditorCommandAfterFocus) {
  const tablePanelActionRef = useRef(0);
  const [tablePanel, setTablePanel] = useState(null);
  const [tableRows, setTableRows] = useState("2");
  const [tableCols, setTableCols] = useState("2");

  function openTablePanel() {
    setTablePanel(prev => {
      const nextType = toolbarState.table ? "actions" : "insert";
      return prev === nextType ? null : nextType;
    });
  }

  function updateTableDimension(setter) {
    return (event) => setter(event.target.value.replace(/\D/g, "").slice(0, 2));
  }

  function settleTableDimension(setter, value, fallback, max) {
    setter(String(normalizeTableDimension(value, fallback, max)));
  }

  function insertCustomTable() {
    const options = {
      rows: normalizeTableDimension(tableRows, 2, 12),
      cols: normalizeTableDimension(tableCols, 2, 8)
    };
    setTableRows(String(options.rows));
    setTableCols(String(options.cols));
    setTablePanel(null);
    runEditorCommandAfterFocus("insert-table", options);
  }

  function submitCustomTable(event) {
    event.preventDefault();
    event.stopPropagation();
    insertCustomTable();
  }

  function runTableCommand(command) {
    setTablePanel(null);
    runEditorCommandAfterFocus(command);
  }

  function runTablePanelAction(event, action) {
    event.preventDefault();
    event.stopPropagation();
    const stamp = Date.now();
    if (stamp - tablePanelActionRef.current < 500) return;
    tablePanelActionRef.current = stamp;
    action();
  }

  function tablePanelButtonProps(action) {
    return {
      onPointerDown: (event) => runTablePanelAction(event, action),
      onMouseDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      onTouchEnd: (event) => runTablePanelAction(event, action),
      onKeyDown: (event) => {
        if (event.key === "Enter" || event.key === " ") runTablePanelAction(event, action);
      },
      onTouchStart: (event) => {
        event.stopPropagation();
      },
      onClick: (event) => runTablePanelAction(event, action),
      tabIndex: -1
    };
  }

  return {
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
  };
}
