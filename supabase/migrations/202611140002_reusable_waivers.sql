-- Reusable website waivers managed independently from registration programs.

create table if not exists public.waivers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 6000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.waivers enable row level security;
revoke all on public.waivers from public, anon, authenticated;
grant select on public.waivers to anon, authenticated;
grant insert, update on public.waivers to authenticated;

drop policy if exists "Visitors can view active waivers" on public.waivers;
create policy "Visitors can view active waivers"
on public.waivers for select to anon
using (is_active);

drop policy if exists "KHA admins can view all waivers" on public.waivers;
create policy "KHA admins can view all waivers"
on public.waivers for select to authenticated
using ((select private.is_kha_admin()));

drop policy if exists "KHA admins can create waivers" on public.waivers;
create policy "KHA admins can create waivers"
on public.waivers for insert to authenticated
with check ((select private.is_kha_admin()));

drop policy if exists "KHA admins can update waivers" on public.waivers;
create policy "KHA admins can update waivers"
on public.waivers for update to authenticated
using ((select private.is_kha_admin()))
with check ((select private.is_kha_admin()));

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
          and not exists (
            select 1 from public.waivers w
            where w.is_active
              and coalesce(registrations.waiver_consents ->> w.id::text, 'false') <> 'true'
          )
      )
    )
  )
);
