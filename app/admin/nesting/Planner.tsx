'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { shortDate } from '../ui';
import { pickNextBatch, plan } from './actions';

type Row = { id: string; number: string; firstName: string; spec: string; neededBy: string | null; rush: boolean; override: boolean };

export default function Planner({ materialId, orders, preselect }: { materialId: string; orders: Row[]; preselect: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(new Set(preselect));
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          disabled={pending || !orders.length}
          onClick={() =>
            start(async () => {
              const r = await pickNextBatch(materialId);
              if (r.ok) setSelected(new Set(r.data));
              else setError(r.error);
            })
          }
        >
          Plan next batch (by needed-by date)
        </button>
        <button
          className="btn"
          disabled={pending || !selected.size}
          onClick={() =>
            start(async () => {
              setError('');
              const r = await plan(materialId, [...selected]);
              if (r.ok) router.push(`/admin/nesting/${r.data}`);
              else setError(r.error);
            })
          }
        >
          {pending ? 'Working…' : `Nest ${selected.size} order${selected.size === 1 ? '' : 's'}`}
        </button>
        {error && <span className="text-sm text-red-700" role="alert">{error}</span>}
      </div>
      <ul className="mt-3 divide-y divide-stone-200 rounded-lg bg-white ring-1 ring-stone-200">
        {orders.map((o) => (
          <li key={o.id}>
            <label className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Select ${o.number}`} />
              <span className="font-medium">{o.number}</span>
              <span className="text-stone-500">{o.firstName}</span>
              <span className="text-stone-700">{o.spec}</span>
              {o.override && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">unpaid, released by override</span>}
              <span className="ml-auto text-stone-500">{o.rush && <strong className="text-red-700">RUSH </strong>}needed {shortDate(o.neededBy)}</span>
            </label>
          </li>
        ))}
        {!orders.length && <li className="px-3 py-6 text-center text-sm text-stone-500">No paid orders waiting on this material.</li>}
      </ul>
    </div>
  );
}
