// POST /api/orders end to end against a real Postgres (PGlite), with email,
// storage and Turnstile replaced by recorders.
import { beforeEach, describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings, type Settings } from '@/lib/config/catalog';
import type { Db } from '@/lib/db/client';
import { emailLog, getOrderForCustomer } from '@/lib/db/orders';
import { defaultDesign, normalizeDesign } from '@/lib/order/design';
import type { OutgoingEmail } from '@/lib/server/email';
import { loadFontFile } from '@/lib/server/fonts';
import { submitOrder, type SubmitBody, type SubmitDeps } from '@/lib/server/submit-order';
import { freshDb } from '../db/pglite';

const catalog = seedCatalog();
let db: Db;
let sent: OutgoingEmail[];
let uploads: string[];
let settings: Settings;

beforeEach(async () => {
  db = await freshDb();
  sent = [];
  uploads = [];
  settings = seedSettings();
}, 60_000);

const deps = (over: Partial<SubmitDeps> = {}): SubmitDeps => ({
  db,
  catalog,
  settings,
  loadFont: loadFontFile,
  sendEmail: async (e) => (sent.push(e), { status: 'sent', id: `msg-${sent.length}` }),
  upload: async (path) => (uploads.push(path), { ok: true }),
  verifyTurnstile: async (token) => ({ ok: token === 'good-token' }),
  siteUrl: 'https://signs.example',
  notifyEmail: null,
  ip: '203.0.113.7',
  deviceId: 'device-1',
  now: new Date('2026-11-02T18:00:00Z'),
  ...over,
});

const nursery = () => normalizeDesign({ ...defaultDesign(catalog, seedSettings(), 'product.nursery-name'), lines: [{ role: 'main', text: 'Ava', fontId: 'font.pacifico' }] }, catalog);
const body = (over: Partial<SubmitBody> = {}): SubmitBody => ({
  design: nursery(),
  contact: { name: 'Jane Smith', email: 'jane@example.com', phone: '780-555-0100', heardFrom: 'Facebook Marketplace' },
  proofApproved: true,
  turnstileToken: 'good-token',
  website: '',
  ...over,
});

describe('a good order', () => {
  test('is saved as S-1001 with its price snapshot, files and both emails', async () => {
    const res = await submitOrder(body(), deps());
    expect(res.status).toBe(201);
    if (res.status !== 201) return;
    expect(res.body).toMatchObject({ number: 'S-1001', totalCents: 7500, amountDueCents: 7500 });
    expect(res.body.confirmationUrl).toBe(`/order/S-1001/confirmation?t=${res.body.token}`);

    const [o] = await db.query('select * from orders');
    expect(o).toMatchObject({ number: 'S-1001', status: 'new', total: 7500, deposit_required: 7500, product: 'product.nursery-name', created_by: 'customer', rush: false });
    expect(o.proof_approved_at).not.toBeNull();
    expect(o.design.labels).toMatchObject({ product: 'Nursery name sign', size: '36 in wide', material: 'Birch plywood 1/4 in' });
    expect(o.price_breakdown.lines.map((l: any) => l.key)).toContain('size');
    expect(o.engine_report.pieceCount).toBe(1);
    expect((await db.query('select to_status from status_history')).map((r) => r.to_status)).toEqual(['new']);
    expect((await db.query('select name, email from customers'))[0]).toEqual({ name: 'Jane Smith', email: 'jane@example.com' });

    expect(uploads).toEqual([
      'orders/S-1001/v1/S-1001_Smith_36in_Birch-6mm.svg',
      'orders/S-1001/v1/S-1001_Smith_36in_Birch-6mm.png',
      'orders/S-1001/v1/S-1001_Smith_36in_Birch-6mm.dxf',
    ]);
    expect((await db.query('select kind, version from order_files order by id')).map((r) => r.kind)).toEqual(['svg', 'png', 'dxf']);

    // alert to you with the preview inline and the SVG attached; customer email held until a domain is set
    expect(sent).toHaveLength(1);
    const alert = sent[0];
    expect(alert.to).toBe('donovanarntson@gmail.com');
    expect(alert.from).toBe("Canada's Craftsmen <onboarding@resend.dev>");
    expect(alert.subject).toBe('New order S-1001 · Smith · 36 in · $75 · UNPAID');
    expect(alert.attachments!.map((a) => [a.filename, a.contentId])).toEqual([
      ['S-1001_Smith_36in_Birch-6mm.png', 'sign-preview'],
      ['S-1001_Smith_36in_Birch-6mm.svg', undefined],
    ]);
    expect(String(alert.attachments![1].content)).toMatch(/^<\?xml|<svg/);
    expect(alert.html).toContain('cid:sign-preview');
    expect(alert.html).toContain('https://signs.example/admin/orders/');
    const log = await emailLog(db, o.id);
    expect(log.map((l) => [l.template, l.status])).toEqual([['new_order_alert', 'sent'], ['order_received', 'held']]);
  });

  test('once a sending domain is set, the customer email goes out with amount due, payment instructions and refund policy', async () => {
    settings.emails.from_address = 'orders@signs.example';
    settings.emails.from_name = 'Prairie Signs';
    const res = await submitOrder(body(), deps());
    expect(res.status).toBe(201);
    const customer = sent.find((e) => e.to === 'jane@example.com')!;
    expect(customer.from).toBe('Prairie Signs <orders@signs.example>');
    expect(customer.replyTo).toBe('donovanarntson@gmail.com');
    expect(customer.subject).toBe('Your sign order S-1001');
    expect(customer.text).toContain('Amount due: $75');
    expect(customer.text).toContain('Send an Interac e-Transfer to donovanarntson@gmail.com and put your order number S-1001 in the message.');
    expect(customer.text).toContain('If you cancel before cutting starts, you get 50% back');
    expect(customer.text).toContain(settings.business.pickup_note);
    expect(customer.attachments!.map((a) => a.contentId)).toEqual(['sign-preview']);
  });

  test('the confirmation page only opens with the order’s own token', async () => {
    const res = await submitOrder(body(), deps());
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    expect(await getOrderForCustomer(db, 'S-1001', 'wrong')).toBeNull();
    expect(await getOrderForCustomer(db, 'S-1001', '')).toBeNull();
    expect(await getOrderForCustomer(db, 'S-1001', res.body.token)).toMatchObject({ number: 'S-1001', total: 7500, customer_name: 'Jane Smith' });
  });

  test('a repeat customer is matched by email; order numbers count up', async () => {
    await submitOrder(body(), deps());
    const res = await submitOrder(body({ contact: { name: 'Jane Smith-Lee', email: 'JANE@example.com', phone: '780-555-0199' } }), deps({ deviceId: 'device-2' }));
    expect(res.status === 201 && res.body.number).toBe('S-1002');
    expect(await db.query('select name from customers')).toEqual([{ name: 'Jane Smith-Lee' }]);
  });
});

