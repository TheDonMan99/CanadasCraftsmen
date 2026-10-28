'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { CatalogOption, PriceType } from '@/lib/config/catalog';
import { dollars } from '@/lib/pricing';
import { addOption, copyOption, loadPriceHistory, saveOption, saveOrder, setOptionsEnabled, type ActionResult } from '../actions';
import { ValueEditor } from '../ValueEditor';

const priceText = (o: Pick<CatalogOption, 'price_type' | 'price_value'>) =>
  o.price_type === 'none' ? '—' : o.price_type === 'percent' ? `${o.price_value}%` : o.price_type === 'per_inch' ? `${dollars(o.price_value)}/in` : o.price_value >= 0 ? `+${dollars(o.price_value)}` : dollars(o.price_value);

export default function CatalogEditor({ category, options, canSave }: { category: string; options: CatalogOption[]; canSave: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(options);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => setRows(options), [options]);

  const act = (p: Promise<ActionResult<any>>, okText: string) =>
    start(async () => {
      const r = await p;
      setMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  const toggle = (o: CatalogOption) => act(setOptionsEnabled([o.id], !o.enabled), `${o.label} switched ${o.enabled ? 'off' : 'on'}.`);
  const bulk = (on: boolean) => act(setOptionsEnabled([...selected], on), `${selected.size} option(s) switched ${on ? 'on' : 'off'}.`);
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = rows.map((r) => r.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setRows(ids.map((id) => rows.find((r) => r.id === id)!));
    act(saveOrder(category, ids), 'Order saved.');
  };
  const move = (id: string, d: number) => {
    const ids = rows.map((r) => r.id);
    const i = ids.indexOf(id), j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setRows(ids.map((x) => rows.find((r) => r.id === x)!));
    act(saveOrder(category, ids), 'Order saved.');
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button className="btn" disabled={!canSave || pending} onClick={() => setEditing('new')}>Add option</button>
        <button className="rounded-md border border-stone-300 bg-white px-3 py-2 disabled:opacity-50" disabled={!canSave || !selected.size || pending} onClick={() => bulk(true)}>Switch on selected</button>
        <button className="rounded-md border border-stone-300 bg-white px-3 py-2 disabled:opacity-50" disabled={!canSave || !selected.size || pending} onClick={() => bulk(false)}>Switch off selected</button>
        {pending && <span className="text-stone-500">Saving…</span>}
        {message && <span className={message.ok ? 'text-green-800' : 'text-red-700'} role="status">{message.text}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left text-xs text-stone-600">
            <tr>
              <th className="w-8 p-2"><input type="checkbox" aria-label="Select all" checked={selected.size === rows.length && rows.length > 0} onChange={(e) => setSelected(new Set(e.target.checked ? rows.map((r) => r.id) : []))} /></th>
              <th className="p-2">On</th>
              <th className="p-2">Option</th>
              <th className="p-2">Price</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Order</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.id}
                draggable={canSave}
                onDragStart={() => setDragId(o.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(o.id)}
                className={`border-t border-stone-100 ${o.enabled ? '' : 'text-stone-400'} ${dragId === o.id ? 'bg-stone-50' : ''}`}
              >
                <td className="p-2"><input type="checkbox" aria-label={`Select ${o.label}`} checked={selected.has(o.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(o.id); else s.delete(o.id); setSelected(s); }} /></td>
                <td className="p-2">
                  <button
                    role="switch"
                    aria-checked={o.enabled}
                    aria-label={`${o.label} on`}
                    disabled={!canSave || pending}
                    onClick={() => toggle(o)}
                    className={`relative h-5 w-9 rounded-full transition ${o.enabled ? 'bg-green-600' : 'bg-stone-300'} disabled:opacity-60`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${o.enabled ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    {typeof o.values.hex === 'string' && <span className="inline-block h-4 w-4 rounded border border-stone-300" style={{ background: o.values.hex }} />}
                    <span className="font-medium">{o.label}</span>
                  </div>
                  <div className="text-xs text-stone-500">{o.id}{o.description ? ` · ${o.description}` : ''}</div>
                </td>
                <td className="p-2 whitespace-nowrap">{priceText(o)}</td>
                <td className="p-2 text-xs">{o.stock_status === 'in_stock' ? 'In stock' : 'Out of stock'}</td>
                <td className="p-2 whitespace-nowrap">
                  <button className="px-1 text-stone-500 disabled:opacity-30" aria-label={`Move ${o.label} up`} disabled={!canSave} onClick={() => move(o.id, -1)}>↑</button>
                  <button className="px-1 text-stone-500 disabled:opacity-30" aria-label={`Move ${o.label} down`} disabled={!canSave} onClick={() => move(o.id, 1)}>↓</button>
                </td>
                <td className="p-2 whitespace-nowrap text-right">
                  <button className="text-blue-700" onClick={() => setEditing(o.id)}>Edit</button>
                  <button className="ml-3 text-blue-700 disabled:opacity-40" disabled={!canSave} onClick={() => act(copyOption(o.id), `Copied ${o.label}.`)}>Duplicate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">Drag rows (or use the arrows) to change the order customers see. Switching an option off hides it from new orders at once; past orders keep it.</p>

      {editing && (
        <OptionDialog
          key={editing}
          option={editing === 'new' ? blankOption(category, rows) : rows.find((r) => r.id === editing)!}
          isNew={editing === 'new'}
          canSave={canSave}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMessage({ ok: true, text }); router.refresh(); }}
        />
      )}
    </div>
  );
}

function blankOption(category: string, rows: CatalogOption[]): CatalogOption {
  // a new option starts with the same value fields as its neighbours
  const template = rows[0]?.values ?? {};
  const values = Object.fromEntries(Object.entries(template).map(([k, v]) => [k, typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : Array.isArray(v) ? [] : typeof v === 'string' ? '' : v]));
  return { id: `${category}.`, category, label: '', description: '', enabled: false, stock_status: 'in_stock', sort_order: 0, price_type: 'flat', price_value: 0, applies_to: null, values, internal_notes: '' };
}

function OptionDialog({ option, isNew, canSave, onClose, onSaved }: { option: CatalogOption; isNew: boolean; canSave: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [o, setO] = useState(option);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const [history, setHistory] = useState<{ old_price: number; new_price: number; old_price_type: string; new_price_type: string; changed_at: string }[] | null>(null);
  useEffect(() => { if (!isNew) loadPriceHistory(option.id).then(setHistory); }, [isNew, option.id]);

  const isMoney = o.price_type === 'flat' || o.price_type === 'per_inch';
  const save = () =>
    start(async () => {
      const r = isNew
        ? await addOption(o)
        : await saveOption(o.id, {
            label: o.label, description: o.description, enabled: o.enabled, stock_status: o.stock_status, price_type: o.price_type,
            price_value: o.price_value, applies_to: o.applies_to?.length ? o.applies_to : null, values: o.values, internal_notes: o.internal_notes,
          });
      if (r.ok) onSaved(`${o.label} saved.`);
      else setError(r.error);
    });

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${o.label || 'option'}`}>
      <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isNew ? 'Add option' : `Edit ${option.label}`}</h2>
          <button onClick={onClose} aria-label="Close" className="text-xl text-stone-500">×</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {isNew && (
            <label className="block text-xs text-stone-600 sm:col-span-2">Id (can't be changed later)
              <input className="input mt-0.5" value={o.id} onChange={(e) => setO({ ...o, id: e.target.value.trim() })} />
            </label>
          )}
          <label className="block text-xs text-stone-600">Customer label
            <input className="input mt-0.5" value={o.label} onChange={(e) => setO({ ...o, label: e.target.value })} />
          </label>
          <label className="block text-xs text-stone-600">Short description
            <input className="input mt-0.5" value={o.description} onChange={(e) => setO({ ...o, description: e.target.value })} />
          </label>
          <label className="block text-xs text-stone-600">Price change
            <select className="input mt-0.5" value={o.price_type} onChange={(e) => setO({ ...o, price_type: e.target.value as PriceType })}>
              <option value="none">None</option>
              <option value="flat">Flat ($)</option>
              <option value="percent">Percent (%)</option>
              <option value="per_inch">Per inch of width ($)</option>
            </select>
          </label>
          <label className="block text-xs text-stone-600">{isMoney ? 'Amount ($, negative for a discount)' : o.price_type === 'percent' ? 'Percent' : 'Amount'}
            <input
              type="number"
              step={isMoney ? 0.01 : 1}
              disabled={o.price_type === 'none'}
              className="input mt-0.5"
              value={isMoney ? o.price_value / 100 : o.price_value}
              onChange={(e) => setO({ ...o, price_value: isMoney ? Math.round(Number(e.target.value) * 100) : Math.round(Number(e.target.value)) })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.enabled} onChange={(e) => setO({ ...o, enabled: e.target.checked })} /> On</label>
          <label className="block text-xs text-stone-600">Stock
            <select className="input mt-0.5" value={o.stock_status} onChange={(e) => setO({ ...o, stock_status: e.target.value as CatalogOption['stock_status'] })}>
              <option value="in_stock">In stock</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </label>
          <label className="block text-xs text-stone-600 sm:col-span-2">Applies to (product or style ids, comma-separated; empty = all)
            <input className="input mt-0.5" defaultValue={(o.applies_to ?? []).join(', ')} onChange={(e) => setO({ ...o, applies_to: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </div>

        <h3 className="mt-4 mb-1 text-sm font-medium">Details</h3>
        <ValueEditor value={o.values} onChange={(values) => setO({ ...o, values })} />
        {o.category === 'font' && <p className="mt-1 text-xs text-stone-500">A font can only be switched on once “licence confirmed” is ticked.</p>}

        <label className="mt-3 block text-xs text-stone-600">Internal notes (never shown to customers)
          <textarea className="input mt-0.5" rows={2} value={o.internal_notes} onChange={(e) => setO({ ...o, internal_notes: e.target.value })} />
        </label>

        <Preview option={o} />

        {!isNew && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Price history</h3>
            {!history ? <p className="text-xs text-stone-500">Loading…</p> : history.length === 0 ? <p className="text-xs text-stone-500">No price changes yet.</p> : (
              <ul className="text-xs">
                {history.map((h, i) => (
                  <li key={i}>{new Date(h.changed_at).toLocaleString()}: {priceText({ price_type: h.old_price_type as PriceType, price_value: h.old_price })} → {priceText({ price_type: h.new_price_type as PriceType, price_value: h.new_price })}</li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-stone-500">Price changes apply to new quotes only; orders already placed keep their price.</p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button className="btn disabled:opacity-50" disabled={!canSave || pending} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

/** How an option looks on a sample sign. */
function Preview({ option }: { option: CatalogOption }) {
  const hex = option.values.hex as string | undefined;
  if (hex)
    return (
      <div className="mt-4">
        <h3 className="mb-1 text-sm font-medium">Preview</h3>
        <svg viewBox="0 0 300 90" className="w-full max-w-sm rounded border border-stone-200" role="img" aria-label={`${option.label} on a sample sign`}>
          <rect width="300" height="90" fill="#D8D2C8" />
          <rect x="20" y="12" width="260" height="66" rx="8" fill={option.category === 'stain' ? hex : '#E3C9A0'} />
          <text x="150" y="58" textAnchor="middle" fontFamily="Georgia, serif" fontSize="34" fill={option.category === 'stain' ? '#F5F5F2' : hex}>Smith</text>
        </svg>
      </div>
    );
  const labParam = option.category === 'font' ? `font=${option.id}` : option.category === 'material' ? `material=${option.id}` : null;
  if (labParam)
    return (
      <p className="mt-4 text-sm">
        <Link className="text-blue-700" href={`/admin/lab?${labParam}`} target="_blank">Preview on a sample sign in the engine lab ↗</Link>
      </p>
    );
  return null;
}
