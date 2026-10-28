-- Phase 5: nesting, inventory and offcuts.
-- Offcuts remember when they were saved and which nest job made them.
alter table offcuts add column created_at timestamptz not null default now();
alter table offcuts add column nest_job_id uuid references nest_jobs (id);
create index offcuts_open on offcuts (material_option_id) where used_at is null;

-- A nest job's orders, sheets, offcuts, material cost per order and stored panel files.
alter table nest_jobs add column summary jsonb not null default '{}'::jsonb;
alter table nest_jobs add column created_by text;
