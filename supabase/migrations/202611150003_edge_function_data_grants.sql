-- Grant only the columns the admin edge functions need to read or update.
grant select (parent_id) on public.parent_children to service_role;

grant select (user_id, marketing_opt_in, unsubscribe_token),
  update (marketing_opt_in, updated_at)
on public.parent_email_preferences to service_role;

grant select (
  user_id, first_name, last_name, phone, street_number, postal_code, province,
  second_guardian_first, second_guardian_last, second_guardian_email,
  second_guardian_phone, second_guardian_street_number,
  second_guardian_postal_code, second_guardian_province,
  emergency_name, emergency_relationship, emergency_phone
) on public.parent_profiles to service_role;

grant select (id, title) on public.programs to service_role;
grant select (program_id, email, second_guardian_email)
  on public.registrations to service_role;
