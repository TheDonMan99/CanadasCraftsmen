import Link from 'next/link';
import { requirePage } from '@/lib/auth/session';
import { loadSettings } from '@/lib/data';
import { listOrders } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { daysSince, paymentBadge, STATUS_LABEL, STATUSES } from '@/lib/order/payments';
import OrdersTable from './OrdersTable';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; paid?: string; q?: string }> }) {
  await requirePage('view_orders', '/admin/orders');
  const f = await searchParams;
  const db = getDb();
  if (!db) return <main className="mx-auto max-w-7xl px-4 py-6 text-stone-600">Orders need the database.</main>;
  const settings = await loadSettings();
  const orders = await listOrders(db, f);
  const rows = orders.map((o) => ({
    id: o.id,
    number: o.number,
    created_at: String(o.created_at),
    customer: o.customer_name,
    product: o.design?.labels?.product ?? o.product,
    text: (o.design?.labels?.lines ?? []).map((l: any) => l.text).join(' / '),
    width: o.width_in,
    material: o.design?.labels?.material ?? '',
    materialId: o.design?.materialId ?? '',
    finish: [o.design?.labels?.finish, ...(o.design?.labels?.colours ?? [])].filter(Boolean).join(', '),
    total: o.total,
    paid: o.paid,
    balance: o.total - o.paid,
    badge: paymentBadge(o.total, o.deposit_required, [{ amount: Math.max(0, o.paid), kind: 'payment' as const }], settings),
    status: o.status,
    needed_by: o.needed_by,
    days_unpaid: o.total - o.paid > 0 && !['cancelled', 'complete'].includes(o.status) ? daysSince(o.created_at) : 0,
  }));
  const sel = (name: string, value: string | undefined, opts: [string, string][]) => (
    <select name={name} defaultValue={value ?? ''} className="input w-auto">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <Link href="/admin/orders/new" className="btn">Enter an order</Link>
      </div>
      <form className="mt-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={f.q} placeholder="Search number, name, email or text" className="input max-w-xs" aria-label="Search" />
        {sel('status', f.status, [['', 'All statuses'], ['open', 'Open'], ...STATUSES.map((s) => [s, STATUS_LABEL[s]] as [string, string])])}
        {sel('paid', f.paid, [['', 'Paid or not'], ['unpaid', 'Unpaid'], ['paid', 'Paid in full']])}
        <button className="btn">Filter</button>
      </form>
      <OrdersTable rows={rows} reminderDays={settings.payments.reminder_after_days ?? 3} />
    </main>
  );
}
