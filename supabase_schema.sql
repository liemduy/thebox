create table if not exists public.idea_box_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":4,"boxNodes":[],"actionDays":[],"ui":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- idea_box_states.data is the single cloud source of truth.
-- Older deployments may still have public.idea_box_action_days, but the app no longer reads or writes it.

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

alter table public.idea_box_states enable row level security;

drop policy if exists "idea_box_select_own" on public.idea_box_states;
drop policy if exists "idea_box_insert_own" on public.idea_box_states;
drop policy if exists "idea_box_update_own" on public.idea_box_states;
drop policy if exists "idea_box_delete_own" on public.idea_box_states;

create policy "idea_box_select_own"
on public.idea_box_states
for select
to authenticated
using (auth.uid() = user_id);

create policy "idea_box_insert_own"
on public.idea_box_states
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "idea_box_update_own"
on public.idea_box_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "idea_box_delete_own"
on public.idea_box_states
for delete
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.idea_box_states to authenticated;
