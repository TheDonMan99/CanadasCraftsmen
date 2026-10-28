-- Initial schema for the Welcome Sign Generator (SPEC.md, "Data model").
-- Lengths are inches (numeric), money is integer cents in CAD.
-- The app's server talks to the database with the service connection; every
-- table has row-level security on so the public anon key can do nothing except
-- what the policies at the bottom allow.


-- One row of grouped JSON settings, edited from Settings.
create table settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table catalog_options (
  id text primary key,
  category text not null check (category in (
    'product', 'style', 'backer_shape', 'size', 'material', 'finish_type', 'paint', 'stain',
    'topcoat', 'font', 'addon', 'delivery', 'payment_method', 'placement')),
  label text not null,
  description text not null default '',
  enabled boolean not null default true,
  stock_status text not null default 'in_stock' check (stock_status in ('in_stock', 'out_of_stock')),
  sort_order int not null default 0,
  price_type text not null default 'none' check (price_type in ('none', 'flat', 'percent', 'per_inch')),
  price_value int not null default 0,
  applies_to text[],
  "values" jsonb not null default '{}'::jsonb,
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalog_options_category on catalog_options (category, sort_order);

create table catalog_price_history (
  id bigint generated always as identity primary key,
  option_id text not null references catalog_options (id) on delete cascade,
  old_price int,
  new_price int,
  old_price_type text,
  new_price_type text,
  changed_at timestamptz not null default now()
);

create table fonts (
  option_id text primary key references catalog_options (id) on delete cascade,
  font_file text not null,
  licence_file text,
  licence_confirmed boolean not null default false,
  allowed_lines text[] not null default '{top,main}',
  auto_thicken_in numeric not null default 0
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  source text,
  created_at timestamptz not null default now()
);
create unique index customers_email on customers (lower(email));

create sequence order_number_seq start 1001;

create table orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('S-' || nextval('order_number_seq')),
  customer_id uuid references customers (id),
  status text not null default 'new',
  product text not null,
  design jsonb not null,
  width_in numeric,
  height_in numeric,
  price_breakdown jsonb not null,
  total int not null,
  deposit_required int not null default 0,
  placement text,
  delivery_method text,
  delivery_address text,
  needed_by date,
  rush boolean not null default false,
  source text,
  created_by text,
  proof_approved_at timestamptz,
  engine_report jsonb,
  notes_customer text,
  notes_internal text,
  created_at timestamptz not null default now()
);

create table order_files (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders (id) on delete cascade,
  kind text not null check (kind in ('svg', 'png', 'dxf')),
  storage_path text not null,
  version int not null default 1,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id),
  amount int not null,
  kind text not null check (kind in ('payment', 'refund')),
  method text,
  received_at timestamptz,
  reference text,
  note text,
  recorded_at timestamptz not null default now()
);

create table status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders (id),
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  note text
);

create table email_log (
  id bigint generated always as identity primary key,
  order_id uuid references orders (id),
  template text not null,
  recipient text not null,
  sent_at timestamptz not null default now(),
  status text not null,
  provider_message_id text
);

create table inventory (
  material_option_id text primary key references catalog_options (id),
  full_sheets int not null default 0,
  cut_panels int not null default 0,
  low_stock_alert int not null default 2
);

create table offcuts (
  id uuid primary key default gen_random_uuid(),
  material_option_id text not null references catalog_options (id),
  width_in numeric not null,
  height_in numeric not null,
  source_panel text,
  used_at timestamptz
);

create table nest_jobs (
  id uuid primary key default gen_random_uuid(),
  material_option_id text not null references catalog_options (id),
  status text not null default 'planned' check (status in ('planned', 'cut')),
  panels jsonb not null default '[]'::jsonb,
  utilization numeric,
  created_at timestamptz not null default now(),
  cut_at timestamptz
);

create table saved_designs (
  share_id text primary key,
  design jsonb not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create table roles (
  name text primary key,
  permissions jsonb not null default '{}'::jsonb
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null references roles (name),
  invited_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create table reply_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  sort_order int not null default 0
);

create table short_links (
  code text primary key,
  target_type text not null check (target_type in ('design', 'quote')),
  target_id text not null,
  created_at timestamptz not null default now()
);

-- Price edits are recorded automatically.
create function record_price_change() returns trigger language plpgsql as $$
begin
  if new.price_value is distinct from old.price_value or new.price_type is distinct from old.price_type then
    insert into catalog_price_history (option_id, old_price, new_price, old_price_type, new_price_type)
    values (new.id, old.price_value, new.price_value, old.price_type, new.price_type);
  end if;
  return null;
end $$;
create trigger catalog_price_history after update on catalog_options
  for each row execute function record_price_change();
-- updated_at is set by a separate BEFORE trigger (AFTER triggers can't change the row).
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger catalog_touch before update on catalog_options for each row execute function touch_updated_at();

-- Payments, status history and the audit log are append-only: corrections are new rows.
create function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; record a new row instead', tg_table_name;
end $$;
create trigger payments_append_only before update or delete on payments for each row execute function forbid_change();
create trigger status_history_append_only before update or delete on status_history for each row execute function forbid_change();
create trigger audit_log_append_only before update or delete on audit_log for each row execute function forbid_change();

-- Fonts can't be switched on until their licence is confirmed.
create function check_font_licence() returns trigger language plpgsql as $$
begin
  if new.category = 'font' and new.enabled and not exists (
    select 1 from fonts f where f.option_id = new.id and f.licence_confirmed
  ) and exists (select 1 from fonts f where f.option_id = new.id) then
    raise exception 'Font % cannot be enabled until its commercial licence is confirmed', new.id;
  end if;
  return new;
end $$;
create trigger catalog_font_licence before insert or update on catalog_options for each row execute function check_font_licence();

-- Row-level security: on everywhere. The anon role may only create orders and
-- saved designs, and read the enabled catalog. Everything else goes through
-- the server, which uses the service connection.
alter table settings enable row level security;
alter table catalog_options enable row level security;
alter table catalog_price_history enable row level security;
alter table fonts enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_files enable row level security;
alter table payments enable row level security;
alter table status_history enable row level security;
alter table email_log enable row level security;
alter table inventory enable row level security;
alter table offcuts enable row level security;
alter table nest_jobs enable row level security;
alter table saved_designs enable row level security;
alter table audit_log enable row level security;
alter table roles enable row level security;
alter table users enable row level security;
alter table reply_templates enable row level security;
alter table short_links enable row level security;

create policy "public reads enabled catalog" on catalog_options for select to anon using (enabled);
create policy "public creates orders" on orders for insert to anon with check (true);
create policy "public creates saved designs" on saved_designs for insert to anon with check (true);
