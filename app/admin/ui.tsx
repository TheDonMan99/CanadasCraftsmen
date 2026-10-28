// Small shared pieces for the dashboard.
import Link from 'next/link';
import { STATUS_LABEL, type Badge, type Status } from '@/lib/order/payments';
import { dollars } from '@/lib/pricing';

const STATUS_COLOUR: Record<Status, string> = {
  new: 'bg-blue-100 text-blue-900',
  awaiting_payment: 'bg-amber-100 text-amber-900',
  deposit_paid: 'bg-amber-100 text-amber-900',
  paid_in_full: 'bg-green-100 text-green-900',
  in_production: 'bg-violet-100 text-violet-900',
  ready: 'bg-teal-100 text-teal-900',
  complete: 'bg-stone-200 text-stone-700',
  cancelled: 'bg-stone-200 text-stone-500 line-through',
};

export function StatusPill({ status }: { status: Status }) {
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOUR[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>;
}

const BADGE_COLOUR: Record<Badge, string> = {
  Unpaid: 'bg-red-100 text-red-900',
  'Deposit paid': 'bg-amber-100 text-amber-900',
  'Paid in full': 'bg-green-100 text-green-900',
  Refunded: 'bg-stone-200 text-stone-700',
};

export function PaidBadge({ badge, big }: { badge: Badge; big?: boolean }) {
  return <span className={`inline-block whitespace-nowrap rounded font-semibold ${big ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-xs'} ${BADGE_COLOUR[badge]}`}>{badge}</span>;
}

export function Card({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: 'warn' }) {
  const body = (
    <div className={`rounded-lg bg-white p-4 ring-1 ${tone === 'warn' ? 'ring-red-200' : 'ring-stone-200'} ${href ? 'hover:ring-stone-400' : ''}`}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === 'warn' ? 'text-red-800' : ''}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export const money = dollars;

export function shortDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: typeof d === 'string' && d.length === 10 ? 'UTC' : 'America/Edmonton' });
}

/** The sign's text and main specs, in one line. */
export function specLine(design: any): string {
  const l = design?.labels;
  if (!l) return '';
  return [l.lines?.map((x: any) => `“${x.text}”`).join(' / '), l.size, l.material, [l.finish, ...(l.colours ?? [])].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
}
