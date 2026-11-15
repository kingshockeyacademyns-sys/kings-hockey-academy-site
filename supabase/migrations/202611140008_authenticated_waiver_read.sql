-- Signed-in parent accounts must read the same active waiver text as public visitors.
-- The separate admin policy still controls visibility of inactive waivers.
drop policy if exists "Signed-in visitors can view active waivers" on public.waivers;
create policy "Signed-in visitors can view active waivers"
on public.waivers for select to authenticated
using (is_active);
