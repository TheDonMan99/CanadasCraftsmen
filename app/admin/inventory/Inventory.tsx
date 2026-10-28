'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { money, shortDate } from '../ui';
import { dropOffcut, newOffcut, setCounts, stock } from '../nesting/actions';

type M = {
  id: string;
  label: string;
  enabled: boolean;
  fullSheets: number;
  cutPanels: number;
  lowStockAlert: number;
  sheetCostCents: number | null;
  offcuts: { id: string; w: number; h: number; source: string | null; created: string }[];
};

export default function Inventory({ materials, canSetCost }: { materials: M[]; canSetCost: boolean }) {
  return (
    <div className="mt-4 space-y-4">
      {materials.map((m) => <MaterialCard key={m.id} m={m} canSetCost={canSetCost} />)}
    </div>
  );
}

function MaterialCard({ m, canSetCost }: { m: M; canSetCost: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [buy, setBuy] = useState({ sheets: '1', cost: '' });
  const [counts, setC] = useState({ full_sheets: m.fullSheets, cut_panels: m.cutPanels, low_stock_alert: m.lowStockAlert });
  const [off, setOff] = useState({ w: '', h: '' });
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Saved.' } : { ok: false, text: r.error ?? 'Failed' });
      if (r.ok) router.refresh();
    });
  const low = m.fullSheets < m.lowStockAlert;
  const countsDirty = counts.full_sheets !== m.fullSheets || counts.cut_panels !== m.cutPanels || counts.low_stock_alert !== m.lowStockAlert;
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <section className={`rounded-lg bg-white p-4 ring-1 ${low ? 'ring-red-300' : 'ring-stone-200'}`} aria-label={m.label}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{m.label}{!m.enabled && <span className="ml-2 text-sm text-stone-500">(off)</span>}</h2>
        <span className="text-sm">
          <strong>{m.fullSheets}</strong> sheet{m.fullSheets === 1 ? '' : 's'} · <strong>{m.cutPanels}</strong> spare panel{m.cutPanels === 1 ? '' : 's'} · <strong>{m.offcuts.length}</strong> offcut{m.offcuts.length === 1 ? '' : 's'}
          {m.sheetCostCents != null && <span className="text-stone-500"> · {money(m.sheetCostCents)} a sheet</span>}
        </span>
      </div>
      {low && <p className="mt-1 text-sm font-medium text-red-700">Low stock: fewer than {m.lowStockAlert} sheets.</p>}

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <form
          className="flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => stock(m.id, num(buy.sheets), buy.cost));
            setBuy({ sheets: '1', cost: '' });
          }}
        >
          <label className="text-xs text-stone-600">Sheets bought
            <input className="input mt-0.5 w-20" inputMode="numeric" value={buy.sheets} onChange={(e) => setBuy({ ...buy, sheets: e.target.value })} aria-label={`${m.label} sheets bought`} />
          </label>
          {canSetCost && (
            <label className="text-xs text-stone-600">Cost per sheet ($, optional)
              <input className="input mt-0.5 w-28" inputMode="decimal" value={buy.cost} onChange={(e) => setBuy({ ...buy, cost: e.target.value })} aria-label={`${m.label} cost per sheet`} />
            </label>
          )}
          <button className="btn" disabled={pending}>Add stock</button>
        </form>

        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="text-xs text-stone-600">Sheets
            <input className="input mt-0.5 w-16" type="number" min={0} value={counts.full_sheets} onChange={(e) => setC({ ...counts, full_sheets: num(e.target.value) })} />
          </label>
          <label className="text-xs text-stone-600">Spare panels
            <input className="input mt-0.5 w-16" type="number" min={0} value={counts.cut_panels} onChange={(e) => setC({ ...counts, cut_panels: num(e.target.value) })} />
          </label>
          <label className="text-xs text-stone-600">Alert below
            <input className="input mt-0.5 w-16" type="number" min={0} value={counts.low_stock_alert} onChange={(e) => setC({ ...counts, low_stock_alert: num(e.target.value) })} />
          </label>
          <button className="rounded-md border border-stone-300 px-3 py-2" disabled={pending || !countsDirty} onClick={() => act(() => setCounts(m.id, counts))}>Save counts</button>
        </div>
      </div>

      <h3 className="mt-4 text-sm font-medium">Offcuts</h3>
      <ul className="mt-1 flex flex-wrap gap-2 text-sm">
        {m.offcuts.map((o) => (
          <li key={o.id} className="flex items-center gap-2 rounded-md bg-stone-100 px-2 py-1">
            <span>{o.w} × {o.h} in</span>
            <span className="text-xs text-stone-500">{o.source ?? ''} {shortDate(o.created)}</span>
            <button className="text-xs text-red-700" aria-label={`Remove offcut ${o.w} × ${o.h}`} onClick={() => act(() => dropOffcut(o.id))}>✕</button>
          </li>
        ))}
        {!m.offcuts.length && <li className="text-stone-500">None.</li>}
      </ul>
      <form
        className="mt-2 flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => newOffcut(m.id, Number(off.w), Number(off.h)));
          setOff({ w: '', h: '' });
        }}
      >
        <input className="input w-20" placeholder="width" inputMode="decimal" value={off.w} onChange={(e) => setOff({ ...off, w: e.target.value })} aria-label={`${m.label} offcut width`} />
        <span>×</span>
        <input className="input w-20" placeholder="height" inputMode="decimal" value={off.h} onChange={(e) => setOff({ ...off, h: e.target.value })} aria-label={`${m.label} offcut height`} />
        <span>in</span>
        <button className="rounded-md border border-stone-300 px-3 py-2" disabled={pending || !off.w || !off.h}>Add offcut</button>
      </form>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{msg.text}</p>}
    </section>
  );
}
