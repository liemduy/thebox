function usePlannerHistory(setDb, syncBeforeSave) {
  const [historyTick, setHistoryTick] = useState(0);
  const undoRef = useRef([]);
  const redoRef = useRef([]);

  function commit(label, mutator, options = {}) {
    setDb(prev => {
      const before = sanitizedState(prev);
      const next = normalizeState(clone(prev));
      const changed = mutator(next);
      if (changed === false) return prev;
      if (options.sync !== false) syncBeforeSave?.(next);
      undoRef.current.push(before);
      if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
      redoRef.current = [];
      setHistoryTick(t => t + 1);
      return markPendingSync(next);
    });
  }

  function undo() {
    if (!undoRef.current.length) return;
    setDb(prev => {
      redoRef.current.push(sanitizedState(prev));
      const snap = undoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }

  function redo() {
    if (!redoRef.current.length) return;
    setDb(prev => {
      undoRef.current.push(sanitizedState(prev));
      const snap = redoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }

  return { historyTick, undoRef, redoRef, commit, undo, redo };
}
