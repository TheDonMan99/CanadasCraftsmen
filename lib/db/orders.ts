// Orders, customers, order files, the email log, saved designs and the
// submission log behind the public rate limit.

import type { Db } from './client';
import { ACTIVE_STATUSES } from '@/lib/order/rules';

export interface NewOrder {
  customer: { name: string; email: string; phone: string; source?: string | null };
  product: string;
  design: unknown;
  widthIn: number | null;
  heightIn: number | null;
  priceBreakdown: unknown;
  totalCents: number;
  depositRequiredCents: number;
  placement: string;
  deliveryMethod: string;
  deliveryAddress: string | null;
  neededBy: string | null;
  rush: boolean;
  source: string | null;
  createdBy: string;
  proofApprovedAt: Date | null;
  engineReport: unknown;
  notesCustomer: string | null;
}

export interface SavedOrder {
  id: string;
  number: string;
  public_token: string;
  customer_id: string;
}

export async function createOrder(db: Db, o: NewOrder): Promise<SavedOrder> {
  return db.tx(async (t) => {
    // matched by email for repeat customers; the latest name and phone are kept
    const [c] = await t.query<{ id: string }>(
      `insert into customers (name, email, phone, source) values ($1, $2, $3, $4)
       on conflict ((lower(email))) do update set name = excluded.name, phone = excluded.phone
       returning id`,
      [o.customer.name, o.customer.email, o.customer.phone, o.customer.source ?? null],
    );
    const [row] = await t.query<SavedOrder>(
      `insert into orders (customer_id, status, product, design, width_in, height_in, price_breakdown, total, deposit_required,
         placement, delivery_method, delivery_address, needed_by, rush, source, created_by, proof_approved_at, engine_report, notes_customer)
       values ($1, 'new', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       returning id, number, public_token, customer_id`,
      [
        c.id, o.product, JSON.stringify(o.design), o.widthIn, o.heightIn, JSON.stringify(o.priceBreakdown), o.totalCents, o.depositRequiredCents,
        o.placement, o.deliveryMethod, o.deliveryAddress, o.neededBy, o.rush, o.source, o.createdBy, o.proofApprovedAt, JSON.stringify(o.engineReport), o.notesCustomer,
      ],
    );
    await t.query(`insert into status_history (order_id, from_status, to_status, note) values ($1, null, 'new', $2)`, [row.id, `Order submitted (${o.createdBy})`]);
    return row;
  });
}

export async function countActiveOrders(db: Db): Promise<number> {
  const [r] = await db.query<{ n: number }>('select count(*)::int as n from orders where status = any($1)', [ACTIVE_STATUSES]);
  return r.n;
}

export interface PublicOrder {
  number: string;
  status: string;
  design: any;
  price_breakdown: any;
  total: number;
  deposit_required: number;
  needed_by: string | null;
  delivery_method: string | null;
  created_at: string;
  customer_name: string;
  customer_email: string;
}

/** An order for its confirmation page; null unless the token matches. */
export async function getOrderForCustomer(db: Db, number: string, token: string): Promise<PublicOrder | null> {
  if (!token) return null;
  const rows = await db.query<PublicOrder>(
    `select o.number, o.status, o.design, o.price_breakdown, o.total, o.deposit_required, to_char(o.needed_by, 'YYYY-MM-DD') as needed_by,
            o.delivery_method, o.created_at, c.name as customer_name, c.email as customer_email
       from orders o join customers c on c.id = o.customer_id
      where o.number = $1 and o.public_token = $2`,
    [number, token],
  );
  const r = rows[0];
  if (!r) return null;
  const json = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
  return { ...r, design: json(r.design), price_breakdown: json(r.price_breakdown) };
}

export async function addOrderFile(db: Db, orderId: string, kind: 'svg' | 'png' | 'dxf', storagePath: string): Promise<number> {
  const [r] = await db.query<{ version: number }>(
    `insert into order_files (order_id, kind, storage_path, version)
     values ($1, $2, $3, coalesce((select max(version) from order_files where order_id = $1 and kind = $2), 0) + 1)
     returning version`,
    [orderId, kind, storagePath],
  );
  return r.version;
}

export async function logEmail(
  db: Db,
  e: { orderId: string | null; template: string; recipient: string; subject: string; status: 'sent' | 'failed' | 'held' | 'skipped'; providerMessageId?: string | null; error?: string | null; sentAt?: Date },
) {
  await db.query(
    'insert into email_log (order_id, template, recipient, subject, status, provider_message_id, error, sent_at) values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))',
    [e.orderId, e.template, e.recipient, e.subject, e.status, e.providerMessageId ?? null, e.error ?? null, e.sentAt?.toISOString() ?? null],
  );
}

export async function emailLog(db: Db, orderId: string) {
  return db.query<{ template: string; recipient: string; status: string; error: string | null }>(
    'select template, recipient, status, error from email_log where order_id = $1 order by id',
    [orderId],
  );
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function saveDesign(db: Db, design: unknown): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = randomId(10);
    const r = await db.query('insert into saved_designs (share_id, design) values ($1, $2) on conflict do nothing returning share_id', [id, JSON.stringify(design)]);
    if (r.length) return id;
  }
  throw new Error('Could not save the design');
}

export async function getSavedDesign(db: Db, shareId: string): Promise<unknown | null> {
  const [r] = await db.query<{ design: any }>('select design from saved_designs where share_id = $1', [shareId]);
  return r ? (typeof r.design === 'string' ? JSON.parse(r.design) : r.design) : null;
}

/** Records a submission and returns how many this key made in the last hour, this one included. */
export async function recordSubmission(db: Db, key: string, now = new Date()): Promise<number> {
  await db.query("delete from submission_log where at < $1::timestamptz - interval '1 day'", [now.toISOString()]);
  await db.query('insert into submission_log (key, at) values ($1, $2)', [key, now.toISOString()]);
  const [r] = await db.query<{ n: number }>("select count(*)::int as n from submission_log where key = $1 and at > $2::timestamptz - interval '1 hour'", [key, now.toISOString()]);
  return r.n;
}
