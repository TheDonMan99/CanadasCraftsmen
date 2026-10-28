-- Phase 3: public orders.
-- A secret token per order, so only the customer's own link opens its confirmation page.
alter table orders add column public_token text not null default replace(gen_random_uuid()::text, '-', '');
create index orders_status on orders (status);

-- One row per public order submission, for the per-device hourly limit. Keys are hashed.
create table submission_log (
  id bigint generated always as identity primary key,
  key text not null,
  at timestamptz not null default now()
);
create index submission_log_key_at on submission_log (key, at);
alter table submission_log enable row level security;

-- Why a send failed or was held, and the subject sent.
alter table email_log add column subject text;
alter table email_log add column error text;

-- Private bucket for order files (Supabase only; skipped where storage doesn't exist).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('order-files', 'order-files', false) on conflict (id) do nothing;
  end if;
end $$;
