-- Private child profiles owned by parent accounts for faster future registrations.
create table if not exists public.parent_children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  date_of_birth date not null,
  street_number text not null check (char_length(btrim(street_number)) between 1 and 300),
  postal_code text not null check (char_length(btrim(postal_code)) between 1 and 16),
  province text not null check (char_length(btrim(province)) between 1 and 80),
  medical_information text not null default '' check (char_length(medical_information) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parent_children enable row level security;
revoke all on public.parent_children from public, anon, authenticated;
grant select, insert, update, delete on public.parent_children to authenticated;

drop policy if exists "Parents can view their own child profiles" on public.parent_children;
create policy "Parents can view their own child profiles"
on public.parent_children for select to authenticated
using (parent_id = (select auth.uid()));

drop policy if exists "Parents can create their own child profiles" on public.parent_children;
create policy "Parents can create their own child profiles"
on public.parent_children for insert to authenticated
with check (parent_id = (select auth.uid()));

drop policy if exists "Parents can update their own child profiles" on public.parent_children;
create policy "Parents can update their own child profiles"
on public.parent_children for update to authenticated
using (parent_id = (select auth.uid()))
with check (parent_id = (select auth.uid()));

drop policy if exists "Parents can delete their own child profiles" on public.parent_children;
create policy "Parents can delete their own child profiles"
on public.parent_children for delete to authenticated
using (parent_id = (select auth.uid()));
