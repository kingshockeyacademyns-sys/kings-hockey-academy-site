-- Associate registrations with their family account so parents can view their own history.
alter table public.registrations
  add column if not exists family_user_id uuid references auth.users(id) on delete set null;

-- Link existing registrations only to a verified account with the same guardian email.
update public.registrations r
set family_user_id = u.id
from auth.users u
where r.family_user_id is null
  and r.program_id is not null
  and u.email_confirmed_at is not null
  and lower(btrim(r.email)) = lower(btrim(u.email));

create or replace function private.link_registration_to_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    new.family_user_id := null;
  elsif private.is_kha_admin() then
    select u.id into new.family_user_id
    from auth.users u
    where u.email_confirmed_at is not null
      and lower(btrim(u.email)) = lower(btrim(new.email))
    limit 1;
  else
    new.family_user_id := current_user_id;
  end if;
  return new;
end;
$$;
revoke all on function private.link_registration_to_family() from public, anon, authenticated;

drop trigger if exists link_registration_to_family on public.registrations;
create trigger link_registration_to_family
before insert on public.registrations
for each row execute function private.link_registration_to_family();

drop policy if exists "Families can view their own registrations" on public.registrations;
create policy "Families can view their own registrations"
on public.registrations for select to authenticated
using (family_user_id = (select auth.uid()));

-- This narrowly scoped definer check allows families to read the name and status of
-- programs they registered for after registration closes. Deleted programs still
-- unlink their historical registrations via the existing ON DELETE SET NULL FK.
create or replace function private.is_family_registered_for_program(target_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.registrations r
    where r.program_id = target_program_id
      and r.family_user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_family_registered_for_program(uuid) from public, anon;
grant execute on function private.is_family_registered_for_program(uuid) to authenticated;

drop policy if exists "Families can view programs in their registration history" on public.programs;
create policy "Families can view programs in their registration history"
on public.programs for select to authenticated
using ((select private.is_family_registered_for_program(id)));
