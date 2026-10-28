import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/auth/session';
import { buildContext } from '@/lib/config/context';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getOwnerOrder, getProductionOrder, markReviewed, orderEmails, orderFiles, orderHistory, orderPayments } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { runEngine, type EngineResult } from '@/lib/engine';
import { previewSvg } from '@/lib/export/svg';
import { previewColours } from '@/lib/order/design';
import { cutFileGate, daysSince, paymentBadge, STATUS_LABEL, type Status } from '@/lib/order/payments';
import { formatDate } from '@/lib/order/rules';
import { loadFontFile } from '@/lib/server/fonts';
import { money, PaidBadge, shortDate, StatusPill } from '../../ui';
import { CancelForm, FilesPanel, NotesForm, PaymentPanel, StatusControls } from './OrderActions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePage(undefined, `/admin/orders/${id}`);
  if (!user.perms.view_orders && !user.perms.view_board) await requirePage('view_board');
  const db = getDb();
  if (!db) notFound();
  const full = user.perms.view_orders;
  // a new order moves on to Awaiting payment once you've opened it
  if (full && user.perms.edit_orders) {
    const peek = await getOwnerOrder(db, id);
    if (peek?.status === 'new') await markReviewed(db, id, user.email);
  }
  const owner = full ? await getOwnerOrder(db, id) : null;
  const prod = full ? null : await getProductionOrder(db, id);
  const o = owner ?? prod;
  if (!o) notFound();
  const [settings, catalog, history, files] = await Promise.all([loadSettings(), loadCatalog(), orderHistory(db, id), orderFiles(db, id)]);
  const payments = owner && user.perms.view_payments ? await orderPayments(db, id) : [];
  const emails = owner ? await orderEmails(db, id) : [];

  let result: EngineResult | null = null;
  try {
    result = runEngine(o.design.engine, buildContext(catalog, settings, loadFontFile, o.design.materialId));
  } catch {}
  const preview = result?.parts.length ? previewSvg(result, { colours: previewColours(o.design, catalog), background: 'plain', showDimensions: true, showThin: true }) : '';
  const l = o.design.labels ?? {};
  const paid = owner?.paid ?? 0;
  const gate = cutFileGate({ status: o.status, total: owner ? owner.total : 1, paid: owner ? paid : prod!.paid_up ? 1 : 0, cut_override_reason: o.cut_override_reason }, settings);
  const badge = owner ? paymentBadge(owner.total, owner.deposit_required, payments, settings) : null;
  const balance = owner ? owner.total - paid : 0;
  const daysUnpaid = owner && balance > 0 && !['cancelled', 'complete'].includes(o.status) ? daysSince(o.created_at) : 0;
  const r = result?.report;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={full ? '/admin/orders' : '/admin/board'} className="text-sm text-stone-500">← {full ? 'Orders' : 'Board'}</Link>
        <h1 className="text-2xl font-semibold">{o.number}</h1>
        <StatusPill status={o.status as Status} />
        {badge && <PaidBadge badge={badge} big />}
        {o.rush && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">RUSH</span>}
        <span className="text-sm text-stone-500">
          {owner ? owner.customer_name : (o as any).first_name} · placed {shortDate(o.created_at)}{o.source ? ` · ${o.source}` : ''}
        </span>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="rounded-lg bg-white p-3 ring-1 ring-stone-200">
            {preview ? <div className="[&>svg]:h-auto [&>svg]:max-h-[50vh] [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="py-10 text-center text-stone-400">No preview</p>}
            {result && !result.ok && <ul className="mt-2 text-sm text-red-800">{result.failures.map((f, i) => <li key={i}>✗ {f.message}</li>)}</ul>}
          </section>

          <section className="grid gap-4 rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200 md:grid-cols-2">
            <div>
              <h2 className="mb-2 font-medium">Sign</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-stone-500">Product</dt><dd>{l.product}</dd>
                {(l.lines ?? []).map((x: any, i: number) => (
                  <div key={i} className="contents"><dt className="text-stone-500">{x.role}</dt><dd>“{x.text}” in {x.font}</dd></div>
                ))}
                <dt className="text-stone-500">Size</dt><dd>{l.size}{o.width_in ? ` (${Number(o.width_in).toFixed(2)} × ${Number(o.height_in).toFixed(2)} in)` : ''}</dd>
                <dt className="text-stone-500">Style</dt><dd>{[l.style, l.backer].filter(Boolean).join(', ')}</dd>
                <dt className="text-stone-500">Material</dt><dd>{l.material}</dd>
                <dt className="text-stone-500">Finish</dt><dd>{[l.finish, ...(l.colours ?? [])].filter(Boolean).join(', ')}{l.topcoat && l.topcoat !== 'None' ? `, ${l.topcoat}` : ''}</dd>
                <dt className="text-stone-500">Placement</dt><dd>{l.placement}</dd>
                {l.addons?.length > 0 && <><dt className="text-stone-500">Extras</dt><dd>{l.addons.join(', ')}</dd></>}
                <dt className="text-stone-500">Needed by</dt><dd>{o.needed_by ? formatDate(o.needed_by) : '—'}</dd>
                <dt className="text-stone-500">Proof</dt>
                <dd>{o.proof_approved_at ? `Approved ${shortDate(o.proof_approved_at)}` : o.proof_requested_at ? `Edited proof sent ${shortDate(o.proof_requested_at)}, waiting for approval` : 'Not approved'}</dd>
              </dl>
              {user.perms.edit_orders && o.status !== 'cancelled' && (
                <Link href={`/admin/orders/${o.id}/edit`} className="mt-3 inline-block text-sm text-blue-700 underline">Edit design (typo, font…)</Link>
              )}
            </div>
            {r && (
              <div>
                <h2 className="mb-2 font-medium">Engine report</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-stone-500">Pieces</dt><dd>{r.pieceCount}</dd>
                  <dt className="text-stone-500">Thinnest</dt><dd>{r.thinnest ? `${r.thinnest.widthIn.toFixed(3)} in` : '—'}</dd>
                  <dt className="text-stone-500">Cut length</dt><dd>{r.cutLengthIn.toFixed(0)} in</dd>
                  <dt className="text-stone-500">Laser time</dt><dd>about {r.laserMinutes.toFixed(0)} min</dd>
                  <dt className="text-stone-500">Material area</dt><dd>{r.partAreaIn2.toFixed(0)} in²</dd>
                </dl>
              </div>
            )}
          </section>

          <FilesPanel
            id={o.id}
            files={files.map((f) => ({ kind: f.kind, version: f.version, name: f.storage_path.split('/').at(-1)! }))}
            gate={gate}
            canOverride={user.perms.override_cut_gate}
            dxf={!!settings.export.dxf_enabled}
          />

          <section className="rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200">
            <h2 className="mb-2 font-medium">Timeline</h2>
            <ol className="space-y-1">
              {history.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 text-stone-500">{new Date(h.changed_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: settings.business.timezone })}</span>
                  <span>
                    {h.from_status !== h.to_status ? <strong>{STATUS_LABEL[h.to_status as Status] ?? h.to_status}</strong> : null}
                    {h.note ? <span className="text-stone-600"> {h.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {owner && (
            <section className="rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200">
              <h2 className="mb-2 font-medium">Emails</h2>
              {!emails.length && <p className="text-stone-500">None yet.</p>}
              <ul className="space-y-1">
                {emails.map((e, i) => (
                  <li key={i} className={e.status === 'failed' ? 'text-red-800' : e.status === 'held' ? 'text-amber-800' : ''}>
                    {shortDate(e.sent_at)} · {e.template.replace(/_/g, ' ')} → {e.recipient}: <strong>{e.status}</strong>{e.error ? ` (${e.error})` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <StatusControls id={o.id} status={o.status as Status} full={user.perms.edit_orders} />
          {owner && user.perms.view_payments && (
            <PaymentPanel
              id={o.id}
              total={owner.total}
              paid={paid}
              daysUnpaid={daysUnpaid}
              reminderDays={settings.payments.reminder_after_days ?? 3}
              canRecord={user.perms.record_payments}
              methods={catalog.filter((m) => m.category === 'payment_method').map((m) => m.label).concat('Other')}
              defaultMethod={catalog.find((m) => m.id === settings.payments.default_method)?.label ?? 'Interac e-Transfer'}
              today={new Date().toLocaleDateString('en-CA', { timeZone: settings.business.timezone })}
              payments={payments.map((p) => ({ ...p, received_at: p.received_at ? String(p.received_at).slice(0, 10) : null, recorded_at: String(p.recorded_at) }))}
              cancelled={o.status === 'cancelled'}
            />
          )}
          {owner && user.perms.view_contacts && (
            <section className="rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200">
              <h2 className="mb-2 font-medium">Customer</h2>
              <p>{owner.customer_name}</p>
              <p><a className="text-blue-700 underline" href={`mailto:${owner.customer_email}`}>{owner.customer_email}</a></p>
              {owner.customer_phone && <p><a className="text-blue-700 underline" href={`tel:${owner.customer_phone}`}>{owner.customer_phone}</a></p>}
              <p className="mt-2 text-stone-600">{l.delivery}{owner.delivery_address ? `: ${owner.delivery_address}` : ''}</p>
              {owner.notes_customer && <p className="mt-2 rounded bg-stone-50 p-2">“{owner.notes_customer}”</p>}
            </section>
          )}
          {owner && user.perms.view_prices && (
            <section className="rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200">
              <h2 className="mb-2 font-medium">Price (as ordered)</h2>
              <table className="w-full">
                <tbody>
                  {(owner.price_breakdown?.lines ?? []).map((x: any) => (
                    <tr key={x.key} className="border-b border-stone-100"><td className="py-0.5">{x.label}</td><td className="text-right">{money(x.cents)}</td></tr>
                  ))}
                  <tr><td className="py-0.5 font-semibold">Total</td><td className="text-right font-semibold">{money(owner.total)}</td></tr>
                </tbody>
              </table>
            </section>
          )}
          {owner && user.perms.edit_orders && <NotesForm id={o.id} notes={owner.notes_internal ?? ''} />}
          {owner && user.perms.edit_orders && o.status !== 'cancelled' && (
            <CancelForm id={o.id} paid={paid} cutStarted={['in_production', 'ready', 'complete'].includes(o.status)} policy={settings.payments} />
          )}
        </aside>
      </div>
    </main>
  );
}
