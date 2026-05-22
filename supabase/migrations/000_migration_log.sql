begin;

create table if not exists public.idea_schema_migrations (
  version text primary key,
  description text not null default '',
  applied_at timestamptz not null default now()
);

alter table public.idea_schema_migrations enable row level security;

insert into public.idea_schema_migrations(version, description)
values ('000_migration_log', 'Create migration tracking table')
on conflict (version) do update
set description = excluded.description,
    applied_at = public.idea_schema_migrations.applied_at;

commit;
