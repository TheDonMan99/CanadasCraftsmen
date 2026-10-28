-- Phase 4: dashboard, payments and production.
-- Edited-proof approval links, the cut-file override reason, and who cancelled.
alter table orders add column proof_token text unique;
alter table orders add column proof_requested_at timestamptz;
alter table orders add column cut_override_reason text;
alter table orders add column cancelled_by text check (cancelled_by in ('customer', 'owner'));
create index orders_needed_by on orders (needed_by);
create index payments_order on payments (order_id);
create index status_history_order on status_history (order_id);
create index email_log_order on email_log (order_id);

-- Five fonts were added to the catalog after phase 3; offer them on products in databases seeded before that.
update catalog_options
   set "values" = jsonb_set("values", '{allowed_fonts}', ("values" -> 'allowed_fonts') || '["font.grand-hotel", "font.damion", "font.leckerli-one", "font.fredoka-bold", "font.chewy"]'::jsonb)
 where category = 'product' and "values" ? 'allowed_fonts' and not (("values" -> 'allowed_fonts') ? 'font.grand-hotel');
