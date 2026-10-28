import Link from 'next/link';
import { requirePage } from '@/lib/auth/session';
import { byCategory } from '@/lib/config/catalog';
import { loadCatalog } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { getInventory, listJobs, nestableOrders, openOffcuts } from '@/lib/db/nesting';
import { shortDate, specLine } from '../ui';
import Planner from './Planner';

export const dynamic = 'force-dynamic';

export default async function NestingPage({ searchParams }: { searchParams: Promise<{ material?: string; orders?: string }> }) {
  await requirePage('manage_nesting', '/admin/nesting');
  const q = await searchParams;
  const db = getDb();
  if (!db) return <main className="mx-auto max-w-7xl px-4 py-6 text-stone-600">Nesting needs the database.</main>;
  const catalog = await loadCatalog();
  const materials = byCategory(catalog, 'material');
  const materialId = materials.some((m) => m.id === q.material) ? q.material! : materials[0]?.id;
  const [orders, inv, offcuts, jobs] = await Promise.all([nestableOrders(db, materialId), getInventory(db, materialId), openOffcuts(db, materialId), listJobs(db, 20)]);
  const preselect = (q.orders ?? '').split(',').filter((id) => orders.some((o) => o.id === id));
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Nesting</h1>
      <p className="mt-1 text-sm text-stone-600">
        Pick paid orders on one material. Parts go onto offcuts first, then spare panels, then new 4 × 8 ft sheets ripped into Panel A and Panel B.
      </p>
      <form className="mt-3 flex flex-wrap items-center gap-2">
        <select name="material" defaultValue={materialId} className="input w-auto" aria-label="Material">
          {materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button className="btn">Show</button>
        <span className="text-sm text-stone-600">
          In stock: {inv.full_sheets} sheet{inv.full_sheets === 1 ? '' : 's'}, {inv.cut_panels} spare panel{inv.cut_panels === 1 ? '' : 's'}, {offcuts.length} offcut{offcuts.length === 1 ? '' : 's'}
          {inv.full_sheets < inv.low_stock_alert && <strong className="ml-2 text-red-700">Low stock</strong>}
        </span>
      </form>
      <Planner
        materialId={materialId}
        preselect={preselect}
        orders={orders.map((o) => ({ id: o.id, number: o.number, firstName: o.first_name, spec: specLine(o.design), neededBy: o.needed_by, rush: o.rush, override: o.status !== 'paid_in_full' }))}
      />

      <h2 className="mt-10 text-lg font-semibold">Recent jobs</h2>
      <div className="mt-2 overflow-x-auto rounded-lg bg-white ring-1 ring-stone-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr className="border-b border-stone-200"><th className="px-3 py-2">Planned</th><th>Material</th><th>Orders</th><th>Panels</th><th>Material used</th><th className="pr-3">Status</th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-3 py-2"><Link href={`/admin/nesting/${j.id}`} className="underline">{shortDate(j.created_at)}</Link></td>
                <td>{catalog.find((m) => m.id === j.material_option_id)?.label}</td>
                <td>{j.summary.orderNumbers?.join(', ')}</td>
                <td>{j.panels.length}</td>
                <td>{Math.round(j.utilization * 100)}%</td>
                <td className="pr-3">{j.status === 'cut' ? `Cut ${shortDate(j.cut_at)}` : 'Planned'}</td>
              </tr>
            ))}
            {!jobs.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-stone-500">No jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
