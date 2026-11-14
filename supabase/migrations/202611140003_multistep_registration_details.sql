-- Expand private registrations for the player, family, emergency, and payment review steps.

alter table public.programs
  add column if not exists jersey_number_enabled boolean not null default false;

alter table public.registrations
  add column if not exists date_of_birth date,
  add column if not exists player_address text check (char_length(player_address) <= 300),
  add column if not exists allergies text check (char_length(allergies) <= 3000),
  add column if not exists jersey_number text check (char_length(jersey_number) <= 4),
  add column if not exists guardian_first text check (char_length(guardian_first) <= 80),
  add column if not exists guardian_last text check (char_length(guardian_last) <= 80),
  add column if not exists guardian_address text check (char_length(guardian_address) <= 300),
  add column if not exists second_guardian_first text check (char_length(second_guardian_first) <= 80),
  add column if not exists second_guardian_last text check (char_length(second_guardian_last) <= 80),
  add column if not exists second_guardian_email text check (char_length(second_guardian_email) <= 254),
  add column if not exists second_guardian_phone text check (char_length(second_guardian_phone) <= 40),
  add column if not exists second_guardian_address text check (char_length(second_guardian_address) <= 300),
  add column if not exists emergency_name text check (char_length(emergency_name) <= 120),
  add column if not exists emergency_relationship text check (char_length(emergency_relationship) <= 80),
  add column if not exists emergency_phone text check (char_length(emergency_phone) <= 40),
  add column if not exists payment_terms_accepted boolean not null default false;

alter table public.registrations
  add constraint registrations_second_guardian_complete check (
    (second_guardian_first is null and second_guardian_last is null and second_guardian_email is null and second_guardian_phone is null and second_guardian_address is null)
    or (
      nullif(btrim(second_guardian_first), '') is not null
      and nullif(btrim(second_guardian_last), '') is not null
      and second_guardian_email is not null
      and position('@' in second_guardian_email) > 1
      and nullif(btrim(second_guardian_phone), '') is not null
    )
  );

grant insert (
  date_of_birth, player_address, allergies, jersey_number,
  guardian_first, guardian_last, guardian_address,
  second_guardian_first, second_guardian_last, second_guardian_email, second_guardian_phone, second_guardian_address,
  emergency_name, emergency_relationship, emergency_phone, payment_terms_accepted
) on public.registrations to anon;

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
          and (p.jersey_number_enabled or registrations.jersey_number is null)
          and registrations.date_of_birth >= (current_date - interval '25 years')::date
          and registrations.date_of_birth <= current_date
          and nullif(btrim(registrations.player_address), '') is not null
          and nullif(btrim(registrations.guardian_first), '') is not null
          and nullif(btrim(registrations.guardian_last), '') is not null
          and nullif(btrim(registrations.guardian_address), '') is not null
          and nullif(btrim(registrations.emergency_name), '') is not null
          and nullif(btrim(registrations.emergency_relationship), '') is not null
          and nullif(btrim(registrations.emergency_phone), '') is not null
          and registrations.payment_terms_accepted is true
          and not exists (
            select 1 from public.waivers w
            where w.is_active
              and coalesce(registrations.waiver_consents ->> w.id::text, 'false') <> 'true'
          )
      )
    )
  )
);
