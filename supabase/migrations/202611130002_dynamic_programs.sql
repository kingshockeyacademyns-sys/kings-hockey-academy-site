-- Admin-managed programs with public registration inquiries.

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  season text check (char_length(season) <= 60),
  description text check (char_length(description) <= 1600),
  dates text check (char_length(dates) <= 160),
  location text check (char_length(location) <= 160),
  age_groups text check (char_length(age_groups) <= 160),
  fee text check (char_length(fee) <= 80),
  questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array' and jsonb_array_length(case when jsonb_typeof(questions) = 'array' then questions else '[]'::jsonb end) <= 12),
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.programs enable row level security;
revoke all on public.programs from public, anon, authenticated;
grant select on public.programs to anon, authenticated;
grant insert, update, delete on public.programs to authenticated;

drop policy if exists "Visitors can view open programs" on public.programs;
drop policy if exists "Admins can view all programs" on public.programs;
create policy "Visitors can view open programs"
on public.programs for select to anon
using (is_open);

create policy "Admins can view all programs"
on public.programs for select to authenticated
using (is_open or (select private.is_kha_admin()));

drop policy if exists "Approved admins can create programs" on public.programs;
create policy "Approved admins can create programs"
on public.programs for insert to authenticated
with check ((select private.is_kha_admin()));

drop policy if exists "Approved admins can update programs" on public.programs;
create policy "Approved admins can update programs"
on public.programs for update to authenticated
using ((select private.is_kha_admin()))
with check ((select private.is_kha_admin()));

drop policy if exists "Approved admins can delete programs" on public.programs;
create policy "Approved admins can delete programs"
on public.programs for delete to authenticated
using ((select private.is_kha_admin()));

alter table public.registrations drop constraint if exists registrations_program_type_check;
alter table public.registrations
  add column if not exists program_id uuid references public.programs(id) on delete set null,
  add column if not exists custom_answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(custom_answers) = 'object' and octet_length(custom_answers::text) <= 16000);

grant insert (program_id, custom_answers) on public.registrations to anon;

drop policy if exists "Public can submit registration inquiries" on public.registrations;
create policy "Public can submit registration inquiries"
on public.registrations for insert to anon
with check (
  consent is true
  and birth_year between 1900 and extract(year from now())::integer
  and (
    (program_id is null and program_type in ('Fall & Winter Camps', 'Spring & Summer Camps', 'Other'))
    or (
      program_id is not null
      and exists (
        select 1 from public.programs p
        where p.id = registrations.program_id
          and p.is_open
          and p.title = registrations.program_type
      )
    )
  )
);
