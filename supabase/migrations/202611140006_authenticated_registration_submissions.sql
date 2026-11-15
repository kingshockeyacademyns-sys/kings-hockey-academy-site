-- Allow a signed-in browser session to submit the same public registration form.
-- This can happen when an admin visits the public site in the same browser.
-- The matching RLS policy applies the same validation to anon and authenticated users.
grant insert (
  program_type, player_first, player_last, birth_year, guardian_name,
  email, phone, town, experience, notes, consent,
  program_id, custom_answers, waiver_consents,
  date_of_birth, player_address, allergies, jersey_number,
  guardian_first, guardian_last, guardian_address,
  second_guardian_first, second_guardian_last, second_guardian_email,
  second_guardian_phone, second_guardian_address,
  emergency_name, emergency_relationship, emergency_phone,
  payment_terms_accepted,
  player_postal_code, player_province,
  guardian_postal_code, guardian_province,
  second_guardian_postal_code, second_guardian_province
) on public.registrations to authenticated;

grant usage on sequence public.registrations_id_seq to authenticated;

drop policy if exists "Signed-in users can submit registration inquiries" on public.registrations;
create policy "Signed-in users can submit registration inquiries"
on public.registrations for insert to authenticated
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
