-- Kings Hockey Academy: private registration storage with public inquiry submission.
-- Run in Supabase SQL Editor after creating the Supabase project.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.admin_users enable row level security;
revoke all on private.admin_users from public, anon, authenticated;

create or replace function private.is_kha_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admin_users where user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_kha_admin() from public, anon;
grant execute on function private.is_kha_admin() to authenticated;

create table if not exists public.registrations (
  id bigint generated always as identity primary key,
  program_type text not null check (program_type in ('Fall & Winter Camps', 'Spring & Summer Camps', 'Other')),
  player_first text not null check (char_length(player_first) between 1 and 80),
  player_last text not null check (char_length(player_last) between 1 and 80),
  birth_year integer not null check (birth_year between 1900 and 2099),
  guardian_name text not null check (char_length(guardian_name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and position('@' in email) > 1),
  phone text not null check (char_length(phone) between 1 and 40),
  town text check (char_length(town) <= 120),
  experience text check (experience in ('', 'New to hockey', 'Learn to skate / play', 'Recreational', 'Competitive')),
  notes text check (char_length(notes) <= 3000),
  consent boolean not null check (consent),
  created_at timestamptz not null default now()
);

alter table public.registrations enable row level security;
revoke all on public.registrations from public, anon, authenticated;
grant insert (program_type, player_first, player_last, birth_year, guardian_name, email, phone, town, experience, notes, consent) on public.registrations to anon;
grant select, delete on public.registrations to authenticated;
grant usage on sequence public.registrations_id_seq to anon, authenticated;

drop policy if exists "Public can submit registration inquiries" on public.registrations;
create policy "Public can submit registration inquiries"
on public.registrations for insert to anon
with check (
  program_type in ('Fall & Winter Camps', 'Spring & Summer Camps', 'Other')
  and consent is true
  and birth_year between 1900 and extract(year from now())::integer
);

drop policy if exists "Approved admins can view registrations" on public.registrations;
create policy "Approved admins can view registrations"
on public.registrations for select to authenticated
using ((select private.is_kha_admin()));

drop policy if exists "Approved admins can delete registrations" on public.registrations;
create policy "Approved admins can delete registrations"
on public.registrations for delete to authenticated
using ((select private.is_kha_admin()));
