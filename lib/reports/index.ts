// Report figures (SPEC.md, "Other screens → Reports"). Pure: order and payment
// rows in, totals out, so the report page, the digests and the tests agree.
// Money in cents.

export interface ReportOrder {
  id: string;
  number: string;
  /** YYYY-MM-DD, in the business's time zone */
  date: string;
  status: string;
  total: number;
  paid: number;
  product: string;
  size: string;
  finish: string;
  source: string;
  customer: string;
  neededBy: string | null;
  /** from cut nest jobs; null until the order has been nested and cut */
  materialCost: number | null;
  /** estimate from the order's size when it hasn't been nested yet */
  materialEstimate: number | null;
  laserMinutes: number;
}

export interface ReportPayment {
  orderId: string;
  orderNumber: string;
  amount: number;
  kind: 'payment' | 'refund';
  method: string | null;
  /** YYYY-MM-DD */
  date: string;
  reference: string | null;
}

const live = (o: ReportOrder) => o.status !== 'cancelled';
export const net = (p: ReportPayment) => (p.kind === 'refund' ? -p.amount : p.amount);

/** The last n months, oldest first, as YYYY-MM. */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Money received (less refunds) and orders placed, by month. */
export function revenueByMonth(orders: ReportOrder[], payments: ReportPayment[], months: string[]) {
  return months.map((month) => ({
    month,
    received: payments.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + net(p), 0),
    sales: orders.filter((o) => live(o) && o.date.startsWith(month)).reduce((s, o) => s + o.total, 0),
    orders: orders.filter((o) => live(o) && o.date.startsWith(month)).length,
  }));
}

/** Orders and sales grouped by product, size, finish or source, biggest first. */
export function salesBy(orders: ReportOrder[], key: 'product' | 'size' | 'finish' | 'source') {
  const m = new Map<string, { key: string; orders: number; sales: number }>();
  for (const o of orders.filter(live)) {
    const k = o[key] || '—';
    const row = m.get(k) ?? { key: k, orders: 0, sales: 0 };
    row.orders++;
    row.sales += o.total;
    m.set(k, row);
  }
  return [...m.values()].sort((a, b) => b.sales - a.sales || b.orders - a.orders);
}

export function averageOrderValue(orders: ReportOrder[]): number {
  const l = orders.filter(live);
  return l.length ? Math.round(l.reduce((s, o) => s + o.total, 0) / l.length) : 0;
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** Unpaid balances by how long they've waited: 0–7, 8–14 and 15+ days. */
export function unpaidAging(orders: ReportOrder[], today: string) {
  const buckets = [
    { label: '0–7 days', min: 0, max: 7, orders: [] as ReportOrder[], owing: 0 },
    { label: '8–14 days', min: 8, max: 14, orders: [] as ReportOrder[], owing: 0 },
    { label: '15+ days', min: 15, max: Infinity, orders: [] as ReportOrder[], owing: 0 },
  ];
  for (const o of orders) {
    const owing = o.total - o.paid;
    if (!live(o) || owing <= 0) continue;
    const d = days(o.date, today);
    const b = buckets.find((x) => d >= x.min && d <= x.max)!;
    b.orders.push(o);
    b.owing += owing;
  }
  return buckets.map(({ label, orders: os, owing }) => ({ label, count: os.length, owing, orders: os.map((o) => ({ number: o.number, owing: o.total - o.paid, days: days(o.date, today) })) }));
}

/** Material cost and gross margin per order. Labour is included once you set an hourly rate. */
export function margins(orders: ReportOrder[], hourlyRateCents: number | null) {
  return orders.filter(live).map((o) => {
    const material = o.materialCost ?? o.materialEstimate ?? 0;
    const labour = hourlyRateCents ? Math.round((o.laserMinutes / 60) * hourlyRateCents) : 0;
    const margin = o.total - material - labour;
    return { id: o.id, number: o.number, total: o.total, material, materialEstimated: o.materialCost == null, labour, margin, marginPct: o.total ? margin / o.total : 0 };
  });
}

/** Calendar quarter of a date, as e.g. 2026-Q4. */
export const quarterOf = (date: string) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;

/** The current calendar quarter and the three before it, oldest first. */
export function lastQuarters(today: string, n = 4): string[] {
  let y = Number(today.slice(0, 4)), q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-Q${q}`);
    q--;
    if (q === 0) {
      q = 4;
      y--;
    }
  }
  return out;
}

/**
 * GST small-supplier tracker: you must register once taxable sales pass the
 * threshold ($30,000) in one calendar quarter or over four consecutive quarters
 * (CRA memorandum 2-2). Sales are counted as money received less refunds, by the
 * date received. Remember that a sole proprietor's other taxable sales count too.
 */
export function gstTracker(payments: ReportPayment[], today: string, warnCents: number, thresholdCents: number) {
  const quarters = lastQuarters(today).map((q) => ({ quarter: q, sales: payments.filter((p) => quarterOf(p.date) === q).reduce((s, p) => s + net(p), 0) }));
  const rolling = quarters.reduce((s, q) => s + q.sales, 0);
  const biggestQuarter = Math.max(0, ...quarters.map((q) => q.sales));
  const level = rolling >= thresholdCents || biggestQuarter >= thresholdCents ? 'register' : rolling >= warnCents || biggestQuarter >= warnCents ? 'warn' : 'ok';
  return { quarters, rolling, biggestQuarter, warnCents, thresholdCents, level: level as 'ok' | 'warn' | 'register' };
}
