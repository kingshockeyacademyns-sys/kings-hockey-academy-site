-- Split player and guardian mailing addresses into their own fields.
alter table public.registrations
  add column if not exists player_postal_code text check (char_length(player_postal_code) <= 16),
  add column if not exists player_province text check (char_length(player_province) <= 80),
  add column if not exists guardian_postal_code text check (char_length(guardian_postal_code) <= 16),
  add column if not exists guardian_province text check (char_length(guardian_province) <= 80),
  add column if not exists second_guardian_postal_code text check (char_length(second_guardian_postal_code) <= 16),
  add column if not exists second_guardian_province text check (char_length(second_guardian_province) <= 80);

alter table public.registrations
  drop constraint if exists registrations_second_guardian_complete;

alter table public.registrations
  add constraint registrations_second_guardian_complete check (
    (
      second_guardian_first is null and second_guardian_last is null
      and second_guardian_email is null and second_guardian_phone is null
      and second_guardian_address is null and second_guardian_postal_code is null
      and second_guardian_province is null
    )
    or (
      nullif(btrim(second_guardian_first), '') is not null
      and nullif(btrim(second_guardian_last), '') is not null
      and second_guardian_email is not null
      and position('@' in second_guardian_email) > 1
      and nullif(btrim(second_guardian_phone), '') is not null
      and nullif(btrim(second_guardian_address), '') is not null
      and nullif(btrim(second_guardian_postal_code), '') is not null
      and nullif(btrim(second_guardian_province), '') is not null
    )
  ) not valid;

grant insert (
  player_postal_code, player_province,
  guardian_postal_code, guardian_province,
  second_guardian_postal_code, second_guardian_province
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
          and nullif(btrim(registrations.player_postal_code), '') is not null
          and nullif(btrim(registrations.player_province), '') is not null
          and nullif(btrim(registrations.guardian_first), '') is not null
          and nullif(btrim(registrations.guardian_last), '') is not null
          and nullif(btrim(registrations.guardian_address), '') is not null
          and nullif(btrim(registrations.guardian_postal_code), '') is not null
          and nullif(btrim(registrations.guardian_province), '') is not null
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
