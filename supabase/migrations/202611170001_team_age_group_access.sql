create table if not exists public.team_age_group_access (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  team_slug text not null check (team_slug in (
    'nova-scotia-kings',
    'nova-scotia-vipers',
    'quebec-predators',
    'montreal-sentinels'
  )),
  age_group text not null check (age_group in ('U9', 'U11', 'U13', 'U15')),
  granted_by uuid not null default auth.uid() references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (parent_id, team_slug, age_group)
);

alter table public.team_age_group_access enable row level security;

create policy "Families can view their own team age group access"
on public.team_age_group_access
for select
to authenticated
using (parent_id = (select auth.uid()));

create policy "Admins can view all team age group access"
on public.team_age_group_access
for select
to authenticated
using ((select private.is_kha_admin()));

create policy "Admins can grant team age group access"
on public.team_age_group_access
for insert
to authenticated
with check ((select private.is_kha_admin()));

create policy "Admins can revoke team age group access"
on public.team_age_group_access
for delete
to authenticated
using ((select private.is_kha_admin()));

grant select, insert, delete on public.team_age_group_access to authenticated;
revoke all on public.team_age_group_access from anon;
