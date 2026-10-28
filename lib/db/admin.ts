// The dashboard's reads and writes. Payments and status history are append-only;
// every change also goes to the audit log with who made it.
//
// Two shapes of order: the owner's (prices, payments, contact details) and the
// production view, which is selected without those columns so the server never
// sends them to a production login.

import type { Settings } from '@/lib/config/catalog';
import { CUT_STARTED, paidCents, refundOwed, statusAfterPayment, type PaymentRow, type Status } from '@/lib/order/payments';
import { audit } from './catalog';
import type { Db } from './client';
import { randomId } from './orders';

const json = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
const dateStr = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null);

export class AdminError extends Error {}

// ---------- reads ----------

export interface OrderRow {
  id: string;
  number: string;
  status: Status;
  product: string;
  design: any;
  width_in: number | null;
  height_in: number | null;
  needed_by: string | null;
  rush: boolean;
  created_at: string;
  source: string | null;
  proof_approved_at: string | null;
  proof_requested_at: string | null;
  cut_override_reason: string | null;
}

export interface OwnerOrder extends OrderRow {
  total: number;
  deposit_required: number;
  paid: number;
  price_breakdown: any;
  placement: string | null;
  delivery_method: string | null;
  delivery_address: string | null;
  notes_customer: string | null;
  notes_internal: string | null;
  engine_report: any;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  created_by: string | null;
  cancelled_by: string | null;
}

/** What production sees: specs only, the customer's first name, no money or contact details. */
export interface ProductionOrder extends OrderRow {
  first_name: string;
  paid_up: boolean;
}

const BASE_COLS = `o.id, o.number, o.status, o.product, o.design, o.width_in::float8 as width_in, o.height_in::float8 as height_in,
  to_char(o.needed_by, 'YYYY-MM-DD') as needed_by, o.rush, o.created_at, o.source, o.proof_approved_at, o.proof_requested_at, o.cut_override_reason`;
const PAID = `coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from payments p where p.order_id = o.id), 0)::int`;

function base(r: any): OrderRow {
  return { ...r, design: json(r.design), needed_by: dateStr(r.needed_by) };
}

export interface OrderFilters {
  status?: string;
  /** 'unpaid' | 'paid' */
  paid?: string;
  q?: string;
  limit?: number;
}

