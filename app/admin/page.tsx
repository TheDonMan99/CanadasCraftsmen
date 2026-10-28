import Link from 'next/link';
import { requirePage } from '@/lib/auth/session';
import { loadSettings } from '@/lib/data';
import { boardOrders, homeStats, listOrders } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { daysSince, paymentBadge } from '@/lib/order/payments';
import { localToday } from '@/lib/order/rules';
import { Card, money, PaidBadge, shortDate, specLine, StatusPill } from './ui';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePage();
  const q = await searchParams;
  const db = getDb();
  const settings = await loadSettings();
  const denied = q.denied && <p className="mb-4 rounded bg-amber-50 p-2 text-sm text-amber-900">Your role can’t open that page.</p>;
  if (!db)
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        {denied}
        <p className="text-stone-600">Orders need the database. The <Link className="underline" href="/admin/lab">lab</Link> and settings work without it.</p>
      </main>
    );

  // production: the queue of paid work, no money
  if (!user.perms.view_orders) {
    const cards = (await boardOrders(db, settings)).filter((o) => o.status !== 'complete');
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        {denied}
        <h1 className="text-2xl font-semibold">What to cut next</h1>
        <ul className="mt-4 divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200">
          {cards.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm hover:bg-stone-50">
                <span className="font-medium">{o.number}</span>
                <StatusPill status={o.status} />
                <span className="text-stone-600">{specLine(o.design)}</span>
                <span className="ml-auto text-stone-500">needed {shortDate(o.needed_by)}</span>
              </Link>
            </li>
          ))}
          {!cards.length && <li className="px-3 py-6 text-center text-sm text-stone-500">Nothing waiting.</li>}
        </ul>
      </main>
    );
  }

  const today = localToday(settings);
  const [stats, open] = await Promise.all([homeStats(db, today), listOrders(db, { status: 'open' })]);
  const queue = [...open].sort((a, b) => (a.needed_by ?? '9999').localeCompare(b.needed_by ?? '9999') || a.created_at.toString().localeCompare(b.created_at.toString()));
  const remind = settings.payments.reminder_after_days ?? 3;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {denied}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Home</h1>
        {user.perms.edit_orders && <Link href="/admin/orders/new" className="btn">Enter an order</Link>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="New orders" value={stats.newOrders} href="/admin/orders?status=new" />
        {user.perms.view_payments && <Card label={`Unpaid balance (${stats.unpaidOrders})`} value={money(stats.unpaidCents)} href="/admin/orders?paid=unpaid" tone={stats.unpaidCents ? 'warn' : undefined} />}
        <Card label="Due this week" value={stats.dueThisWeek} />
        <Card label="In production" value={stats.inProduction} href="/admin/board" />
        {user.perms.view_payments && <Card label="Revenue this month" value={money(stats.revenueThisMonthCents)} />}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Production queue</h2>
      <div className="mt-2 overflow-x-auto rounded-lg bg-white ring-1 ring-stone-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="px-3 py-2">Needed by</th><th>Order</th><th>Customer</th><th>Sign</th><th>Status</th>{user.perms.view_payments && <><th>Paid</th><th className="pr-3 text-right">Balance</th></>}
            </tr>
          </thead>
          <tbody>
            {queue.map((o) => {
              const balance = o.total - o.paid;
              const days = daysSince(o.created_at);
              return (
                <tr key={o.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="px-3 py-2 whitespace-nowrap">{shortDate(o.needed_by)}{o.rush && <span className="ml-1 text-xs font-semibold text-red-700">RUSH</span>}</td>
                  <td><Link className="font-medium underline" href={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                  <td>{o.customer_name}</td>
                  <td className="max-w-xs truncate text-stone-600">{specLine(o.design)}</td>
                  <td><StatusPill status={o.status} /></td>
                  {user.perms.view_payments && (
                    <>
                      <td>
                        <PaidBadge badge={paymentBadge(o.total, o.deposit_required, [{ amount: Math.max(0, o.paid), kind: 'payment' }], settings)} />
                        {balance > 0 && days >= remind && <span className="ml-1 text-xs font-semibold text-red-700">{days} days</span>}
                      </td>
                      <td className="pr-3 text-right">{money(balance)}</td>
                    </>
                  )}
                </tr>
              );
            })}
            {!queue.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-stone-500">No open orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
