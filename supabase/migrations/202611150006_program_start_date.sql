-- Add a distinct start date for programs. This is separate from the
-- descriptive program dates text and the registration close date.
alter table public.programs
  add column if not exists program_start_date date;