export async function listOrders(db: Db, f: OrderFilters = {}): Promise<OwnerOrder[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status === 'open') where.push(`o.status not in ('complete', 'cancelled')`);
  else if (f.status) {
    params.push(f.status);
    where.push(`o.status = $${params.length}`);
  }
  if (f.paid === 'unpaid') where.push(`${PAID} < o.total and o.status <> 'cancelled'`);
  if (f.paid === 'paid') where.push(`${PAID} >= o.total`);
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().toLowerCase()}%`);
    const i = params.length;
    where.push(`(lower(o.number) like $${i} or lower(c.name) like $${i} or lower(c.email) like $${i} or lower(o.design::text) like $${i})`);
  }
  params.push(Math.min(f.limit ?? 200, 500));
  const rows = await db.query(
    `select ${BASE_COLS}, o.total, o.deposit_required, ${PAID} as paid, o.price_breakdown, o.placement, o.delivery_method, o.delivery_address,
            o.notes_customer, o.notes_internal, o.engine_report, o.customer_id, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
            o.created_by, o.cancelled_by
       from orders o join customers c on c.id = o.customer_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by o.created_at desc limit $${params.length}`,
    params,
  );
  return rows.map((r) => ({ ...base(r), price_breakdown: json(r.price_breakdown), engine_report: json(r.engine_report) }) as OwnerOrder);
}

export async function getOwnerOrder(db: Db, id: string): Promise<OwnerOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db.query(
    `select ${BASE_COLS}, o.total, o.deposit_required, ${PAID} as paid, o.price_breakdown, o.placement, o.delivery_method, o.delivery_address,
            o.notes_customer, o.notes_internal, o.engine_report, o.customer_id, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
            o.created_by, o.cancelled_by
       from orders o join customers c on c.id = o.customer_id where o.id = $1`,
    [id],
  );
  return rows[0] ? ({ ...base(rows[0]), price_breakdown: json(rows[0].price_breakdown), engine_report: json(rows[0].engine_report) } as OwnerOrder) : null;
}

/** The production view, selected without prices, payments or contact details. */
export async function getProductionOrder(db: Db, id: string): Promise<ProductionOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db.query(
    `select ${BASE_COLS}, split_part(c.name, ' ', 1) as first_name, (${PAID} >= o.total) as paid_up
       from orders o join customers c on c.id = o.customer_id where o.id = $1`,
    [id],
  );
  return rows[0] ? (stripForProduction(base(rows[0]) as ProductionOrder)) : null;
}

/** Board cards: paid orders waiting to start, then the production statuses. */
export async function boardOrders(db: Db, settings: Settings): Promise<ProductionOrder[]> {
  const rows = await db.query(
    `select ${BASE_COLS}, split_part(c.name, ' ', 1) as first_name, (${PAID} >= o.total) as paid_up
       from orders o join customers c on c.id = o.customer_id
      where o.status in ('paid_in_full', 'in_production', 'ready')
         or (o.status = 'complete' and o.created_at > now() - make_interval(days => $1::int))
      order by o.needed_by nulls last, o.created_at`,
    [settings.production.board_complete_days ?? 14],
  );
  return rows.map((r) => stripForProduction(base(r) as ProductionOrder));
}

/** The design snapshot holds the price breakdown labels and contact-ish fields; production gets specs only. */
function stripForProduction(o: ProductionOrder): ProductionOrder {
  const d = o.design ?? {};
  return { ...o, design: { engine: d.engine, labels: d.labels, materialId: d.materialId, colourIds: d.colourIds, styleId: d.styleId, productId: d.productId, finishId: d.finishId } };
}

export async function orderPayments(db: Db, id: string) {
  return db.query<{ id: string; amount: number; kind: 'payment' | 'refund'; method: string | null; received_at: string | null; reference: string | null; note: string | null; recorded_at: string }>(
    'select id, amount, kind, method, received_at, reference, note, recorded_at from payments where order_id = $1 order by recorded_at, id',
    [id],
  );
}

export async function orderHistory(db: Db, id: string) {
  return db.query<{ from_status: string | null; to_status: string; changed_at: string; note: string | null }>(
    'select from_status, to_status, changed_at, note from status_history where order_id = $1 order by changed_at, id',
    [id],
  );
}

export async function orderFiles(db: Db, id: string) {
  return db.query<{ kind: 'svg' | 'png' | 'dxf'; storage_path: string; version: number; created_at: string }>(
    `select distinct on (kind) kind, storage_path, version, created_at from order_files where order_id = $1 order by kind, version desc`,
    [id],
  );
}

export async function orderEmails(db: Db, id: string) {
  return db.query<{ template: string; recipient: string; status: string; error: string | null; sent_at: string; subject: string | null }>(
    'select template, recipient, status, error, sent_at, subject from email_log where order_id = $1 order by id',
    [id],
  );
}

export interface HomeStats {
  newOrders: number;
  unpaidCents: number;
  unpaidOrders: number;
  dueThisWeek: number;
  inProduction: number;
  revenueThisMonthCents: number;
}

export async function homeStats(db: Db, today: string): Promise<HomeStats> {
  // today is passed once as text and cast in one place, so every driver agrees on its type
  const [r] = await db.query(
    `with t as (select $1::text::date as d)
     select
       (select count(*) from orders where status = 'new')::int as new_orders,
       (select coalesce(sum(greatest(o.total - ${PAID}, 0)), 0) from orders o where o.status <> 'cancelled')::int as unpaid_cents,
       (select count(*) from orders o where o.status <> 'cancelled' and ${PAID} < o.total)::int as unpaid_orders,
       (select count(*) from orders, t where needed_by between t.d and t.d + 7 and status not in ('complete', 'cancelled'))::int as due_this_week,
       (select count(*) from orders where status = 'in_production')::int as in_production,
       (select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) from payments, t
         where coalesce(received_at, recorded_at) >= date_trunc('month', t.d))::int as revenue`,
    [today],
  );
  return { newOrders: r.new_orders, unpaidCents: r.unpaid_cents, unpaidOrders: r.unpaid_orders, dueThisWeek: r.due_this_week, inProduction: r.in_production, revenueThisMonthCents: r.revenue };
}

export async function listCustomers(db: Db, q?: string) {
  const params: unknown[] = [];
  let where = '';
  if (q?.trim()) {
    params.push(`%${q.trim().toLowerCase()}%`);
    where = 'where lower(c.name) like $1 or lower(c.email) like $1 or c.phone like $1';
  }
  return db.query<{ id: string; name: string; email: string; phone: string | null; source: string | null; created_at: string; orders: number; spent: number; last_order: string | null }>(
    `select c.id, c.name, c.email, c.phone, c.source, c.created_at,
            count(o.id)::int as orders,
            coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0)::int as spent,
            max(o.created_at) as last_order
       from customers c
       left join orders o on o.customer_id = c.id
       left join payments p on p.order_id = o.id
       ${where}
      group by c.id order by max(o.created_at) desc nulls last limit 500`,
    params,
  );
}

export async function customerOrders(db: Db, customerId: string) {
  return db.query<{ id: string; number: string; status: Status; total: number; created_at: string }>(
    'select id, number, status, total, created_at from orders where customer_id = $1 order by created_at desc',
    [customerId],
  );
}

// ---------- writes ----------

async function lockOrder(t: Db, id: string) {
  const [o] = await t.query<{ id: string; status: Status; total: number; deposit_required: number; number: string }>(
    'select id, status, total, deposit_required, number from orders where id = $1 for update',
    [id],
  );
  if (!o) throw new AdminError('Order not found.');
  return o;
}

async function changeStatus(t: Db, id: string, from: Status, to: Status, note: string | null, actor: string) {
  if (from === to) return;
  await t.query('update orders set status = $2 where id = $1', [id, to]);
  await t.query('insert into status_history (order_id, from_status, to_status, note) values ($1, $2, $3, $4)', [id, from, to, note ? `${note} (${actor})` : `By ${actor}`]);
  await audit(t, actor, 'status', 'order', id, { status: from }, { status: to, note });
}

/** Opening a new order in the dashboard moves it on to Awaiting payment. */
export async function markReviewed(db: Db, id: string, actor: string): Promise<void> {
  await db.tx(async (t) => {
    const o = await lockOrder(t, id);
    if (o.status === 'new') await changeStatus(t, id, 'new', 'awaiting_payment', 'Reviewed', actor);
  });
}

/** Sets a status by hand. Production roles may only move between the production statuses. */
export async function setStatus(db: Db, id: string, to: Status, note: string | null, actor: string, opts: { productionOnly?: boolean } = {}): Promise<Status> {
  return db.tx(async (t) => {
    const o = await lockOrder(t, id);
    if (to === 'cancelled') throw new AdminError('Use Cancel order, so the refund is worked out.');
    if (o.status === 'cancelled') throw new AdminError('This order is cancelled.');
    if (opts.productionOnly) {
      const from = o.status;
      const ok = ['paid_in_full', 'in_production', 'ready', 'complete'].includes(from) && ['in_production', 'ready', 'complete'].includes(to);
      if (!ok) throw new AdminError('Production can only move paid orders between In production, Ready and Complete.');
    }
    await changeStatus(t, id, o.status, to, note, actor);
    return o.status;
  });
}

export interface PaymentInput {
  amountCents: number;
  kind: 'payment' | 'refund';
  method: string;
  receivedAt: string;
  reference?: string;
  note?: string;
}

/** Records a payment or refund (a new row; never an edit) and moves payment statuses on. */
export async function recordPayment(db: Db, id: string, p: PaymentInput, actor: string, settings: Settings): Promise<{ status: Status; paid: number; balance: number }> {
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) throw new AdminError('Enter an amount above $0.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.receivedAt)) throw new AdminError('Enter the date received.');
  return db.tx(async (t) => {
    const o = await lockOrder(t, id);
    const [row] = await t.query<{ id: string }>(
      `insert into payments (order_id, amount, kind, method, received_at, reference, note) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [id, p.amountCents, p.kind, p.method || null, p.receivedAt, p.reference?.trim() || null, p.note?.trim() ? `${p.note.trim()} (${actor})` : `Recorded by ${actor}`],
    );
    const rows = await t.query<PaymentRow>('select amount, kind from payments where order_id = $1', [id]);
    const paid = paidCents(rows);
    const next = o.status === 'cancelled' ? o.status : statusAfterPayment(o.status, o.total, o.deposit_required, paid, settings);
    await changeStatus(t, id, o.status, next, p.kind === 'refund' ? 'Refund recorded' : 'Payment recorded', actor);
    await audit(t, actor, p.kind, 'order', id, null, { payment_id: row.id, ...p });
    return { status: next, paid, balance: o.total - paid };
  });
}

