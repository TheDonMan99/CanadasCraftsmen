// Order rules that aren't about the sign itself: lead time and capacity, the
// customer's contact details, the refund policy and payment instructions.

import { byCategory, type CatalogOption, type Settings } from '@/lib/config/catalog';
import { dollars } from '@/lib/pricing';

/** Statuses that still take up production capacity. */
export const ACTIVE_STATUSES = ['new', 'awaiting_payment', 'deposit_paid', 'paid_in_full', 'in_production'];

/** Today's date (YYYY-MM-DD) in the business's time zone. */
export function localToday(settings: Settings, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: settings.business.timezone || 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Earliest ready date. Standard orders queue behind the orders already open:
 * each full week of capacity ahead of this one pushes it back a week. Rush orders
 * use the rush lead time.
 */
export function earliestReadyDate(settings: Settings, today: string, rush: boolean, activeOrders: number): string {
  const p = settings.production;
  if (rush) return addDays(today, p.rush_lead_time_days);
  const weeksQueued = p.weekly_capacity > 0 ? Math.floor(activeOrders / p.weekly_capacity) : 0;
  return addDays(today, p.lead_time_days + 7 * weeksQueued);
}

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
  address?: string;
  neededBy?: string;
  heardFrom?: string;
  notes?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkContact(c: Contact, opts: { needsAddress: boolean; earliest: string; rush: boolean }): string[] {
  const errors: string[] = [];
  if (!c || typeof c !== 'object') return ['Fill in your contact details.'];
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (!s(c.name)) errors.push('Type your name.');
  if (s(c.name).length > 100) errors.push('Your name is too long.');
  if (!EMAIL.test(s(c.email)) || s(c.email).length > 200) errors.push('Type a valid email address.');
  if (s(c.phone).replace(/\D/g, '').length < 10 || s(c.phone).length > 30) errors.push('Type a phone number with area code.');
  if (opts.needsAddress && !s(c.address)) errors.push('Type the delivery address.');
  if (s(c.address).length > 300) errors.push('The address is too long.');
  if (s(c.notes).length > 1000) errors.push('Notes are limited to 1000 characters.');
  if (c.neededBy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.neededBy)) errors.push('Pick a needed-by date.');
    else if (c.neededBy < opts.earliest)
      errors.push(`The earliest we can have it ready is ${formatDate(opts.earliest)}${opts.rush ? '' : '. Pick a later date, or add rush'}.`);
  }
  return errors;
}

/** The refund policy in words, from the percentages in Settings → Payments. */
export function refundPolicy(settings: Settings): string {
  const p = settings.payments;
  const before = p.refund_customer_cancel_before_cut_pct;
  const after = p.refund_customer_cancel_after_cut_pct;
  const part = (pct: number) => (pct >= 100 ? 'a full refund' : pct > 0 ? `${pct}% back` : 'no refund');
  return `Custom signs are made to order. If you cancel before cutting starts, you get ${part(before)}; after cutting starts, ${part(after)}.`;
}

/** Payment instructions for every payment method that's on. */
export function paymentInstructions(catalog: CatalogOption[], settings: Settings, orderNumber: string, amountCents: number): string[] {
  return byCategory(catalog, 'payment_method').map((m) => {
    const text = String(m.values.instructions ?? '')
      .replace(/\{payment_email\}/g, settings.payments.payment_email)
      .replace(/\{order_number\}/g, orderNumber)
      .replace(/\{amount\}/g, dollars(amountCents));
    return `${m.label}: ${text}`;
  });
}
