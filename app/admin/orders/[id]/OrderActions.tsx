'use client';

// The order page's controls: payment panel, status, files and the cut-file gate,
// internal notes and cancelling.

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { STATUS_LABEL, type Status } from '@/lib/order/payments';
import { money } from '../../ui';
import { addPayment, cancel, changeStatus, markPaid, overrideCut, regenerate, saveNotes, sendReminder } from '../actions';

type Res = { ok: boolean; error?: string; message?: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Res>, done = 'Saved.', after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message || done } : { ok: false, text: r.error ?? 'Failed' });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const note = msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{msg.text}</p>;
  return { pending, run, note };
}

const box = 'rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200';

interface PaymentRow {
  id: string;
  amount: number;
  kind: 'payment' | 'refund';
  method: string | null;
  received_at: string | null;
  reference: string | null;
  note: string | null;
}

export function PaymentPanel(p: {
  id: string;
  total: number;
  paid: number;
  daysUnpaid: number;
  reminderDays: number;
  canRecord: boolean;
  methods: string[];
  defaultMethod: string;
  today: string;
  payments: PaymentRow[];
  cancelled: boolean;
}) {
  const { pending, run, note } = useAction();
  const balance = p.total - p.paid;
  const [form, setForm] = useState({ amount: balance > 0 ? (balance / 100).toFixed(2) : '', kind: 'payment' as 'payment' | 'refund', method: p.defaultMethod, receivedAt: p.today, reference: '', note: '' });
  const [open, setOpen] = useState(false);
  return (
    <section className={box}>
      <h2 className="font-medium">Payments</h2>
      <dl className="mt-2 grid grid-cols-2 gap-1">
        <dt className="text-stone-500">Total</dt><dd className="text-right">{money(p.total)}</dd>
        <dt className="text-stone-500">Paid</dt><dd className="text-right">{money(p.paid)}</dd>
        <dt className="font-medium">Balance owing</dt><dd className={`text-right font-semibold ${balance > 0 ? 'text-red-800' : 'text-green-800'}`}>{money(balance)}</dd>
      </dl>
      {p.daysUnpaid >= p.reminderDays && <p className="mt-2 font-semibold text-red-700">Unpaid for {p.daysUnpaid} days</p>}
      {p.canRecord && !p.cancelled && (
        <div className="mt-3 flex flex-wrap gap-2">
          {balance > 0 && <button className="btn" disabled={pending} onClick={() => run(() => markPaid(p.id))}>Mark as paid ({money(balance)})</button>}
          {balance > 0 && <button className="rounded-md border border-stone-300 px-3 py-2" disabled={pending} onClick={() => run(() => sendReminder(p.id))}>Send reminder</button>}
          <button className="rounded-md border border-stone-300 px-3 py-2" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Record payment or refund'}</button>
        </div>
      )}
      {p.canRecord && p.cancelled && (
        <button className="mt-3 rounded-md border border-stone-300 px-3 py-2" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Record a refund'}</button>
      )}
      {open && (
        <form
          className="mt-3 grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addPayment(p.id, form), 'Recorded.', () => setOpen(false));
          }}
        >
          <label className="text-xs text-stone-600">Type
            <select className="input mt-0.5" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'payment' | 'refund' })}>
              {!p.cancelled && <option value="payment">Payment</option>}
              <option value="refund">Refund</option>
            </select>
          </label>
          <label className="text-xs text-stone-600">Amount ($)
            <input className="input mt-0.5" inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label className="text-xs text-stone-600">Method
            <select className="input mt-0.5" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {p.methods.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs text-stone-600">Date received
            <input className="input mt-0.5" type="date" required value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} />
          </label>
          <label className="col-span-2 text-xs text-stone-600">Reference (e-Transfer confirmation)
            <input className="input mt-0.5" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </label>
          <label className="col-span-2 text-xs text-stone-600">Note
            <input className="input mt-0.5" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <button className="btn col-span-2" disabled={pending}>Save {form.kind}</button>
        </form>
      )}
      {p.payments.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2">
          {p.payments.map((x) => (
            <li key={x.id} className="flex justify-between gap-2">
              <span>
                {x.received_at ?? '—'} · {x.method ?? '—'}{x.reference ? ` · #${x.reference}` : ''}
                {x.note && <span className="block text-xs text-stone-500">{x.note}</span>}
              </span>
              <span className={x.kind === 'refund' ? 'text-red-800' : ''}>{x.kind === 'refund' ? `−${money(x.amount)}` : money(x.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-stone-500">Payments can’t be edited or deleted. To correct one, record a refund or another payment.</p>
      {note}
    </section>
  );
}

const PRODUCTION: Status[] = ['in_production', 'ready', 'complete'];

export function StatusControls({ id, status, full }: { id: string; status: Status; full: boolean }) {
  const { pending, run, note } = useAction();
  if (status === 'cancelled') return <section className={box}><h2 className="font-medium">Cancelled</h2></section>;
  const options: Status[] = full ? ['awaiting_payment', ...PRODUCTION] : PRODUCTION;
  const canMove = full || ['paid_in_full', ...PRODUCTION].includes(status);
  return (
    <section className={box}>
      <h2 className="font-medium">Status: {STATUS_LABEL[status]}</h2>
      {canMove ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.filter((s) => s !== status).map((s) => (
            <button key={s} className="rounded-md border border-stone-300 px-3 py-1.5" disabled={pending} onClick={() => run(() => changeStatus(id, s), `Moved to ${STATUS_LABEL[s]}.`)}>
              → {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-stone-600">Production can start once the order is paid in full.</p>
      )}
      <p className="mt-2 text-xs text-stone-500">Payment statuses change by themselves when payments are recorded.</p>
      {note}
    </section>
  );
}

export function FilesPanel({ id, files, gate, canOverride, dxf }: { id: string; files: { kind: string; version: number; name: string }[]; gate: { allowed: boolean; warning?: string }; canOverride: boolean; dxf: boolean }) {
  const { pending, run, note } = useAction();
  const [reason, setReason] = useState('');
  const kinds = ['svg', 'png', ...(dxf ? ['dxf'] : [])];
  const label: Record<string, string> = { svg: 'SVG for LightBurn', png: 'Preview PNG', dxf: 'DXF (cut layer)' };
  return (
    <section className={box}>
      <h2 className="font-medium">Files</h2>
      {gate.warning && <p className={`mt-1 ${gate.allowed ? 'text-amber-800' : 'font-medium text-red-800'}`}>{gate.warning}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {kinds.map((k) => {
          const f = files.find((x) => x.kind === k);
          const blocked = k !== 'png' && !gate.allowed;
          return blocked ? (
            <span key={k} className="rounded-md border border-stone-200 px-3 py-2 text-stone-400">{label[k]} (locked)</span>
          ) : (
            <a key={k} href={`/api/admin/orders/${id}/files/${k}`} className="rounded-md border border-stone-300 px-3 py-2 hover:bg-stone-50">
              {label[k]}{f ? ` v${f.version}` : ''}
            </a>
          );
        })}
        <button className="rounded-md border border-stone-300 px-3 py-2" disabled={pending} onClick={() => run(() => regenerate(id))}>Regenerate files</button>
      </div>
      {!gate.allowed && canOverride && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm('Release cut files for this unpaid order? The reason is saved to the order history.')) run(() => overrideCut(id, reason), 'Cut files released.');
          }}
        >
          <input className="input flex-1" placeholder="Reason for releasing cut files before payment" value={reason} onChange={(e) => setReason(e.target.value)} required aria-label="Override reason" />
          <button className="rounded-md border border-red-300 px-3 py-2 text-red-800" disabled={pending}>Override</button>
        </form>
      )}
      {note}
    </section>
  );
}

export function NotesForm({ id, notes }: { id: string; notes: string }) {
  const { pending, run, note } = useAction();
  const [v, setV] = useState(notes);
  return (
    <section className={box}>
      <h2 className="font-medium">Private notes</h2>
      <textarea className="input mt-2" rows={3} value={v} onChange={(e) => setV(e.target.value)} aria-label="Private notes" />
      <button className="btn mt-2" disabled={pending || v === notes} onClick={() => run(() => saveNotes(id, v))}>Save notes</button>
      {note}
    </section>
  );
}

export function CancelForm({ id, paid, cutStarted, policy }: { id: string; paid: number; cutStarted: boolean; policy: Record<string, any> }) {
  const { pending, run, note } = useAction();
  const [by, setBy] = useState<'customer' | 'owner'>('customer');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const pct = by === 'owner' ? policy.refund_owner_cancel_pct : cutStarted ? policy.refund_customer_cancel_after_cut_pct : policy.refund_customer_cancel_before_cut_pct;
  const refund = Math.round((Math.max(0, paid) * pct) / 100);
  return (
    <section className={box}>
      {!open ? (
        <button className="text-red-700 underline" onClick={() => setOpen(true)}>Cancel order…</button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => cancel(id, by, reason));
          }}
          className="space-y-2"
        >
          <h2 className="font-medium">Cancel order</h2>
          <fieldset className="flex gap-4">
            <label className="flex items-center gap-1"><input type="radio" checked={by === 'customer'} onChange={() => setBy('customer')} /> Customer cancelled</label>
            <label className="flex items-center gap-1"><input type="radio" checked={by === 'owner'} onChange={() => setBy('owner')} /> I cancelled</label>
          </fieldset>
          <input className="input" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required aria-label="Reason for cancelling" />
          <p className="text-stone-600">
            Refund owed: <strong>{money(refund)}</strong> ({pct}% of {money(Math.max(0, paid))} paid{by === 'customer' ? (cutStarted ? ', after cutting started' : ', before cutting started') : ''}). It’s recorded as a refund entry.
          </p>
          <button className="rounded-md bg-red-700 px-3 py-2 text-white" disabled={pending}>Cancel order</button>
        </form>
      )}
      {note}
    </section>
  );
}
