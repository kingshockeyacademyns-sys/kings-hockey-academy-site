-- Per-program toggle for an optional jersey size question.
alter table public.programs
  add column if not exists jersey_size_enabled boolean not null default false;
