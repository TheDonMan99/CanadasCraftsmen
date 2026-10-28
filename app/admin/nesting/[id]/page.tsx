import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/auth/session';
import { loadCatalog } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { getJob } from '@/lib/db/nesting';
import { money, shortDate } from '../../ui';
import JobView from './JobView';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePage('manage_nesting', `/admin/nesting/${id}`);
  const db = getDb();
  const job = db ? await getJob(db, id) : null;
  if (!job) notFound();
  const catalog = await loadCatalog();
  const material = catalog.find((m) => m.id === job.material_option_id);
  const s = job.summary;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <Link href={`/admin/nesting?material=${job.material_option_id}`} className="text-sm text-stone-500">← Nesting</Link>
      <h1 className="mt-1 text-2xl font-semibold">
        {material?.label} · {job.status === 'cut' ? `cut ${shortDate(job.cut_at)}` : `planned ${shortDate(job.created_at)}`}
      </h1>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <Stat label="Orders" value={s.orderNumbers.join(', ')} />
        <Stat label="New sheets to rip" value={String(s.newSheets)} />
        <Stat label="Panels and offcuts used" value={String(job.panels.length)} />
        <Stat label="Material used" value={`${Math.round(job.utilization * 100)}%`} />
        <Stat label="Spare panels left over" value={String(s.sparePanelsLeft)} />
      </dl>
      {s.inventoryWarning && <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-900">{s.inventoryWarning}</p>}
      {s.unplaced.length > 0 && (
        <ul className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">
          {s.unplaced.map((u, i) => <li key={i}>Not placed: {u.orderNumber} {u.partName}: {u.reason}</li>)}
        </ul>
      )}
      {user.perms.view_prices && Object.keys(s.costs).length > 0 && (
        <p className="mt-3 text-sm text-stone-600">
          Material cost: {Object.entries(s.costs).map(([oid, c]) => `${s.orderNumbers[s.orderIds.indexOf(oid)]} ${money(c)}`).join(' · ')}
        </p>
      )}
      <JobView job={job} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