describe('the server never trusts the browser', () => {
  test('a tampered price is ignored and recalculated', async () => {
    const res = await submitOrder(body({ totalCents: 100, quote: { totalCents: 100 }, price: 1 } as any), deps());
    expect(res.status === 201 && res.body.totalCents).toBe(7500);
    expect((await db.query('select total from orders'))[0].total).toBe(7500);
  });
  test('an option that is switched off is refused', async () => {
    const cat = catalog.map((o) => (o.id === 'size.w36' ? { ...o, enabled: false } : o));
    const res = await submitOrder(body(), deps({ catalog: cat }));
    expect(res.status).toBe(422);
  });
  test('a design the engine can’t cut is refused with its message', async () => {
    const d = { ...nursery(), lines: [{ role: 'main' as const, text: 'Montgomery Fairbanks', fontId: 'font.pacifico' }], sizeId: 'size.w12' };
    const res = await submitOrder(body({ design: d }), deps());
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('error');
    expect(await db.query('select 1 from orders')).toEqual([]);
  });
  test('the proof must be approved', async () => {
    expect((await submitOrder(body({ proofApproved: false }), deps())).status).toBe(422);
  });
  test('a needed-by date sooner than the lead time is refused unless rush is added', async () => {
    const soon = { name: 'Jane Smith', email: 'jane@example.com', phone: '780-555-0100', neededBy: '2026-11-06' };
    const res = await submitOrder(body({ contact: soon }), deps());
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/earliest .* Nov 9, 2026/) });
    const rush = await submitOrder(body({ contact: soon, design: { ...nursery(), addonIds: ['addon.rush'] } }), deps({ deviceId: 'd2' }));
    expect(rush.status === 201 && rush.body.totalCents).toBe(9400); // $75 + 25% rush = $93.75, rounded to $94
  });
  test('customer text is escaped in the HTML email', async () => {
    const d = { ...nursery(), lines: [{ role: 'main' as const, text: 'Ava', fontId: 'font.pacifico' }] };
    await submitOrder(body({ design: d, contact: { name: 'Jane <b>Smith</b>', email: 'jane@example.com', phone: '780-555-0100', notes: '<script>alert(1)</script>' } }), deps());
    expect(sent[0].html).not.toContain('<script>');
    expect(sent[0].html).toContain('&lt;script&gt;');
  });
});

describe('spam protection', () => {
  test('the honeypot field refuses bots', async () => {
    expect((await submitOrder(body({ website: 'http://spam.example' }), deps())).status).toBe(400);
    expect(await db.query('select 1 from orders')).toEqual([]);
  });
  test('a failed Turnstile check is refused', async () => {
    expect((await submitOrder(body({ turnstileToken: 'bad' }), deps())).status).toBe(403);
  });
  test('5 submissions per hour per device; the 6th is refused', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await submitOrder(body({ proofApproved: false }), deps())).status);
    expect(statuses).toEqual([422, 422, 422, 422, 422, 429]);
    // another device is fine, and so is the same device an hour later
    expect((await submitOrder(body({ proofApproved: false }), deps({ deviceId: 'other', ip: '198.51.100.1' }))).status).toBe(422);
    expect((await submitOrder(body({ proofApproved: false }), deps({ now: new Date('2026-11-02T19:30:00Z') }))).status).toBe(422);
  });
  test('the pause switch stops new orders with its message', async () => {
    settings.production.paused = true;
    settings.production.pause_message = 'Closed for the holidays until Jan 5.';
    expect(await submitOrder(body(), deps())).toEqual({ status: 503, body: { error: 'Closed for the holidays until Jan 5.' } });
  });
});

describe('when outside services fail', () => {
  test('the order is still saved; failures are logged', async () => {
    const res = await submitOrder(body(), deps({ sendEmail: async () => ({ status: 'failed', error: 'Resend 500' }), upload: async () => ({ ok: false, error: 'down' }) }));
    expect(res.status).toBe(201);
    expect(await db.query('select 1 from order_files')).toEqual([]);
    const [o] = await db.query('select id from orders');
    expect((await emailLog(db, o.id)).map((l) => [l.status, l.error])).toEqual([['failed', 'Resend 500'], ['held', expect.any(String)]]);
  });
});
