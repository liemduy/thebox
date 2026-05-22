# Source Map

`app.jsx` is now the app composer: state hooks, command handlers, and panel wiring.

- `config.js` - runtime constants, Supabase client, shared core destructuring, timeout helper.
- `core.js` - route helpers and pure data helpers that also run in Node tests.
- `state/schema.js` - state normalization, IDs, metadata, and state sync markers.
- `state/actions.js` - action-day syncing and global search collection.
- `state/notes.js` - note labels, hashtag/date filters, note grouping, and legacy note sync.
- `sync/localStore.js` - localStorage keys, load/save, legacy fallback, snapshot size warning.
- `sync/noteMirror.js` - Supabase normalized notes/link mirror read and upsert/prune.
- `ui/icons.jsx` - inline icon system.
- `ui/search.jsx` - global search UI and highlighted text rendering.
- `ui/notes.jsx` - Notes panel, note cards, view-by filter, AI export modal.
- `ui/boxes.jsx` - Boxes tree, box menus, and box action timeline UI.
- `ui/actions.jsx` - Actions tree and action/note entry rows.
- `ui/modals.jsx` - rich note editor and action-lines modal.
- `ui/auth.jsx` - auth screen.
- `components/header.jsx` - app header and account/tools menu.
