// Report figures: totals that match a hand tally, unpaid aging, margins, the GST tracker, CSV safety.
import { describe, expect, test } from 'vitest';
import { averageOrderValue, gstTracker, lastMonths, lastQuarters, margins, quarterOf, revenueByMonth, salesBy, unpaidAging, type ReportOrder, type ReportPayment } from '@/lib/reports';
import { toCsv } from '@/lib/reports/csv';

const o = (number: string, date: string, total: number, paid: number, extra: Partial<ReportOrder> = {}): ReportOrder => ({
  id: number, number, date, status: 'paid_in_full', total, paid, product: 'Welcome sign', size: '36 in wide', finish: 'Raw wood', source: 'Facebook Marketplace',
  customer: 'X', neededBy: null, materialCost: null, materialEstimate: 300, laserMinutes: 12, ...extra,
});
const p = (orderNumber: string, date: string, amount: number, kind: 'payment' | 'refund' = 'payment'): ReportPayment => ({ orderId: orderNumber, orderNumber, amount, kind, method: 'Cash', date, reference: null });

const orders = [
  o('S-1001', '2026-10-03', 7500, 7500),
  o('S-1002', '2026-10-20', 9000, 0, { status: 'awaiting_payment', product: 'Nursery name sign', size: '30 in wide', finish: 'Painted, one colour, Black' }),
  o('S-1003', '2026-11-01', 13500, 13500, { source: 'Instagram', materialCost: 450 }),
  o('S-1004', '2026-11-02', 6000, 3000, { status: 'cancelled' }),
];
const payments = [p('S-1001', '2026-10-05', 7500), p('S-1003', '2026-11-01', 13500), p('S-1004', '2026-11-02', 6000), p('S-1004', '2026-11-03', 3000, 'refund')];

describe('report totals match a hand tally', () => {
  test('by month: money received (less refunds) and sales (cancelled left out)', () => {
    expect(revenueByMonth(orders, payments, ['2026-10', '2026-11'])).toEqual([
      { month: '2026-10', received: 7500, sales: 16500, orders: 2 },
      { month: '2026-11', received: 16500, sales: 13500, orders: 1 },
    ]);
  });
  test('by product, source; average order value', () => {
    expect(salesBy(orders, 'product')).toEqual([
      { key: 'Welcome sign', orders: 2, sales: 21000 },
      { key: 'Nursery name sign', orders: 1, sales: 9000 },
    ]);
    expect(salesBy(orders, 'source').map((r) => r.key)).toEqual(['Facebook Marketplace', 'Instagram']);
    expect(averageOrderValue(orders)).toBe(10000);
  });
  test('unpaid aging: 0–7, 8–14, 15+ days', () => {
    const a = unpaidAging(orders, '2026-11-08');
    expect(a.map((b) => [b.label, b.count, b.owing])).toEqual([['0–7 days', 0, 0], ['8–14 days', 0, 0], ['15+ days', 1, 9000]]);
    expect(unpaidAging(orders, '2026-10-30')[1]).toMatchObject({ count: 1, owing: 9000 });
  });
  test('margins: actual material cost when cut, else the estimate; labour once an hourly rate is set', () => {
    const m = margins(orders, null);
    expect(m.find((x) => x.number === 'S-1003')).toMatchObject({ material: 450, materialEstimated: false, labour: 0, margin: 13050 });
    expect(m.find((x) => x.number === 'S-1001')).toMatchObject({ material: 300, materialEstimated: true });
    expect(margins(orders, 3000).find((x) => x.number === 'S-1001')!.labour).toBe(600);
  });
  test('months and quarters', () => {
    expect(lastMonths('2026-02-15', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(lastQuarters('2026-02-15')).toEqual(['2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1']);
    expect(quarterOf('2026-10-31')).toBe('2026-Q4');
  });
});

describe('GST tracker', () => {
  test('ok, warn at $25,000, register at $30,000 over four quarters or in one', () => {
    const t = (rows: ReportPayment[]) => gstTracker(rows, '2026-11-15', 2_500_000, 3_000_000).level;
    expect(t([p('a', '2026-10-01', 1_000_000)])).toBe('ok');
    expect(t([p('a', '2026-01-10', 1_300_000), p('b', '2026-10-01', 1_300_000)])).toBe('warn');
    expect(t([p('a', '2026-02-10', 1_600_000), p('b', '2026-10-01', 1_500_000)])).toBe('register');
    expect(t([p('a', '2026-11-01', 3_100_000)])).toBe('register');
    // sales from more than four quarters ago don't count
    expect(t([p('a', '2025-09-30', 2_900_000), p('b', '2026-10-01', 200_000)])).toBe('ok');
  });
});

describe('CSV', () => {
  test('quotes commas and quotes; formulas are neutralised', () => {
    const csv = toCsv([{ a: 'Smith, Jane', b: '=HYPERLINK("x")', c: -12.5 }], [
      { header: 'Name', value: (r) => r.a },
      { header: 'Note', value: (r) => r.b },
      { header: 'Amount', value: (r) => r.c },
    ]);
    expect(csv).toBe('Name,Note,Amount\r\n"Smith, Jane","\'=HYPERLINK(""x"")",-12.5\r\n');
  });
});
