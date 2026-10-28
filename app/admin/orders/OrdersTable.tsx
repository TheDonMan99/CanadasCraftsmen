'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { STATUS_LABEL, type Badge, type Status } from '@/lib/order/payments';
import { money, PaidBadge, shortDate, StatusPill } from '../ui';
import { bulkRegenerate, bulkStatus } from './actions';

export interface Row {
  id: string;
  number: string;
  created_at: string;
  customer: string;
  product: string;
  text: string;
  width: number | null;
  material: string;
  finish: string;
  total: number;
  paid: number;
  balance: number;
  badge: Badge;
  status: Status;
  needed_by: string | null;
  days_unpaid: number;
}

const MANUAL: Status[] = ['awaiting_payment', 'in_production', 'ready', 'complete'];

export default function OrdersTable({ rows, reminderDays }: { rows: Row[]; reminderDays: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const ids = [...selected];
  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? 'Done.' } : { ok: false, text: r.error ?? 'Failed' });
      if (r.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  return (
    <>
      <div className="mt-3 flex min-h-9 flex-wrap items-center gap-2 text-sm">
        {ids.length > 0 && (
          <>
            <span>{ids.length} selected:</span>
            <select
              className="input w-auto"
              value=""
              disabled={pending}
              aria-label="Change status of selected"
              onChange={(e) => e.target.value && act(() => bulkStatus(ids, e.target.value))}
            >
              <option value="">Change status…</option>
              {MANUAL.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5" disabled={pending} onClick={() => act(() => bulkRegenerate(ids))}>
              Generate files
            </button>
          </>
        )}
        {msg && <span className={msg.ok ? 'text-green-800' : 'text-red-700'} role="status">{msg.text}</span>}
      </div>
      <div className="mt-2 overflow-x-auto rounded-lg bg-white ring-1 ring-stone-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="px-2 py-2">
                <input type="checkbox" aria-label="Select all" checked={rows.length > 0 && selected.size === rows.length} onChange={(e) => setSelected(new Set(e.target.checked ? rows.map((r) => r.id) : []))} />
              </th>
              <th>Number</th><th>Date</th><th>Customer</th><th>Product</th><th>Width</th><th>Material</th><th>Finish</th>
              <th className="text-right">Total</th><th>Paid</th><th className="text-right">Balance</th><th>Status</th><th className="pr-3">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-2 py-2"><input type="checkbox" aria-label={`Select ${r.number}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="whitespace-nowrap"><Link href={`/admin/orders/${r.id}`} className="font-medium underline">{r.number}</Link></td>
                <td className="whitespace-nowrap">{shortDate(r.created_at)}</td>
                <td>{r.customer}</td>
                <td title={r.text}>{r.product}<div className="max-w-[12rem] truncate text-xs text-stone-500">{r.text}</div></td>
                <td>{r.width ? `${Number(r.width).toFixed(1)} in` : '—'}</td>
                <td>{r.material}</td>
                <td>{r.finish}</td>
                <td className="text-right">{money(r.total)}</td>
                <td className="whitespace-nowrap">
                  <PaidBadge badge={r.badge} />
                  {r.days_unpaid >= reminderDays && <span className="ml-1 text-xs font-semibold text-red-700">{r.days_unpaid}d</span>}
                </td>
                <td className="text-right">{money(r.balance)}</td>
                <td><StatusPill status={r.status} /></td>
                <td className="whitespace-nowrap pr-3">{shortDate(r.needed_by)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={13} className="px-3 py-6 text-center text-stone-500">No orders match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">Sending selected orders to nesting arrives with phase 5.</p>
    </>
  );
}