/** Cancels an order and records the refund owed under the policy as a refund entry. */
export async function cancelOrder(db: Db, id: string, c: { by: 'customer' | 'owner'; reason: string }, actor: string, settings: Settings): Promise<{ refundCents: number }> {
  if (!c.reason.trim()) throw new AdminError('Give a reason for cancelling.');
  return db.tx(async (t) => {
    const o = await lockOrder(t, id);
    if (o.status === 'cancelled') throw new AdminError('This order is already cancelled.');
    const paid = paidCents(await t.query<PaymentRow>('select amount, kind from payments where order_id = $1', [id]));
    const refundCents = refundOwed(paid, c.by, CUT_STARTED.includes(o.status), settings);
    if (refundCents > 0)
      await t.query(
        `insert into payments (order_id, amount, kind, method, received_at, note) values ($1, $2, 'refund', null, current_date, $3)`,
        [id, refundCents, `Refund owed on cancellation by ${c.by} (${actor})`],
      );
    await t.query('update orders set cancelled_by = $2 where id = $1', [id, c.by]);
    await changeStatus(t, id, o.status, 'cancelled', `Cancelled by ${c.by}: ${c.reason.trim()}${refundCents ? `; refund ${(refundCents / 100).toFixed(2)}` : ''}`, actor);
    return { refundCents };
  });
}

