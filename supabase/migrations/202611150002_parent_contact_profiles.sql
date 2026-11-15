-- Save the adult contact details used by registrations on each family account.
create table if not exists public.parent_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  phone text not null check (char_length(btrim(phone)) between 1 and 40),
  street_number text not null check (char_length(btrim(street_number)) between 1 and 300),
  postal_code text not null check (char_length(btrim(postal_code)) between 1 and 16),
  province text not null check (char_length(btrim(province)) between 1 and 80),
  second_guardian_first text,
  second_guardian_last text,
  second_guardian_email text,
  second_guardian_phone text,
  second_guardian_street_number text,
  second_guardian_postal_code text,
  second_guardian_province text,
  emergency_name text not null check (char_length(btrim(emergency_name)) between 1 and 120),
  emergency_relationship text not null check (char_length(btrim(emergency_relationship)) between 1 and 80),
  emergency_phone text not null check (char_length(btrim(emergency_phone)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_profiles_second_guardian_complete check (
    (second_guardian_first is null and second_guardian_last is null and second_guardian_email is null and second_guardian_phone is null and second_guardian_street_number is null and second_guardian_postal_code is null and second_guardian_province is null)
    or
    (nullif(btrim(second_guardian_first), '') is not null and nullif(btrim(second_guardian_last), '') is not null and nullif(btrim(second_guardian_email), '') is not null and nullif(btrim(second_guardian_phone), '') is not null and nullif(btrim(second_guardian_street_number), '') is not null and nullif(btrim(second_guardian_postal_code), '') is not null and nullif(btrim(second_guardian_province), '') is not null)
  )
);

alter table public.parent_profiles enable row level security;
revoke all on public.parent_profiles from public, anon, authenticated;
grant select, insert, update on public.parent_profiles to authenticated;

drop policy if exists "Parents can view their own contact profile" on public.parent_profiles;
create policy "Parents can view their own contact profile"
on public.parent_profiles for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Parents can create their own contact profile" on public.parent_profiles;
create policy "Parents can create their own contact profile"
on public.parent_profiles for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Parents can update their own contact profile" on public.parent_profiles;
create policy "Parents can update their own contact profile"
on public.parent_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.create_parent_contact_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  first_name text := nullif(btrim(meta ->> 'profile_first_name'), '');
  last_name text := nullif(btrim(meta ->> 'profile_last_name'), '');
  phone text := nullif(btrim(meta ->> 'profile_phone'), '');
  street_number text := nullif(btrim(meta ->> 'profile_street_number'), '');
  postal_code text := nullif(btrim(meta ->> 'profile_postal_code'), '');
  province text := nullif(btrim(meta ->> 'profile_province'), '');
  emergency_name text := nullif(btrim(meta ->> 'profile_emergency_name'), '');
  emergency_relationship text := nullif(btrim(meta ->> 'profile_emergency_relationship'), '');
  emergency_phone text := nullif(btrim(meta ->> 'profile_emergency_phone'), '');
begin
  -- Do not block older clients that create an account without profile metadata.
  if first_name is not null and last_name is not null and phone is not null and street_number is not null and postal_code is not null and province is not null and emergency_name is not null and emergency_relationship is not null and emergency_phone is not null then
    insert into public.parent_profiles (
      user_id, first_name, last_name, phone, street_number, postal_code, province,
      second_guardian_first, second_guardian_last, second_guardian_email, second_guardian_phone,
      second_guardian_street_number, second_guardian_postal_code, second_guardian_province,
      emergency_name, emergency_relationship, emergency_phone
    ) values (
      new.id, first_name, last_name, phone, street_number, postal_code, province,
      nullif(btrim(meta ->> 'profile_second_guardian_first'), ''),
      nullif(btrim(meta ->> 'profile_second_guardian_last'), ''),
      nullif(lower(btrim(meta ->> 'profile_second_guardian_email')), ''),
      nullif(btrim(meta ->> 'profile_second_guardian_phone'), ''),
      nullif(btrim(meta ->> 'profile_second_guardian_street_number'), ''),
      nullif(btrim(meta ->> 'profile_second_guardian_postal_code'), ''),
      nullif(btrim(meta ->> 'profile_second_guardian_province'), ''),
      emergency_name, emergency_relationship, emergency_phone
    ) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.create_parent_contact_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_parent_contact_profile on auth.users;
create trigger on_auth_user_created_parent_contact_profile
after insert on auth.users
for each row execute function public.create_parent_contact_profile();
