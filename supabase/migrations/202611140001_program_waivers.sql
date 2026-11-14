-- Admin-managed public waiver PDFs and required parent/guardian acknowledgements.

alter table public.programs
  add column if not exists waivers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(waivers) = 'array'
      and jsonb_array_length(case when jsonb_typeof(waivers) = 'array' then waivers else '[]'::jsonb end) <= 8
      and octet_length(waivers::text) <= 16000);

alter table public.registrations
  add column if not exists waiver_consents jsonb not null default '{}'::jsonb
    check (jsonb_typeof(waiver_consents) = 'object' and octet_length(waiver_consents::text) <= 8000);

grant insert (waiver_consents) on public.registrations to anon;

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
            select 1
            from jsonb_array_elements(p.waivers) as waiver(document)
            where coalesce(registrations.waiver_consents ->> (waiver.document ->> 'id'), 'false') <> 'true'
          )
      )
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('program-waivers', 'program-waivers', true, 10485760, array['application/pdf'])
on conflict (id) do update
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

drop policy if exists "Anyone can read program waiver PDFs" on storage.objects;
create policy "Anyone can read program waiver PDFs"
on storage.objects for select to anon, authenticated
using (bucket_id = 'program-waivers');

drop policy if exists "KHA admins can upload program waiver PDFs" on storage.objects;
create policy "KHA admins can upload program waiver PDFs"
on storage.objects for insert to authenticated
with check (bucket_id = 'program-waivers' and (select private.is_kha_admin()));

drop policy if exists "KHA admins can update program waiver PDFs" on storage.objects;
create policy "KHA admins can update program waiver PDFs"
on storage.objects for update to authenticated
using (bucket_id = 'program-waivers' and (select private.is_kha_admin()))
with check (bucket_id = 'program-waivers' and (select private.is_kha_admin()));

drop policy if exists "KHA admins can remove program waiver PDFs" on storage.objects;
create policy "KHA admins can remove program waiver PDFs"
on storage.objects for delete to authenticated
using (bucket_id = 'program-waivers' and (select private.is_kha_admin()));