/** Releases cut files for an unpaid order; the reason goes in the order history. */
export async function overrideCutGate(db: Db, id: string, reason: string, actor: string): Promise<void> {
  if (!reason.trim()) throw new AdminError('Give a reason for the override.');
  await db.tx(async (t) => {
    const o = await lockOrder(t, id);
    await t.query('update orders set cut_override_reason = $2 where id = $1', [id, reason.trim()]);
    await t.query('insert into status_history (order_id, from_status, to_status, note) values ($1, $2, $2, $3)', [id, o.status, `Cut-file override: ${reason.trim()} (${actor})`]);
    await audit(t, actor, 'cut_override', 'order', id, null, { reason });
  });
}

export async function setInternalNotes(db: Db, id: string, notes: string, actor: string) {
  await db.tx(async (t) => {
    const [before] = await t.query('select notes_internal from orders where id = $1', [id]);
    await t.query('update orders set notes_internal = $2 where id = $1', [id, notes]);
    await audit(t, actor, 'notes', 'order', id, before, { notes_internal: notes });
  });
}

/** Saves an edited design. The version the customer approved stays on record in design.history. */
export async function saveEditedDesign(
  db: Db,
  id: string,
  e: { design: any; widthIn: number; heightIn: number; engineReport: any; priceBreakdown?: any; totalCents?: number; depositCents?: number; requestProof: boolean },
  actor: string,
): Promise<{ proofToken: string | null }> {
  return db.tx(async (t) => {
    const [o] = await t.query('select design, price_breakdown, total, proof_approved_at, status from orders where id = $1 for update', [id]);
    if (!o) throw new AdminError('Order not found.');
    if (o.status === 'cancelled') throw new AdminError('This order is cancelled.');
    const before = json(o.design);
    const history = [...(before.history ?? []), { ...before, history: undefined, approved_at: o.proof_approved_at, replaced_at: new Date().toISOString(), replaced_by: actor }];
    const proofToken = e.requestProof ? randomId(24) : null;
    await t.query(
      `update orders set design = $2, width_in = $3, height_in = $4, engine_report = $5,
              price_breakdown = coalesce($6, price_breakdown), total = coalesce($7, total), deposit_required = coalesce($8, deposit_required),
              proof_token = $9, proof_requested_at = case when $9::text is null then proof_requested_at else now() end,
              proof_approved_at = case when $9::text is null then proof_approved_at else null end
        where id = $1`,
      [id, JSON.stringify({ ...e.design, history }), e.widthIn, e.heightIn, JSON.stringify(e.engineReport), e.priceBreakdown ? JSON.stringify(e.priceBreakdown) : null, e.totalCents ?? null, e.depositCents ?? null, proofToken],
    );
    await t.query('insert into status_history (order_id, from_status, to_status, note) values ($1, $2, $2, $3)', [
      id, o.status, `Design edited${e.totalCents != null && e.totalCents !== o.total ? `; total ${(o.total / 100).toFixed(2)} → ${(e.totalCents / 100).toFixed(2)}` : ''}${proofToken ? '; edited proof sent for approval' : ''} (${actor})`,
    ]);
    await audit(t, actor, 'edit_design', 'order', id, { design: before, total: o.total }, { design: e.design, total: e.totalCents ?? o.total });
    return { proofToken };
  });
}

export async function getOrderByProofToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9]{16,40}$/.test(token)) return null;
  const [r] = await db.query<{ id: string; number: string; design: any; width_in: number; height_in: number; proof_approved_at: string | null }>(
    'select id, number, design, width_in::float8 as width_in, height_in::float8 as height_in, proof_approved_at from orders where proof_token = $1',
    [token],
  );
  return r ? { ...r, design: json(r.design) } : null;
}

