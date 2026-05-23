const CURRENT_STATE_VERSION = 5;

function stateVersionOf(value) {
  const version = Number(value?.version || 0);
  return Number.isFinite(version) && version > 0 ? version : 0;
}

function cloneForMigration(value) {
  if (!value || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ...value };
  }
}

function migrateToV5(state) {
  const next = cloneForMigration(state);
  if (!next || typeof next !== "object") return next;
  if (!Array.isArray(next.boxNodes) && Array.isArray(next.nodes)) next.boxNodes = next.nodes;
  if (!Array.isArray(next.boxNodes)) next.boxNodes = [];
  if (!Array.isArray(next.actionDays)) next.actionDays = [];
  if (!Array.isArray(next.notes)) next.notes = [];
  if (!Array.isArray(next.noteLinks)) next.noteLinks = [];
  if (!next.ui || typeof next.ui !== "object" || Array.isArray(next.ui)) next.ui = {};
  if (!next.meta || typeof next.meta !== "object" || Array.isArray(next.meta)) next.meta = {};
  next.version = CURRENT_STATE_VERSION;
  return next;
}

function migrateState(raw) {
  if (!raw || typeof raw !== "object") return raw;
  let next = cloneForMigration(raw);
  const version = stateVersionOf(next);
  if (version < CURRENT_STATE_VERSION) next = migrateToV5(next);
  if (stateVersionOf(next) < CURRENT_STATE_VERSION) next.version = CURRENT_STATE_VERSION;
  return next;
}
