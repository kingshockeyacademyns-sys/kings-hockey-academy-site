-- Add program schedule fields and enforce the optional registration deadline.
alter table public.programs
  add column if not exists registration_closes_on date,
  add column if not exists session_schedule text check (session_schedule is null or char_length(session_schedule) <= 160),
  add column if not exists session_count integer check (session_count is null or session_count between 1 and 1000),
  add column if not exists single_session_available boolean not null default false;

drop policy if exists "Visitors can view open programs" on public.programs;
create policy "Visitors can view open programs"
on public.programs for select to anon
using (
  is_open
  and (registration_closes_on is null or registration_closes_on >= (now() at time zone 'America/Halifax')::date)
);

drop policy if exists "Admins can view all programs" on public.programs;
create policy "Admins can view all programs"
on public.programs for select to authenticated
using (
  (
    is_open
    and (registration_closes_on is null or registration_closes_on >= (now() at time zone 'America/Halifax')::date)
  )
  or (select private.is_kha_admin())
);

-- A restrictive policy adds deadline enforcement to both existing public and
-- signed-in registration checks without weakening their other validation rules.
drop policy if exists "Registration must be before program deadline" on public.registrations;
create policy "Registration must be before program deadline"
on public.registrations as restrictive for insert to anon
with check (
  program_id is null
  or exists (
    select 1
    from public.programs p
    where p.id = registrations.program_id
      and (p.registration_closes_on is null or p.registration_closes_on >= (now() at time zone 'America/Halifax')::date)
  )
);

drop policy if exists "Signed-in registration must be before program deadline" on public.registrations;
create policy "Signed-in registration must be before program deadline"
on public.registrations as restrictive for insert to authenticated
with check (
  (select private.is_kha_admin())
  or program_id is null
  or exists (
    select 1
    from public.programs p
    where p.id = registrations.program_id
      and (p.registration_closes_on is null or p.registration_closes_on >= (now() at time zone 'America/Halifax')::date)
  )
);
