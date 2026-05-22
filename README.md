# Liem's Planner

Static single-page planner app with Supabase Auth, cloud sync, export/import JSON, PWA support, Boxes, Actions, notes, and daily action timelines.

## Production Files

- `index.html` - main app entry for GitHub Pages.
- `assets/app.js`, `assets/styles.css` - built local runtime assets.
- `vendor/` - pinned local React, ReactDOM, and Supabase browser bundles.
- `src/app.jsx`, `src/styles.css` - editable source files.
- `scripts/build-js.mjs`, `package.json` - rebuild tooling.
- `manifest.json` - Add to Home / PWA metadata.
- `sw.js` - offline app shell cache.
- `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` - PWA/app icons.
- `supabase_schema.sql` - Supabase schema and RLS policies.

## Build

Runtime no longer depends on browser Babel or Tailwind CDN, and the build uses pinned local dev dependencies from `package-lock.json`. After editing source files:

```bash
npm install
npm run build
```

## Deploy

Upload this folder to GitHub Pages. The site should open at `/` and the PWA `start_url` is also `/`.

Existing Supabase projects should keep `idea_box_states` as the source of truth and may also run the note mirror tables in `supabase_schema.sql` (`idea_notes`, `idea_note_links`, `idea_note_events`). Older `idea_box_action_days` tables can remain, but the app no longer reads or writes them.

## Offline Sync

Local edits are saved immediately to `localStorage` and marked with `meta.pendingSync`.
When the app comes back online, pending local snapshots are pushed to Supabase.
On startup, pending or newer local data wins over older cloud data, so offline edits made from the Home Screen app are not overwritten by a stale cloud snapshot.
The normalized note tables are a mirror for future querying/export. If that mirror fails, `idea_box_states` still holds the full app snapshot.

## Internal Routes

The app uses hash routes so GitHub Pages refreshes safely without server fallback config.

- `#/boxes?view=active&range=today&showDays=1`
- `#/boxes?view=done&range=custom&from=2026-05-01&to=2026-05-21&showDays=0`
- `#/actions?date=2026-05-21&filter=all`
- `#/notes?view=free&tags=idea,work&dates=22%2F05%2F2026%2C+01%2F05%2F2026+-+22%2F05%2F2026`
- `#/search?tab=boxes&q=launch&view=active&range=all&showDays=1`
- `#/search?tab=actions&q=launch&date=2026-05-21&filter=notes`
- `#/search?tab=notes&q=idea&view=all&tags=idea`

Unknown hashes fall back to Boxes. Modals are intentionally not routed because they are transient UI state.
