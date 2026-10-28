// Scheduled emails against a real Postgres (PGlite): 7 am Mountain whatever the
// season, once a day, the weekly summary on Mondays, review requests once per order.
import { beforeEach, describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings, type Settings } from '@/lib/config/catalog';
import { recordPayment, setStatus } from '@/lib/db/admin';
import type { Db } from '@/lib/db/client';
import { createOrder } from '@/lib/db/orders';
import { reportOrders } from '@/lib/db/reports';
import { defaultDesign, designLabels, engineDesign } from '@/lib/order/design';
import { dailyDigest } from '@/lib/reports/digest';
import type { OutgoingEmail } from '@/lib/server/email';
import { localClock, runScheduled } from '@/lib/server/scheduled';
import { freshDb } from '../db/pglite';

const catalog = seedCatalog();
let settings: Settings;
let db: Db;
let sent: OutgoingEmail[];

async function order(name: string, total: number, neededBy: string | null = null) {
  const d = defaultDesign(catalog, settings, 'product.nursery-name');
  return (await createOrder(db, {
    customer: { name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, phone: '780-555-0100' }, product: d.productId,
    design: { ...d, engine: engineDesign(d, catalog, settings), labels: designLabels(d, catalog) }, widthIn: 36, heightIn: 17, priceBreakdown: {}, totalCents: total,
    depositRequiredCents: total, placement: d.placementId, deliveryMethod: d.deliveryId, deliveryAddress: null, neededBy, rush: false, source: 'Instagram',
    createdBy: 'customer', proofApprovedAt: new Date(), engineReport: { widthIn: 36, heightIn: 17, laserMinutes: 12 }, notesCustomer: null,
  })).id;
}

const deps = (now: string) => ({ db, settings, catalog, siteUrl: 'https://signs.example', notifyEmail: null, now: new Date(now), sendEmail: async (e: OutgoingEmail) => (sent.push(e), { status: 'sent' as const, id: 'x' }) });

beforeEach(async () => {
  db = await freshDb();
  settings = seedSettings();
  sent = [];
}, 60_000);

describe('7 am Mountain, whatever the season', () => {
  test('summer: 13:00 UTC is 7 am; winter: 14:00 UTC is', () => {
    expect(localClock(settings, new Date('2026-07-01T13:00:00Z'))).toMatchObject({ date: '2026-07-01', hour: 7, weekday: 'Wed' });
    expect(localClock(settings, new Date('2026-12-02T13:00:00Z')).hour).toBe(6);
    expect(localClock(settings, new Date('2026-12-02T14:00:00Z')).hour).toBe(7);
  });

  test('the digest goes once a day, only at 7 am; the weekly summary only on Mondays', async () => {
    await order('Jane Smith', 7500, '2026-11-05');
    await db.query("update orders set created_at = '2026-11-02T18:00:00Z'");
    expect(await runScheduled(deps('2026-11-03T13:00:00Z'))).toEqual([]); // 6 am in November
    const ran = await runScheduled(deps('2026-11-03T14:00:00Z')); // Tuesday 7 am
    expect(ran.map((r) => [r.job, r.outcome])).toEqual([['daily_digest', 'sent'], ['review_request', 'off']]);
    expect(sent[0].to).toBe('donovanarntson@gmail.com');
    expect(sent[0].subject).toBe('Daily digest · 2026-11-03');
    expect(sent[0].text).toContain('Unpaid (1, $75 owing)');
    expect(sent[0].text).toContain('S-1001 · Jane Smith');
    expect(sent[0].text).toContain('Due this week (1)');
    expect((await runScheduled(deps('2026-11-03T14:20:00Z')))[0].outcome).toBe('already sent today');
    sent = [];
    const monday = await runScheduled(deps('2026-11-09T14:00:00Z'));
    expect(monday.map((r) => r.job)).toEqual(['daily_digest', 'weekly_summary', 'review_request']);
    const weekly = sent.find((e) => e.subject.startsWith('Weekly summary'))!;
    expect(weekly.text).toContain('Week of 2026-11-02 to 2026-11-08');
    expect(weekly.text).toContain('Unpaid balance now: $75');
  });

  test('a template saved before {digest} existed still gets the digest', async () => {
    settings.emails.templates.daily_digest.body = 'Unpaid orders, orders due this week and new orders.';
    await order('Jane Smith', 7500);
    await runScheduled(deps('2026-11-03T14:00:00Z'));
    expect(sent[0].text).toContain('Unpaid (1');
  });
});

describe('review requests', () => {
  test('3 days after Complete, once, when switched on with a review link', async () => {
    settings.emails.templates.review_request.enabled = true;
    settings.business.review_link = 'https://g.page/r/example/review';
    settings.emails.from_address = 'orders@signs.example';
    const id = await order('Jane Smith', 7500);
    await recordPayment(db, id, { amountCents: 7500, kind: 'payment', method: 'Cash', receivedAt: '2026-11-01' }, 'owner', settings);
    for (const s of ['in_production', 'ready', 'complete'] as const) await setStatus(db, id, s, null, 'owner');
    // backdate the completion (history is append-only, so the guard is switched off for this test setup only)
    await db.query('alter table status_history disable trigger status_history_append_only');
    await db.query("update status_history set changed_at = '2026-11-01T18:00:00Z' where to_status = 'complete'");
    await db.query('alter table status_history enable trigger status_history_append_only');
    const at = (iso: string) => runScheduled(deps(iso), { force: ['review_request'] });
    expect((await at('2026-11-03T14:00:00Z'))[0].outcome).toBe('0 review requests');
    expect((await at('2026-11-04T14:00:00Z'))[0].outcome).toBe('1 review request');
    expect(sent[0]).toMatchObject({ to: 'jane@example.com' });
    expect(sent[0].text).toContain('https://g.page/r/example/review');
    expect((await at('2026-11-05T14:00:00Z'))[0].outcome).toBe('0 review requests');
  });
});

describe('digest content', () => {
  test('lists new, unpaid with days waiting, and due this week', async () => {
    await order('Old Unpaid', 9000);
    await db.query("update orders set created_at = '2026-10-20T18:00:00Z'");
    await order('New Paid', 7500, '2026-11-06');
    await db.query("update orders set created_at = '2026-11-02T18:00:00Z' where number = 'S-1002'");
    const paidId = (await db.query("select id from orders where number = 'S-1002'"))[0].id;
    await recordPayment(db, paidId, { amountCents: 7500, kind: 'payment', method: 'Cash', receivedAt: '2026-11-03' }, 'o', settings);
    const d = dailyDigest(await reportOrders(db, settings, catalog), '2026-11-03', ['Birch plywood 1/4 in']);
    expect(d.counts).toEqual({ new: 1, unpaid: 1, due: 1 });
    expect(d.text).toContain('S-1001 · Old Unpaid · $90 owing · 14 days · send a reminder');
    expect(d.text).toContain('Low stock: Birch plywood 1/4 in');
  });
});
