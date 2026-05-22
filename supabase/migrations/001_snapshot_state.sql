begin;

create table if not exists public.idea_schema_migrations (
  version text primary key,
  description text not null default '',
  applied_at timestamptz not null default now()
);

alter table public.idea_schema_migrations enable row level security;

create table if not exists public.idea_box_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":5,"boxNodes":[],"actionDays":[],"notes":[],"noteLinks":[],"ui":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.idea_box_states enable row level security;

create or replace function public.set_idea_box_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_idea_box_states_updated_at on public.idea_box_states;
create trigger set_idea_box_states_updated_at
before update on public.idea_box_states
for each row
execute function public.set_idea_box_updated_at();

drop policy if exists "idea_box_select_own" on public.idea_box_states;
drop policy if exists "idea_box_insert_own" on public.idea_box_states;
drop policy if exists "idea_box_update_own" on public.idea_box_states;
drop policy if exists "idea_box_delete_own" on public.idea_box_states;

create policy "idea_box_select_own"
on public.idea_box_states
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "idea_box_insert_own"
on public.idea_box_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "idea_box_update_own"
on public.idea_box_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "idea_box_delete_own"
on public.idea_box_states
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.idea_box_states to authenticated;

insert into public.idea_schema_migrations(version, description)
values ('001_snapshot_state', 'Create planner snapshot source of truth')
on conflict (version) do update
set description = excluded.description,
    applied_at = public.idea_schema_migrations.applied_at;

commit;
