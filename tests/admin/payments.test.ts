// Payment statuses, refunds under the policy, and the cut-file gate.
import { describe, expect, test } from 'vitest';
import { seedSettings } from '@/lib/config/catalog';
import { cutFileGate, paidCents, paymentBadge, refundOwed, statusAfterPayment } from '@/lib/order/payments';

const settings = seedSettings();
const deposits = { ...settings, payments: { ...settings.payments, amount_due_pct: 50 } };

describe('statuses follow payments', () => {
  test('full payment upfront: awaiting → paid in full', () => {
    expect(statusAfterPayment('awaiting_payment', 7500, 7500, 7500, settings)).toBe('paid_in_full');
    expect(statusAfterPayment('awaiting_payment', 7500, 7500, 4000, settings)).toBe('awaiting_payment');
    expect(statusAfterPayment('new', 7500, 7500, 2000, settings)).toBe('awaiting_payment');
  });
  test('“Deposit paid” only appears with deposits switched on', () => {
    expect(statusAfterPayment('awaiting_payment', 7500, 3750, 3750, deposits)).toBe('deposit_paid');
    expect(statusAfterPayment('deposit_paid', 7500, 3750, 7500, deposits)).toBe('paid_in_full');
    expect(statusAfterPayment('awaiting_payment', 7500, 7500, 3750, settings)).toBe('awaiting_payment');
  });
  test('a refund takes a paid order back to awaiting payment', () => {
    expect(statusAfterPayment('paid_in_full', 7500, 7500, 5000, settings)).toBe('awaiting_payment');
  });
  test('production statuses are never changed by payments', () => {
    expect(statusAfterPayment('in_production', 7500, 7500, 0, settings)).toBe('in_production');
    expect(statusAfterPayment('ready', 7500, 7500, 7500, settings)).toBe('ready');
  });
  test('refunds count against what was paid; badges', () => {
    const rows = [{ amount: 7500, kind: 'payment' as const }, { amount: 3750, kind: 'refund' as const }];
    expect(paidCents(rows)).toBe(3750);
    expect(paymentBadge(7500, 7500, rows, settings)).toBe('Unpaid');
    expect(paymentBadge(7500, 7500, [{ amount: 7500, kind: 'payment' }], settings)).toBe('Paid in full');
    expect(paymentBadge(7500, 7500, [{ amount: 7500, kind: 'payment' }, { amount: 7500, kind: 'refund' }], settings)).toBe('Refunded');
    expect(paymentBadge(7500, 3750, [{ amount: 3750, kind: 'payment' }], deposits)).toBe('Deposit paid');
  });
});

describe('refund owed on cancellation', () => {
  test('customer before cutting: 50%; after cutting: nothing; you cancel: 100%', () => {
    expect(refundOwed(7500, 'customer', false, settings)).toBe(3750);
    expect(refundOwed(7500, 'customer', true, settings)).toBe(0);
    expect(refundOwed(7500, 'owner', true, settings)).toBe(7500);
    expect(refundOwed(0, 'owner', false, settings)).toBe(0);
  });
});

describe('cut-file gate', () => {
  const unpaid = { status: 'awaiting_payment' as const, total: 7500, paid: 0 };
  test('blocked until paid in full', () => {
    expect(cutFileGate(unpaid, settings).allowed).toBe(false);
    expect(cutFileGate({ ...unpaid, paid: 7400 }, settings).allowed).toBe(false);
    expect(cutFileGate({ ...unpaid, paid: 7500 }, settings)).toEqual({ allowed: true });
    expect(cutFileGate({ ...unpaid, status: 'in_production' }, settings).allowed).toBe(true);
  });
  test('an override with a reason releases them, with a warning', () => {
    expect(cutFileGate({ ...unpaid, cut_override_reason: 'Paying cash at pickup' }, settings)).toEqual({ allowed: true, warning: expect.stringContaining('Paying cash at pickup') });
  });
  test('warn-only mode', () => {
    const warn = { ...settings, production: { ...settings.production, require_full_payment_for_cut_files: false } };
    expect(cutFileGate(unpaid, warn)).toEqual({ allowed: true, warning: 'This order isn’t paid in full yet.' });
  });
});
