function usePlannerHistory(setDb, syncBeforeSave) {
  const [historyTick, setHistoryTick] = useState(0);
  const undoRef = useRef([]);
  const redoRef = useRef([]);

  function pushHistory(stack, snapshot) {
    stack.push(snapshot);
    if (stack.length > HISTORY_LIMIT) stack.shift();
  }

  function commit(label, mutator, options = {}) {
    setDb(prev => {
      const before = sanitizedState(prev);
      const next = normalizeState(clone(prev));
      const changed = mutator(next);
      if (changed === false) return prev;
      if (options.sync !== false) syncBeforeSave?.(next);
      if (options.history !== false) {
        pushHistory(undoRef.current, before);
        redoRef.current = [];
        setHistoryTick(t => t + 1);
      }
      return markPendingSync(next);
    });
  }

  function undo() {
    if (!undoRef.current.length) return;
    setDb(prev => {
      pushHistory(redoRef.current, sanitizedState(prev));
      const snap = undoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }

  function redo() {
    if (!redoRef.current.length) return;
    setDb(prev => {
      pushHistory(undoRef.current, sanitizedState(prev));
      const snap = redoRef.current.pop();
      setHistoryTick(t => t + 1);
      return markPendingSync(clone(snap));
    });
  }

  return { historyTick, undoRef, redoRef, commit, undo, redo };
}
