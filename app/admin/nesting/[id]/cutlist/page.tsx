import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/auth/session';
import { loadCatalog } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { getJob } from '@/lib/db/nesting';
import { shortDate } from '../../../ui';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

/** Printable cut list: panel, order numbers, part names, finishes. */
export default async function CutListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePage('manage_nesting', `/admin/nesting/${id}/cutlist`);
  const db = getDb();
  const job = db ? await getJob(db, id) : null;
  if (!job || !db) notFound();
  const catalog = await loadCatalog();
  const rows = await db.query<{ id: string; number: string; design: any; needed_by: string | null }>(
    "select id, number, design, to_char(needed_by, 'YYYY-MM-DD') as needed_by from orders where id = any($1::uuid[])",
    [job.summary.orderIds],
  );
  const orders = new Map(rows.map((r) => [r.id, { ...r, design: typeof r.design === 'string' ? JSON.parse(r.design) : r.design }]));
  const material = catalog.find((m) => m.id === job.material_option_id);
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 print:p-0">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cut list · {material?.label} · {shortDate(job.created_at)}</h1>
        <PrintButton />
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {job.summary.newSheets} new sheet{job.summary.newSheets === 1 ? '' : 's'} to rip into Panel A and Panel B
        {job.summary.sparePanelsUsed ? `, ${job.summary.sparePanelsUsed} spare panel${job.summary.sparePanelsUsed === 1 ? '' : 's'}` : ''}
        {job.summary.offcutsUsed.length ? `, ${job.summary.offcutsUsed.length} offcut${job.summary.offcutsUsed.length === 1 ? '' : 's'}` : ''}.
      </p>
      {job.panels.map((b) => (
        <section key={b.id} className="mt-5 break-inside-avoid">
          <h2 className="font-medium">{b.label}</h2>
          <table className="mt-1 w-full border-collapse text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr className="border-b border-stone-300"><th className="py-1">Order</th><th>Part</th><th>Size</th><th>Finish</th><th>Needed by</th><th>✓</th></tr>
            </thead>
            <tbody>
              {b.placements.map((p) => {
                const l = orders.get(p.orderId)?.design?.labels ?? {};
                return (
                  <tr key={p.key} className="border-b border-stone-200">
                    <td className="py-1">{p.orderNumber}</td>
                    <td>{p.partName}</td>
                    <td>{p.w.toFixed(1)} × {p.h.toFixed(1)} in{p.rotation ? ' (turned)' : ''}</td>
                    <td>{[l.finish, ...(l.colours ?? [])].filter(Boolean).join(', ')}{l.topcoat && l.topcoat !== 'None' ? `, ${l.topcoat}` : ''}</td>
                    <td>{shortDate(orders.get(p.orderId)?.needed_by)}</td>
                    <td className="w-8 border border-stone-300" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
