begin;

create table if not exists public.idea_schema_migrations (
  version text primary key,
  description text not null default '',
  applied_at timestamptz not null default now()
);

alter table public.idea_schema_migrations enable row level security;

create table if not exists public.idea_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null default '',
  body_html text not null default '',
  body_text text not null default '',
  note_date date not null default current_date,
  tags text[] not null default '{}',
  pinned_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.idea_note_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  note_id text not null,
  link_type text not null check (link_type in ('box', 'action_node', 'action_entry', 'day')),
  box_node_id text,
  action_date date,
  action_node_id text,
  action_entry_id text,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, note_id)
    references public.idea_notes(user_id, id)
    on delete cascade
);

create table if not exists public.idea_note_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id bigserial primary key,
  note_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.idea_notes enable row level security;
alter table public.idea_note_links enable row level security;
alter table public.idea_note_events enable row level security;

drop trigger if exists set_idea_notes_updated_at on public.idea_notes;
create trigger set_idea_notes_updated_at
before update on public.idea_notes
for each row
execute function public.set_idea_box_updated_at();

create index if not exists idea_notes_user_date_idx
on public.idea_notes(user_id, note_date desc)
where deleted_at is null;

create index if not exists idea_notes_user_updated_idx
on public.idea_notes(user_id, updated_at desc);

create index if not exists idea_notes_tags_idx
on public.idea_notes using gin(tags);

create index if not exists idea_note_links_note_idx
on public.idea_note_links(user_id, note_id);

create index if not exists idea_note_links_box_idx
on public.idea_note_links(user_id, box_node_id)
where box_node_id is not null;

create index if not exists idea_note_links_action_idx
on public.idea_note_links(user_id, action_date, action_node_id, action_entry_id)
where action_date is not null;

drop policy if exists "idea_notes_select_own" on public.idea_notes;
drop policy if exists "idea_notes_insert_own" on public.idea_notes;
drop policy if exists "idea_notes_update_own" on public.idea_notes;
drop policy if exists "idea_notes_delete_own" on public.idea_notes;

create policy "idea_notes_select_own"
on public.idea_notes
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "idea_notes_insert_own"
on public.idea_notes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "idea_notes_update_own"
on public.idea_notes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "idea_notes_delete_own"
on public.idea_notes
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "idea_note_links_select_own" on public.idea_note_links;
drop policy if exists "idea_note_links_insert_own" on public.idea_note_links;
drop policy if exists "idea_note_links_update_own" on public.idea_note_links;
drop policy if exists "idea_note_links_delete_own" on public.idea_note_links;

create policy "idea_note_links_select_own"
on public.idea_note_links
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "idea_note_links_insert_own"
on public.idea_note_links
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "idea_note_links_update_own"
on public.idea_note_links
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "idea_note_links_delete_own"
on public.idea_note_links
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "idea_note_events_select_own" on public.idea_note_events;
drop policy if exists "idea_note_events_insert_own" on public.idea_note_events;
drop policy if exists "idea_note_events_update_own" on public.idea_note_events;
drop policy if exists "idea_note_events_delete_own" on public.idea_note_events;

create policy "idea_note_events_select_own"
on public.idea_note_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "idea_note_events_insert_own"
on public.idea_note_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "idea_note_events_update_own"
on public.idea_note_events
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "idea_note_events_delete_own"
on public.idea_note_events
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.idea_notes to authenticated;
grant select, insert, update, delete on public.idea_note_links to authenticated;
grant select, insert, update, delete on public.idea_note_events to authenticated;
grant usage, select on sequence public.idea_note_events_id_seq to authenticated;

insert into public.idea_schema_migrations(version, description)
values ('002_notes_mirror', 'Create normalized notes mirror tables')
on conflict (version) do update
set description = excluded.description,
    applied_at = public.idea_schema_migrations.applied_at;

commit;
