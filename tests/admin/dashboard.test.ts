// The dashboard's database rules against a real Postgres (PGlite): payment statuses,
// append-only payments, cancellation refunds, the production view, proofs, users.
import { beforeEach, describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { lookupUser } from '@/lib/auth/session';
import {
  approveProof,
  boardOrders,
  cancelOrder,
  createShortLink,
  getOrderByProofToken,
  getOwnerOrder,
  getProductionOrder,
  homeStats,
  inviteUser,
  listOrders,
  markReviewed,
  orderHistory,
  overrideCutGate,
  recordPayment,
  removeUser,
  resolveShortLink,
  saveEditedDesign,
  saveRole,
  setStatus,
} from '@/lib/db/admin';
import type { Db } from '@/lib/db/client';
import { createOrder } from '@/lib/db/orders';
import { defaultDesign, designLabels, engineDesign } from '@/lib/order/design';
import { storedOrderVars } from '@/lib/server/order-emails';
import { freshDb } from '../db/pglite';

const catalog = seedCatalog();
const settings = seedSettings();
let db: Db;
let id: string;

async function placeOrder(total = 7500, email = 'jane@example.com') {
  const d = defaultDesign(catalog, settings, 'product.nursery-name');
  const o = await createOrder(db, {
    customer: { name: 'Jane Smith', email, phone: '780-555-0100' },
    product: d.productId,
    design: { ...d, engine: engineDesign(d, catalog, settings), labels: designLabels(d, catalog) },
    widthIn: 36, heightIn: 17.3, priceBreakdown: { lines: [{ key: 'size', label: '36 in wide', cents: total }] }, totalCents: total, depositRequiredCents: total,
    placement: d.placementId, deliveryMethod: d.deliveryId, deliveryAddress: '12 Elm St', neededBy: '2026-11-20', rush: false, source: 'Facebook Marketplace',
    createdBy: 'customer', proofApprovedAt: new Date(), engineReport: { pieceCount: 1 }, notesCustomer: 'Thanks!',
  });
  return o.id;
}

const pay = (amount: number, kind: 'payment' | 'refund' = 'payment', s = settings) =>
  recordPayment(db, id, { amountCents: amount, kind, method: 'Interac e-Transfer', receivedAt: '2026-11-03', reference: 'CA123' }, 'owner@test', s);

beforeEach(async () => {
  db = await freshDb();
  id = await placeOrder();
}, 60_000);

describe('payments move statuses on their own', () => {
  test('opening a new order moves it to Awaiting payment; full payment to Paid in full', async () => {
    await markReviewed(db, id, 'owner@test');
    expect((await getOwnerOrder(db, id))!.status).toBe('awaiting_payment');
    expect(await pay(4000)).toEqual({ status: 'awaiting_payment', paid: 4000, balance: 3500 });
    expect(await pay(3500)).toEqual({ status: 'paid_in_full', paid: 7500, balance: 0 });
    expect((await orderHistory(db, id)).map((h) => h.to_status)).toEqual(['new', 'awaiting_payment', 'paid_in_full']);
  });
  test('with deposits on, a deposit gives Deposit paid', async () => {
    const dep = { ...settings, payments: { ...settings.payments, amount_due_pct: 50 } };
    await db.query('update orders set deposit_required = 3750 where id = $1', [id]);
    expect((await pay(3750, 'payment', dep)).status).toBe('deposit_paid');
  });
  test('payments are append-only: they can’t be edited or deleted', async () => {
    await pay(7500);
    await expect(db.query('update payments set amount = 1')).rejects.toThrow(/append-only/);
    await expect(db.query('delete from payments')).rejects.toThrow(/append-only/);
    await expect(db.query('delete from status_history')).rejects.toThrow(/append-only/);
  });
  test('amounts must be positive', async () => {
    await expect(pay(0)).rejects.toThrow(/above \$0/);
  });
  test('home cards: unpaid balance, revenue this month, new orders', async () => {
    await placeOrder(5500, 'sam@example.com');
    await pay(7500);
    const s = await homeStats(db, '2026-11-05');
    expect(s).toMatchObject({ unpaidCents: 5500, unpaidOrders: 1, revenueThisMonthCents: 7500, newOrders: 1, dueThisWeek: 0 });
    expect((await listOrders(db, { paid: 'unpaid' })).length).toBe(1);
    expect((await listOrders(db, { q: 'ava' })).length).toBe(2);
  });
});

describe('cancelling records the refund owed under the policy', () => {
  test('customer cancels before cutting: 50% back', async () => {
    await pay(7500);
    expect(await cancelOrder(db, id, { by: 'customer', reason: 'Changed mind' }, 'owner@test', settings)).toEqual({ refundCents: 3750 });
    const o = (await getOwnerOrder(db, id))!;
    expect(o).toMatchObject({ status: 'cancelled', paid: 3750, cancelled_by: 'customer' });
    const refunds = await db.query("select amount, kind from payments where kind = 'refund'");
    expect(refunds).toEqual([{ amount: 3750, kind: 'refund' }]);
  });
  test('customer cancels after cutting started: nothing back; you cancel: everything back', async () => {
    await pay(7500);
    await setStatus(db, id, 'in_production', null, 'owner@test');
    expect((await cancelOrder(db, id, { by: 'customer', reason: 'Moving' }, 'owner@test', settings)).refundCents).toBe(0);
    id = await placeOrder(6000, 'b@example.com');
    await pay(6000);
    expect((await cancelOrder(db, id, { by: 'owner', reason: 'Out of maple' }, 'owner@test', settings)).refundCents).toBe(6000);
  });
  test('a reason is required', async () => {
    await expect(cancelOrder(db, id, { by: 'owner', reason: ' ' }, 'o', settings)).rejects.toThrow(/reason/);
  });
});

describe('the production view', () => {
  test('never includes prices, payments or contact details', async () => {
    await pay(7500);
    const p = (await getProductionOrder(db, id))!;
    const text = JSON.stringify(p);
    for (const secret of ['7500', 'jane@example.com', '780-555-0100', 'Smith', '12 Elm St', 'Thanks!', 'price_breakdown', 'total'])
      expect(text, `production view leaks ${secret}`).not.toContain(secret);
    expect(p).toMatchObject({ number: 'S-1001', first_name: 'Jane', paid_up: true, status: 'paid_in_full' });
    expect(p.design.labels.product).toBe('Nursery name sign');
    const board = JSON.stringify(await boardOrders(db, settings));
    expect(board).toContain('S-1001');
    expect(board).not.toContain('7500');
    expect(board).not.toContain('jane@example.com');
  });
  test('production can only move paid orders between the production statuses', async () => {
    await expect(setStatus(db, id, 'in_production', null, 'prod@test', { productionOnly: true })).rejects.toThrow(/paid orders/);
    await pay(7500);
    await setStatus(db, id, 'in_production', null, 'prod@test', { productionOnly: true });
    await setStatus(db, id, 'ready', null, 'prod@test', { productionOnly: true });
    await expect(setStatus(db, id, 'awaiting_payment', null, 'prod@test', { productionOnly: true })).rejects.toThrow();
    expect((await getOwnerOrder(db, id))!.status).toBe('ready');
  });
});

describe('cut-file override, edited proofs and short links', () => {
  test('an override saves its reason in the order history', async () => {
    await overrideCutGate(db, id, 'Paying cash at pickup', 'owner@test');
    expect((await getOwnerOrder(db, id))!.cut_override_reason).toBe('Paying cash at pickup');
    expect((await orderHistory(db, id)).at(-1)!.note).toContain('Cut-file override: Paying cash at pickup');
  });
  test('an edited design keeps the approved version and waits for re-approval; the link works once', async () => {
    const before = (await getOwnerOrder(db, id))!;
    const d = { ...before.design, lines: [{ role: 'main', text: 'Eva', fontId: 'font.pacifico' }] };
    const { proofToken } = await saveEditedDesign(db, id, { design: d, widthIn: 36, heightIn: 17, engineReport: {}, requestProof: true }, 'owner@test');
    const after = (await getOwnerOrder(db, id))!;
    expect(after.design.history).toHaveLength(1);
    expect(after.design.history[0].lines[0].text).toBe('Ava');
    expect(after.design.history[0].approved_at).toBeTruthy();
    expect(after.proof_approved_at).toBeNull();
    expect(after.total).toBe(7500);
    expect((await getOrderByProofToken(db, proofToken!))!.number).toBe('S-1001');
    expect(await approveProof(db, proofToken!)).toBe('S-1001');
    expect(await approveProof(db, proofToken!)).toBeNull();
    expect((await getOwnerOrder(db, id))!.proof_approved_at).not.toBeNull();
  });
  test('repricing an edit changes the total; not repricing keeps it', async () => {
    const o = (await getOwnerOrder(db, id))!;
    await saveEditedDesign(db, id, { design: o.design, widthIn: 36, heightIn: 17, engineReport: {}, totalCents: 8500, depositCents: 8500, priceBreakdown: { lines: [] }, requestProof: false }, 'owner@test');
    expect((await getOwnerOrder(db, id))!.total).toBe(8500);
  });
  test('short links resolve to their design', async () => {
    const code = await createShortLink(db, 'design', 'abcDEF2345');
    expect(code).toMatch(/^[A-Za-z0-9]{4}$/);
    expect(await resolveShortLink(db, code)).toEqual({ target_type: 'design', target_id: 'abcDEF2345' });
  });
});

describe('users and roles', () => {
  test('only invited people sign in; roles carry their switches; the last owner stays', async () => {
    expect((await lookupUser(db, 'DonovanArntson@gmail.com'))!.role).toBe('owner');
    expect(await lookupUser(db, 'stranger@example.com')).toBeNull();
    await inviteUser(db, 'Helper@Example.com', 'production', 'owner@test');
    const helper = (await lookupUser(db, 'helper@example.com'))!;
    expect(helper.role).toBe('production');
    expect(helper.perms).toMatchObject({ view_board: true, download_files: true, view_prices: false, view_payments: false, view_contacts: false, record_payments: false, override_cut_gate: false });
    await saveRole(db, 'production', { view_board: true, download_files: true, view_prices: true }, 'owner@test');
    expect((await lookupUser(db, 'helper@example.com'))!.perms.view_prices).toBe(true);
    await expect(removeUser(db, 'donovanarntson@gmail.com', 'owner@test')).rejects.toThrow(/always be an owner/);
    await removeUser(db, 'helper@example.com', 'owner@test');
    expect(await lookupUser(db, 'helper@example.com')).toBeNull();
  });
});

describe('status emails', () => {
  test('a payment reminder shows the balance owing and how to pay', async () => {
    await pay(2500);
    const o = (await getOwnerOrder(db, id))!;
    const vars = storedOrderVars(o, catalog, settings, 'https://signs.example');
    expect(vars).toMatchObject({ order_number: 'S-1001', first_name: 'Jane', balance: '$50', paid: '$25', paid_status: 'PART PAID' });
    expect(vars.payment_instructions).toContain('S-1001');
  });
});
