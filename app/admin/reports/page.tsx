import Link from 'next/link';
import { requirePage } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { reportOrders, reportPayments } from '@/lib/db/reports';
import { localToday } from '@/lib/order/rules';
import { averageOrderValue, gstTracker, lastMonths, margins, revenueByMonth, salesBy, unpaidAging } from '@/lib/reports';
import { money } from '../ui';
import SendNow from './SendNow';

export const dynamic = 'force-dynamic';

const RANGES: [string, string][] = [['3', 'Last 3 months'], ['6', 'Last 6 months'], ['12', 'Last 12 months'], ['24', 'Last 24 months']];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  await requirePage('view_reports', '/admin/reports');
  const db = getDb();
  if (!db) return <main className="mx-auto max-w-7xl px-4 py-6 text-stone-600">Reports need the database.</main>;
  const q = await searchParams;
  const n = RANGES.some(([v]) => v === q.months) ? Number(q.months) : 12;
  const [settings, catalog] = await Promise.all([loadSettings(), loadCatalog()]);
  const today = localToday(settings);
  const months = lastMonths(today, n);
  const since = `${months[0]}-01`;
  // a year back for the GST tracker, whatever the range shown
  const gstSince = `${Number(today.slice(0, 4)) - 1}-01-01`;
  const [orders, payments, allOrders, gstPayments] = await Promise.all([
    reportOrders(db, settings, catalog, since),
    reportPayments(db, settings, since),
    reportOrders(db, settings, catalog),
    reportPayments(db, settings, gstSince < since ? gstSince : since),
  ]);
  const byMonth = revenueByMonth(orders, payments, months);
  const maxMonth = Math.max(1, ...byMonth.map((m) => Math.max(m.received, m.sales)));
  const aging = unpaidAging(allOrders, today);
  const margin = margins(orders, settings.pricing.hourly_rate_cents);
  const gst = gstTracker(gstPayments, today, settings.tax.registration_warning_cents, settings.tax.registration_threshold_cents ?? 3000000);
  const totalReceived = byMonth.reduce((s, m) => s + m.received, 0);
  const totalSales = byMonth.reduce((s, m) => s + m.sales, 0);
  const totalMaterial = margin.reduce((s, m) => s + m.material, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          {RANGES.map(([v, l]) => (
            <Link key={v} href={`/admin/reports?months=${v}`} className={`rounded-md border px-3 py-1.5 ${Number(v) === n ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white'}`}>{l}</Link>
          ))}
          <a className="rounded-md border border-stone-300 bg-white px-3 py-1.5" href={`/api/admin/export/orders?since=${since}`}>Orders CSV</a>
          <a className="rounded-md border border-stone-300 bg-white px-3 py-1.5" href={`/api/admin/export/payments?since=${since}`}>Payments CSV</a>
        </div>
      </div>

      <div className="mt-3"><SendNow /></div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Money received" value={money(totalReceived)} />
        <Stat label="Sales (orders placed)" value={money(totalSales)} />
        <Stat label="Orders" value={String(orders.filter((o) => o.status !== 'cancelled').length)} />
        <Stat label="Average order" value={money(averageOrderValue(orders))} />
        <Stat label="Material cost" value={money(totalMaterial)} />
      </div>

      <section className={`mt-6 rounded-lg p-4 ring-1 ${gst.level === 'register' ? 'bg-red-50 ring-red-300' : gst.level === 'warn' ? 'bg-amber-50 ring-amber-300' : 'bg-white ring-stone-200'}`}>
        <h2 className="font-medium">GST registration tracker</h2>
        <p className="mt-1 text-sm">
          Last four calendar quarters: <strong>{money(gst.rolling)}</strong> received. You must register for GST within 29 days of passing {money(gst.thresholdCents)} in one quarter or over four in a row.
          {gst.level === 'register' && <strong className="block text-red-800">You’ve passed {money(gst.thresholdCents)}: register for GST now.</strong>}
          {gst.level === 'warn' && <strong className="block text-amber-900">Getting close: you’ve passed the {money(gst.warnCents)} warning level.</strong>}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {gst.quarters.map((x) => <span key={x.quarter} className="rounded bg-white/70 px-2 py-1 ring-1 ring-stone-200">{x.quarter}: {money(x.sales)}</span>)}
        </div>
        <p className="mt-2 text-xs text-stone-600">Counts money received less refunds. As a sole proprietor, all of your taxable sales count, not just signs (CRA memorandum 2-2).</p>
      </section>

      <section className="mt-6 rounded-lg bg-white p-4 ring-1 ring-stone-200">
        <h2 className="font-medium">By month</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-stone-500"><tr><th className="py-1">Month</th><th>Received</th><th>Sales</th><th>Orders</th><th className="w-1/2" /></tr></thead>
          <tbody>
            {byMonth.map((m) => (
              <tr key={m.month} className="border-t border-stone-100">
                <td className="py-1">{m.month}</td>
                <td>{money(m.received)}</td>
                <td>{money(m.sales)}</td>
                <td>{m.orders}</td>
                <td>
                  <div className="h-2 rounded bg-green-600" style={{ width: `${(Math.max(0, m.received) / maxMonth) * 100}%` }} title="Received" />
                  <div className="mt-0.5 h-2 rounded bg-stone-400" style={{ width: `${(m.sales / maxMonth) * 100}%` }} title="Sales" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-stone-500"><span className="inline-block h-2 w-3 rounded bg-green-600" /> received · <span className="inline-block h-2 w-3 rounded bg-stone-400" /> sales</p>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Breakdown title="By product" rows={salesBy(orders, 'product')} />
        <Breakdown title="By size" rows={salesBy(orders, 'size')} />
        <Breakdown title="By finish" rows={salesBy(orders, 'finish')} />
        <Breakdown title="Order sources" rows={salesBy(orders, 'source')} />
      </div>

      <section className="mt-6 rounded-lg bg-white p-4 ring-1 ring-stone-200">
        <h2 className="font-medium">Unpaid, by days waiting</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {aging.map((b) => (
            <div key={b.label} className={`rounded-md p-3 ring-1 ${b.label.startsWith('15') && b.count ? 'ring-red-300' : 'ring-stone-200'}`}>
              <div className="text-xs text-stone-500">{b.label}</div>
              <div className="text-lg font-semibold">{money(b.owing)} <span className="text-sm font-normal text-stone-500">({b.count})</span></div>
              <div className="mt-1 text-xs text-stone-600">{b.orders.map((o) => `${o.number} ${money(o.owing)}`).join(' · ')}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg bg-white p-4 ring-1 ring-stone-200">
        <h2 className="font-medium">Material cost and gross margin per order</h2>
        <p className="text-xs text-stone-500">
          Material comes from cut nest jobs; until an order is cut it’s estimated from its size (marked ~).
          {settings.pricing.hourly_rate_cents ? ` Labour is laser time at ${money(settings.pricing.hourly_rate_cents)} an hour.` : ' Set an hourly rate in Settings → Pricing to include labour.'}
        </p>
        <div className="mt-2 max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-stone-500"><tr><th className="py-1">Order</th><th className="text-right">Total</th><th className="text-right">Material</th><th className="text-right">Labour</th><th className="text-right">Margin</th></tr></thead>
            <tbody>
              {margin.map((m) => (
                <tr key={m.id} className="border-t border-stone-100">
                  <td className="py-1"><Link className="underline" href={`/admin/orders/${m.id}`}>{m.number}</Link></td>
                  <td className="text-right">{money(m.total)}</td>
                  <td className="text-right">{m.materialEstimated ? '~' : ''}{money(m.material)}</td>
                  <td className="text-right">{m.labour ? money(m.labour) : '—'}</td>
                  <td className="text-right">{money(m.margin)} <span className="text-stone-500">({Math.round(m.marginPct * 100)}%)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; orders: number; sales: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sales));
  return (
    <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200" aria-label={title}>
      <h2 className="font-medium">{title}</h2>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-stone-100">
              <td className="py-1 pr-2">{r.key}</td>
              <td className="w-16 text-right">{r.orders}</td>
              <td className="w-20 text-right">{money(r.sales)}</td>
              <td className="w-1/3 pl-2"><div className="h-2 rounded bg-amber-600" style={{ width: `${(r.sales / max) * 100}%` }} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td className="py-2 text-stone-500">No orders in this range.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
