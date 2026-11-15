-- Parent email-update preferences and a narrow admin-role check for Edge Functions.
create table if not exists public.parent_email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  marketing_opt_in boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parent_email_preferences enable row level security;
revoke all on public.parent_email_preferences from public, anon, authenticated;
grant select, insert, update on public.parent_email_preferences to authenticated;

drop policy if exists "Families can view their email preferences" on public.parent_email_preferences;
create policy "Families can view their email preferences"
on public.parent_email_preferences for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Families can create their email preferences" on public.parent_email_preferences;
create policy "Families can create their email preferences"
on public.parent_email_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Families can update their email preferences" on public.parent_email_preferences;
create policy "Families can update their email preferences"
on public.parent_email_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.create_parent_email_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.parent_email_preferences (user_id, marketing_opt_in, consented_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', 'false') = 'true',
    case when coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', 'false') = 'true' then now() else null end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_parent_email_preferences() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_parent_email_preferences on auth.users;
create trigger on_auth_user_created_parent_email_preferences
after insert on auth.users
for each row execute function public.create_parent_email_preferences();

-- Edge Functions can check the caller's role without exposing private.admin_users.
create or replace function public.kha_is_admin()
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
revoke all on function public.kha_is_admin() from public, anon;
grant execute on function public.kha_is_admin() to authenticated;

create or replace function public.kha_admin_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from private.admin_users where (select private.is_kha_admin());
$$;
revoke all on function public.kha_admin_account_ids() from public, anon;
grant execute on function public.kha_admin_account_ids() to authenticated;

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

drop policy if exists "Approved admins can add registrations" on public.registrations;
create policy "Approved admins can add registrations"
on public.registrations for insert to authenticated
with check ((select private.is_kha_admin()));
