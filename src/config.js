const { useEffect, useMemo, useRef, useState } = React;

const SUPABASE_URL = "https://mmtvezpwflqbpkilkooy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bvZguwM4vs7ZNPr9XRCcxw_gMm1DZpU";
const STORAGE_KEY = "idea-box-html-v13-action-notes";
const STATE_TABLE = "idea_box_states";
const NOTES_TABLE = "idea_notes";
const NOTE_LINKS_TABLE = "idea_note_links";
const APP_BUILD_ID = "2026-05-24-numbered-list-shortcut-1";
const APP_CACHE_NAME = "idea-box-v90-numbered-list-shortcut";
const FORCE_LOCAL_MODE = new URLSearchParams(window.location.search).has("local");
const LEGACY_KEYS = [
  "idea-box-html-v12-stable-ids",
  "idea-box-html-v10-action-days-db",
  "idea-box-html-v9-supabase",
  "idea-box-html-v8-supabase",
  "idea-box-html-v7-supabase",
  "idea-box-html-v6-actions",
  "idea-box-html-v4-clean-box",
  "idea-box-html-v3-inline-delete",
  "idea-box-html-v2-inline-format"
];

const sb = !FORCE_LOCAL_MODE && window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

const CLOUD_READ_TIMEOUT_MS = 9000;
const CLOUD_WRITE_TIMEOUT_MS = 12000;
const SNAPSHOT_WARN_BYTES = 3_500_000;
let lastSnapshotSizeWarningAt = 0;
const {
  todayYMD,
  addDaysYMD,
  displayDate,
  daysFromToday,
  normalizeModeMap,
  validYMD,
  createBackupEnvelope,
  readBackupEnvelope,
  BACKUP_VERSION,
  parseRouteHash,
  routeView,
  buildAppHash,
  childrenOf,
  getNode,
  ancestorsOf,
  descendantsOf,
  rootOf,
  pathOf,
  boxIsArchived,
  boxIsDone,
  boxIsInactive,
  entriesFor,
  actionEntriesFor,
  noteEntriesFor,
  progressForNodes,
  boxRoots,
  vaultRoots,
  shouldShowChildInView,
  isBoxOpen,
  setBoxOpen,
  isActionOpen,
  setActionOpen,
  visibleEntriesFor,
  hasVisibleAction,
  dateInBoxFilter,
  rootHasEntriesOnDay,
  summariesForRoot,
  actionTimelineForBox,
  cascadeMaxDepth,
  cascadeOpenDepth,
  applyCascadeDepth,
  cascadePlan
} = window.LiemsPlannerCore;

function withTimeout(promise, ms, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timerId));
}
