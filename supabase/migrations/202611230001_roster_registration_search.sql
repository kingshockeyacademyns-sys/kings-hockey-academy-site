-- Admin roster search reads parent-submitted registrations and returns only the
-- fields needed to match a registration to a saved family player profile.
-- These are narrow service-role grants; parent/visitor access is unchanged.

alter table public.team_age_group_access
  add column if not exists jersey_number text,
  add column if not exists position text;

grant select (
  id, parent_id, player_id, team_slug, age_group, jersey_number, position, granted_at
) on public.team_age_group_access to service_role;

grant select (
  id, family_user_id, program_id, program_type, player_first, player_last,
  date_of_birth, birth_year, guardian_name, email, created_at
) on public.registrations to service_role;

grant select (
  id, parent_id, first_name, last_name, date_of_birth
) on public.parent_children to service_role;

grant select (
  id, title, season
) on public.programs to service_role;

grant select (
  user_id, first_name, last_name
) on public.parent_profiles to service_role;
