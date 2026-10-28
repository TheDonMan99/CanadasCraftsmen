// Order statuses and the payment rules behind them (SPEC.md, "Admin dashboard
// and payment tracking"). Pure, so the dashboard and the tests agree.

import type { Settings } from '@/lib/config/catalog';

export const STATUSES = ['new', 'awaiting_payment', 'deposit_paid', 'paid_in_full', 'in_production', 'ready', 'complete', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  awaiting_payment: 'Awaiting payment',
  deposit_paid: 'Deposit paid',
  paid_in_full: 'Paid in full',
  in_production: 'In production',
  ready: 'Ready',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

/** Statuses that payments move an order between. */
export const PAYMENT_STATUSES: Status[] = ['new', 'awaiting_payment', 'deposit_paid', 'paid_in_full'];
/** Statuses you set by hand (from the order or the production board). */
export const PRODUCTION_STATUSES: Status[] = ['in_production', 'ready', 'complete'];
/** Once an order reaches these, cutting has started. */
export const CUT_STARTED: Status[] = ['in_production', 'ready', 'complete'];

export interface PaymentRow {
  amount: number;
  kind: 'payment' | 'refund';
}

/** Money received less money refunded, in cents. */
export const paidCents = (rows: PaymentRow[]) => rows.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
export const refundedCents = (rows: PaymentRow[]) => rows.reduce((s, p) => s + (p.kind === 'refund' ? p.amount : 0), 0);

export const depositsOn = (settings: Settings) => settings.payments.amount_due_pct < 100;

/**
 * The status payments put an order in. Production statuses and cancelled orders
 * are left alone; "Deposit paid" only appears when deposits are switched on.
 */
export function statusAfterPayment(current: Status, totalCents: number, depositCents: number, paid: number, settings: Settings): Status {
  if (!PAYMENT_STATUSES.includes(current)) return current;
  if (paid >= totalCents && totalCents > 0) return 'paid_in_full';
  if (depositsOn(settings) && paid > 0 && paid >= depositCents) return 'deposit_paid';
  if (paid > 0 || current !== 'new') return 'awaiting_payment';
  return 'new';
}

export type Badge = 'Unpaid' | 'Deposit paid' | 'Paid in full' | 'Refunded';

export function paymentBadge(totalCents: number, depositCents: number, rows: PaymentRow[], settings: Settings): Badge {
  const paid = paidCents(rows);
  if (refundedCents(rows) > 0 && paid <= 0) return 'Refunded';
  if (paid >= totalCents && totalCents > 0) return 'Paid in full';
  if (depositsOn(settings) && paid > 0 && paid >= depositCents) return 'Deposit paid';
  return 'Unpaid';
}

/**
 * Refund owed when an order is cancelled: customer cancellations follow the
 * refund policy (before or after cutting starts); cancellations by you default to
 * the owner-cancel percentage (100%).
 */
export function refundOwed(paid: number, by: 'customer' | 'owner', cutStarted: boolean, settings: Settings): number {
  if (paid <= 0) return 0;
  const p = settings.payments;
  const pct = by === 'owner' ? p.refund_owner_cancel_pct : cutStarted ? p.refund_customer_cancel_after_cut_pct : p.refund_customer_cancel_before_cut_pct;
  return Math.round((paid * pct) / 100);
}

/** Whole days since a date. */
export const daysSince = (since: Date | string, now = new Date()) => Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000));

/** Cut files need full payment unless the gate is set to warn only, or you override it with a reason. */
export function cutFileGate(o: { status: Status; total: number; paid: number; cut_override_reason?: string | null }, settings: Settings): { allowed: boolean; warning?: string } {
  const paidUp = o.paid >= o.total || (['paid_in_full', ...CUT_STARTED] as Status[]).includes(o.status);
  if (paidUp) return { allowed: true };
  if (o.cut_override_reason) return { allowed: true, warning: `Unpaid: cut files released by override (${o.cut_override_reason}).` };
  if (!settings.production.require_full_payment_for_cut_files) return { allowed: true, warning: 'This order isn’t paid in full yet.' };
  return { allowed: false, warning: 'Cut files need full payment first.' };
}
