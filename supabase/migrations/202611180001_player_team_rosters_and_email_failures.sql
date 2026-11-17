-- Team access is a player roster entry. Keep existing family-wide grants for
-- audit, but they do not authorize a player until an admin assigns that player.
alter table public.team_age_group_access
  add column if not exists player_id uuid;

alter table public.team_age_group_access
  drop constraint if exists team_age_group_access_parent_id_team_slug_age_group_key;

create unique index if not exists parent_children_id_parent_id_key
  on public.parent_children (id, parent_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_age_group_access_player_parent_fkey'
      and conrelid = 'public.team_age_group_access'::regclass
  ) then
    alter table public.team_age_group_access
      add constraint team_age_group_access_player_parent_fkey
      foreign key (player_id, parent_id)
      references public.parent_children (id, parent_id)
      on delete cascade;
  end if;
end;
$$;

create unique index if not exists team_age_group_access_player_team_key
  on public.team_age_group_access (player_id, team_slug)
  where player_id is not null;

create index if not exists team_age_group_access_player_idx
  on public.team_age_group_access (player_id, team_slug, age_group)
  where player_id is not null;

grant select (id, parent_id, player_id, team_slug, age_group, granted_at)
  on public.team_age_group_access to service_role;

drop policy if exists "Families can view their own team age group access" on public.team_age_group_access;
create policy "Families can view their own player roster entries"
on public.team_age_group_access
for select
to authenticated
using (
  player_id is not null
  and parent_id = (select auth.uid())
);

drop policy if exists "Admins can grant team age group access" on public.team_age_group_access;
create policy "Admins can add players to rosters"
on public.team_age_group_access
for insert
to authenticated
with check (
  (select private.is_kha_admin())
  and player_id is not null
);

-- Failed mail is visible to admins and is not confused with a cancelled request.
alter table public.registration_approval_requests
  drop constraint if exists registration_approval_requests_status_check;
alter table public.registration_approval_requests
  add constraint registration_approval_requests_status_check
  check (status in ('pending', 'approved', 'expired', 'cancelled', 'email_failed'));
