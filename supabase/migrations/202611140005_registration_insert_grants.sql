-- Reaffirm the public registration form's column-level insert privileges.
-- Row-level security remains responsible for deciding which registrations may be inserted.
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
) on public.registrations to anon;

grant usage on sequence public.registrations_id_seq to anon;
