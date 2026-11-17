-- Let the account-management Edge Function search player details. Medical
-- information stays inside the database approval function and is not returned
-- to the admin search page or sent by email.
grant select (
  id, parent_id, first_name, last_name, date_of_birth,
  street_number, postal_code, province
) on public.parent_children to service_role;
grant select (id, title, body, is_active, created_at) on public.waivers to service_role;
grant select (
  id, title, season, fee, session_count, single_session_available,
  session_schedule, program_start_date, registration_closes_on, location,
  dates, questions, jersey_size_enabled, jersey_number_enabled, is_open
) on public.programs to service_role;

create table if not exists public.registration_approval_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.parent_children(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired', 'cancelled')),
  form_data jsonb not null default '{}'::jsonb,
  program_snapshot jsonb not null,
  waiver_snapshot jsonb not null default '[]'::jsonb,
  registration_id bigint references public.registrations(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  check (jsonb_typeof(form_data) = 'object'),
  check (jsonb_typeof(program_snapshot) = 'object'),
  check (jsonb_typeof(waiver_snapshot) = 'array')
);

create index if not exists registration_approval_requests_status_created_idx
  on public.registration_approval_requests (status, created_at desc);
create index if not exists registration_approval_requests_parent_player_program_idx
  on public.registration_approval_requests (parent_id, player_id, program_id, created_at desc);

alter table public.registration_approval_requests enable row level security;
revoke all on public.registration_approval_requests from public, anon, authenticated;
grant select, insert, update on public.registration_approval_requests to service_role;

create or replace function public.approve_family_registration_request(
  p_token_hash text,
  p_registration_consent boolean,
  p_payment_terms_accepted boolean,
  p_waiver_consents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.registration_approval_requests%rowtype;
  player_row public.parent_children%rowtype;
  family_row public.parent_profiles%rowtype;
  program_row public.programs%rowtype;
  account_email text;
  active_waivers jsonb;
  current_program_snapshot jsonb;
  waiver_item jsonb;
  inserted_registration_id bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'This approval link is invalid or expired.';
  end if;

  select * into request_row
  from public.registration_approval_requests
  where token_hash = p_token_hash
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'This approval request is no longer available.';
  end if;
  if request_row.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'This approval request has expired. Contact the academy for a new request.';
  end if;
  if p_registration_consent is not true or p_payment_terms_accepted is not true then
    raise exception using errcode = 'P0001', message = 'Confirm the registration and payment terms to continue.';
  end if;
  if p_waiver_consents is null or jsonb_typeof(p_waiver_consents) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Review and accept every required waiver to continue.';
  end if;

  select * into player_row from public.parent_children where id = request_row.player_id;
  select * into family_row from public.parent_profiles where user_id = request_row.parent_id;
  select email into account_email from auth.users where id = request_row.parent_id;
  select * into program_row from public.programs where id = request_row.program_id;
  if player_row.id is null or family_row.user_id is null or account_email is null or program_row.id is null then
    raise exception using errcode = 'P0001', message = 'The saved player or family details are no longer available. Contact the academy.';
  end if;

  if player_row.parent_id <> request_row.parent_id then
    raise exception using errcode = 'P0001', message = 'This approval request no longer matches the saved family account.';
  end if;
  if not program_row.is_open or (program_row.registration_closes_on is not null and program_row.registration_closes_on < (now() at time zone 'America/Halifax')::date) then
    raise exception using errcode = 'P0001', message = 'Registration for this program has closed. Contact the academy.';
  end if;
  if player_row.date_of_birth > current_date or player_row.date_of_birth < (current_date - interval '25 years')::date then
    raise exception using errcode = 'P0001', message = 'The saved player date of birth is no longer eligible for registration.';
  end if;
  if nullif(btrim(player_row.street_number), '') is null
    or nullif(btrim(player_row.postal_code), '') is null
    or nullif(btrim(player_row.province), '') is null
    or nullif(btrim(family_row.first_name), '') is null
    or nullif(btrim(family_row.last_name), '') is null
    or nullif(btrim(family_row.phone), '') is null
    or nullif(btrim(family_row.street_number), '') is null
    or nullif(btrim(family_row.postal_code), '') is null
    or nullif(btrim(family_row.province), '') is null
    or nullif(btrim(family_row.emergency_name), '') is null
    or nullif(btrim(family_row.emergency_relationship), '') is null
    or nullif(btrim(family_row.emergency_phone), '') is null then
    raise exception using errcode = 'P0001', message = 'Family or player details need to be completed before registration can be confirmed.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', w.id::text, 'title', w.title, 'body', w.body)
    order by w.created_at, w.id
  ), '[]'::jsonb)
  into active_waivers
  from public.waivers w
  where w.is_active;
  if active_waivers <> request_row.waiver_snapshot then
    raise exception using errcode = 'P0001', message = 'The waivers have changed since this request was sent. Contact the academy for an updated request.';
  end if;
  for waiver_item in select value from jsonb_array_elements(request_row.waiver_snapshot)
  loop
    if coalesce(p_waiver_consents ->> (waiver_item ->> 'id'), 'false') <> 'true' then
      raise exception using errcode = 'P0001', message = 'Review and accept every required waiver to continue.';
    end if;
  end loop;

  current_program_snapshot := jsonb_build_object(
    'id', program_row.id::text,
    'title', program_row.title,
    'season', program_row.season,
    'fee', program_row.fee,
    'session_count', program_row.session_count,
    'single_session_available', program_row.single_session_available,
    'session_schedule', program_row.session_schedule,
    'program_start_date', program_row.program_start_date,
    'registration_closes_on', program_row.registration_closes_on,
    'location', program_row.location,
    'dates', program_row.dates,
    'questions', program_row.questions,
    'jersey_size_enabled', program_row.jersey_size_enabled,
    'jersey_number_enabled', program_row.jersey_number_enabled
  );
  if current_program_snapshot <> request_row.program_snapshot then
    raise exception using errcode = 'P0001', message = 'Program details have changed since this request was sent. Contact the academy for an updated request.';
  end if;
  if nullif(request_row.form_data ->> 'jersey_number', '') is not null and not program_row.jersey_number_enabled then
    raise exception using errcode = 'P0001', message = 'The jersey option is no longer available. Contact the academy.';
  end if;

  insert into public.registrations (
    program_type, program_id, family_user_id,
    player_first, player_last, birth_year, date_of_birth,
    player_address, player_postal_code, player_province, allergies, jersey_number,
    guardian_name, guardian_first, guardian_last, guardian_address,
    guardian_postal_code, guardian_province,
    second_guardian_first, second_guardian_last, second_guardian_email,
    second_guardian_phone, second_guardian_address,
    second_guardian_postal_code, second_guardian_province,
    email, phone, experience, notes,
    emergency_name, emergency_relationship, emergency_phone,
    consent, payment_terms_accepted, waiver_consents, custom_answers
  ) values (
    program_row.title, program_row.id, request_row.parent_id,
    player_row.first_name, player_row.last_name, extract(year from player_row.date_of_birth)::integer, player_row.date_of_birth,
    player_row.street_number, player_row.postal_code, player_row.province, nullif(player_row.medical_information, ''),
    case when program_row.jersey_number_enabled then nullif(request_row.form_data ->> 'jersey_number', '') else null end,
    left(btrim(family_row.first_name || ' ' || family_row.last_name), 120), family_row.first_name, family_row.last_name,
    family_row.street_number, family_row.postal_code, family_row.province,
    family_row.second_guardian_first, family_row.second_guardian_last, family_row.second_guardian_email,
    family_row.second_guardian_phone, family_row.second_guardian_street_number,
    family_row.second_guardian_postal_code, family_row.second_guardian_province,
    account_email, family_row.phone, coalesce(request_row.form_data ->> 'experience', ''),
    nullif(request_row.form_data ->> 'notes', ''),
    family_row.emergency_name, family_row.emergency_relationship, family_row.emergency_phone,
    true, true, p_waiver_consents, coalesce(request_row.form_data -> 'custom_answers', '{}'::jsonb)
  ) returning id into inserted_registration_id;

  update public.registration_approval_requests
  set status = 'approved', registration_id = inserted_registration_id, resolved_at = now()
  where id = request_row.id;

  return jsonb_build_object('ok', true, 'registration_id', inserted_registration_id);
end;
$$;

revoke all on function public.approve_family_registration_request(text, boolean, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.approve_family_registration_request(text, boolean, boolean, jsonb) to service_role;