export async function approveProof(db: Db, token: string): Promise<string | null> {
  return db.tx(async (t) => {
    const [o] = await t.query<{ id: string; status: string; number: string }>('select id, status, number from orders where proof_token = $1 for update', [token]);
    if (!o) return null;
    await t.query('update orders set proof_approved_at = now(), proof_token = null where id = $1', [o.id]);
    await t.query('insert into status_history (order_id, from_status, to_status, note) values ($1, $2, $2, $3)', [o.id, o.status, 'Customer approved the edited proof']);
    await audit(t, 'customer', 'approve_proof', 'order', o.id, null, null);
    return o.number;
  });
}

// ---------- users and roles ----------

export async function listUsers(db: Db) {
  return db.query<{ id: string; email: string; role: string; invited_at: string; last_sign_in_at: string | null }>('select id, email, role, invited_at, last_sign_in_at from users order by role, email');
}

export async function listRoles(db: Db) {
  return (await db.query<{ name: string; permissions: any }>('select name, permissions from roles order by name')).map((r) => ({ name: r.name, permissions: json(r.permissions) as Record<string, boolean> }));
}

export async function inviteUser(db: Db, email: string, role: string, actor: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AdminError('Type a valid email.');
  await db.tx(async (t) => {
    await t.query('insert into users (email, role) values ($1, $2) on conflict (email) do update set role = excluded.role', [e, role]);
    await audit(t, actor, 'invite', 'user', e, null, { role });
  });
}

export async function removeUser(db: Db, email: string, actor: string) {
  await db.tx(async (t) => {
    const [u] = await t.query<{ role: string }>('select role from users where email = $1', [email]);
    if (u?.role === 'owner') {
      const [{ n }] = await t.query<{ n: number }>("select count(*)::int as n from users where role = 'owner'");
      if (n <= 1) throw new AdminError('There must always be an owner.');
    }
    await t.query('delete from users where email = $1', [email]);
    await audit(t, actor, 'remove', 'user', email, u ?? null, null);
  });
}

export async function saveRole(db: Db, name: string, permissions: Record<string, boolean>, actor: string) {
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(name)) throw new AdminError('Role names are lower case letters, numbers, - and _.');
  await db.tx(async (t) => {
    const [before] = await t.query('select permissions from roles where name = $1', [name]);
    await t.query('insert into roles (name, permissions) values ($1, $2) on conflict (name) do update set permissions = excluded.permissions', [name, JSON.stringify(permissions)]);
    await audit(t, actor, 'role', 'role', name, before ?? null, permissions);
  });
}

// ---------- reply templates and short links ----------

export async function listReplyTemplates(db: Db) {
  return db.query<{ id: string; title: string; body: string; sort_order: number }>('select id, title, body, sort_order from reply_templates order by sort_order, title');
}

export async function saveReplyTemplate(db: Db, t: { id?: string; title: string; body: string; sort_order?: number }, actor: string) {
  if (!t.title.trim() || !t.body.trim()) throw new AdminError('A template needs a title and some text.');
  await db.tx(async (x) => {
    if (t.id) await x.query('update reply_templates set title = $2, body = $3, sort_order = coalesce($4, sort_order) where id = $1', [t.id, t.title.trim(), t.body, t.sort_order ?? null]);
    else await x.query('insert into reply_templates (title, body, sort_order) values ($1, $2, coalesce($3, (select coalesce(max(sort_order), 0) + 10 from reply_templates)))', [t.title.trim(), t.body, t.sort_order ?? null]);
    await audit(x, actor, t.id ? 'update' : 'create', 'reply_template', t.id ?? t.title, null, t);
  });
}

export async function deleteReplyTemplate(db: Db, id: string, actor: string) {
  await db.tx(async (t) => {
    await t.query('delete from reply_templates where id = $1', [id]);
    await audit(t, actor, 'delete', 'reply_template', id, null, null);
  });
}

/** A short Messenger-friendly code for a saved design. */
export async function createShortLink(db: Db, targetType: 'design' | 'quote', targetId: string): Promise<string> {
  for (let len = 4; len < 9; len++) {
    const code = randomId(len);
    const r = await db.query('insert into short_links (code, target_type, target_id) values ($1, $2, $3) on conflict do nothing returning code', [code, targetType, targetId]);
    if (r.length) return code;
  }
  throw new AdminError('Could not make a short link.');
}

export async function resolveShortLink(db: Db, code: string) {
  const [r] = await db.query<{ target_type: string; target_id: string }>('select target_type, target_id from short_links where code = $1', [code]);
  return r ?? null;
}
