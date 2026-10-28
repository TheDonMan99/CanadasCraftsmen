import Link from 'next/link';
import { requirePage } from '@/lib/auth/session';
import { customerOrders, listCustomers } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { money, shortDate, StatusPill } from '../ui';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const user = await requirePage('view_contacts', '/admin/customers');
  const { q, id } = await searchParams;
  const db = getDb();
  if (!db) return <main className="mx-auto max-w-7xl px-4 py-6 text-stone-600">Customers need the database.</main>;
  const customers = await listCustomers(db, q);
  const open = id ? customers.find((c) => c.id === id) : null;
  const history = open ? await customerOrders(db, open.id) : [];
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Customers</h1>
      <form className="mt-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, email or phone" className="input max-w-xs" aria-label="Search customers" />
        <button className="btn">Search</button>
      </form>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-stone-200">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr className="border-b border-stone-200"><th className="px-3 py-2">Name</th><th>Email</th><th>Phone</th><th>Orders</th>{user.perms.view_payments && <th className="text-right">Spent</th>}<th className="pr-3">Last order</th></tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className={`border-b border-stone-100 ${c.id === id ? 'bg-amber-50' : 'hover:bg-stone-50'}`}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/customers?id=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className="underline">{c.name}</Link>
                    {c.orders > 1 && <span className="ml-2 rounded bg-green-100 px-1.5 text-xs text-green-900">Repeat</span>}
                  </td>
                  <td>{c.email}</td>
                  <td>{c.phone}</td>
                  <td>{c.orders}</td>
                  {user.perms.view_payments && <td className="text-right">{money(c.spent)}</td>}
                  <td className="pr-3">{shortDate(c.last_order)}</td>
                </tr>
              ))}
              {!customers.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-stone-500">No customers yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {open && (
          <aside className="rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200">
            <h2 className="font-medium">{open.name}</h2>
            <p className="text-stone-600">{open.email} · {open.phone}</p>
            <p className="text-stone-500">Customer since {shortDate(open.created_at)}{open.source ? ` · ${open.source}` : ''}</p>
            <ul className="mt-3 space-y-1">
              {history.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/orders/${o.id}`} className="underline">{o.number}</Link>
                  <StatusPill status={o.status} />
                  {user.perms.view_prices && <span>{money(o.total)}</span>}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </main>
  );
}
