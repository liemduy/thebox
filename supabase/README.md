# Supabase Migrations

Run these files in order from the Supabase SQL editor when setting up or upgrading the cloud schema.

1. `migrations/000_migration_log.sql`
2. `migrations/001_snapshot_state.sql`
3. `migrations/002_notes_mirror.sql`

The files are idempotent: running them again should refresh policies/triggers without duplicating data. Supabase may still show a warning because the scripts create or alter tables and policies; every client-facing table in these migrations has Row Level Security enabled.

For a brand-new project, `../supabase_schema.sql` remains the one-file equivalent. Prefer migrations for ongoing upgrades.
