# Technical Hardening Audit

This release keeps UI/UX behavior stable and hardens the app internals.

## State Invariants

- `idea_box_states.data` is the cloud source of truth.
- Local storage is written before cloud sync is attempted.
- `boxNodes` owns the box tree; `actionDays[].nodes` are day snapshots linked by `sourceBoxNodeId`.
- Root box actions and sub-box actions remain separate entries.
- Linked note mirrors use deterministic ids:
  - `boxnote_<boxId>`
  - `actionnote_<entryId>`
- Deleting a linked note must update `deletedAt`, `updatedAt`, and `clientUpdatedAt`.
- `noteLinks` must not point at missing notes, boxes, action nodes, or action entries.

## Refactor Boundaries

- `src/app.jsx` remains the app composition layer.
- `src/appHooks.jsx` owns undo/redo history orchestration.
- `src/sync/cloudState.js` owns Supabase snapshot read/write calls.
- `src/sync/syncState.js` owns sync status normalization and stuck-save recovery.
- `src/state/integrity.js` owns orphan note/link repair.
- `src/ui/noteEditorTableState.jsx` owns table panel/editor command plumbing.

## Release Safety

Before push:

1. `npm run verify`
2. Local app smoke test
3. Git status clean except intended changes
4. Service worker cache/build id bumped when runtime assets change
5. GitHub Pages checked after push
