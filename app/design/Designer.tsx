'use client';

// The public order form: a step-by-step designer with the live preview and
// price above every step. The preview comes from the same engine that makes the
// cut file, and the price from the same calculator the server re-runs.

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { byCategory, type CatalogOption, type Settings } from '@/lib/config/catalog';
import type { LineRole } from '@/lib/engine/types';
import { previewSvg } from '@/lib/export/svg';
import { useEngine } from '@/lib/client/useEngine';
import { AlertIcon } from '@/app/components/icons';
import {
  backersFor,
  defaultDesign,
  engineDesign,
  fontsFor,
  isVertical,
  materialsFor,
  needsBacker,
  normalizeDesign,
  previewColours,
  quoteInput,
  sizesFor,
  stylesFor,
  topcoatsFor,
  type OrderDesign,
} from '@/lib/order/design';
import { formatDate, type Contact } from '@/lib/order/rules';
import { dollars, quote } from '@/lib/pricing';

const STEPS = ['Product', 'Text', 'Font', 'Size', 'Style', 'Finish', 'Extras', 'Proof', 'Details'] as const;
const ROLE_LABEL: Record<LineRole, string> = { top: 'Top line', main: 'Main name', small: 'Small line' };

export interface DesignerProps {
  catalog: CatalogOption[];
  settings: Settings;
  initial: OrderDesign;
  startStep?: number;
  earliest: { standard: string; rush: string };
  turnstileSiteKey: string | null;
  refundPolicy: string;
  /**
   * customer: the public order form.
   * admin-new: you entering an order (no spam checks; source and customer email choice).
   * admin-edit: you editing an order's design (ends at the proof, with re-approval and repricing choices).
   */
  mode?: 'customer' | 'admin-new' | 'admin-edit';
  orderId?: string;
  /** admin-edit: the order's current total, to show any change */
  currentTotalCents?: number;
}

export default function Designer({ catalog, settings, initial, startStep = 0, earliest, turnstileSiteKey, refundPolicy, mode = 'customer', orderId, currentTotalCents }: DesignerProps) {
  const admin = mode !== 'customer';
  const editing = mode === 'admin-edit';
  const lastStep = editing ? 7 : 8;
  const router = useRouter();
  const [design, setDesignRaw] = useState<OrderDesign>(initial);
  const [step, setStep] = useState(startStep);
  const [background, setBackground] = useState<'plain' | 'wall'>('plain');
  const [approved, setApproved] = useState(false);
  const [contact, setContact] = useState<Contact>({ name: '', email: '', phone: '', address: '', neededBy: '', heardFrom: '', notes: '' });
  const [honeypot, setHoneypot] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [share, setShare] = useState<{ url?: string; error?: string; busy?: boolean }>({});
  const [source, setSource] = useState('Facebook Marketplace');
  const [emailCustomer, setEmailCustomer] = useState(true);
  const [sendProof, setSendProof] = useState(true);
  const [reprice, setReprice] = useState(false);

  const setDesign = (patch: Partial<OrderDesign>) => setDesignRaw((d) => normalizeDesign({ ...d, ...patch }, catalog));
  const engineInput = useMemo(() => engineDesign(design, catalog, settings), [design, catalog, settings]);
  const { result, busy } = useEngine(engineInput, design.materialId, catalog, settings);
  const q = useMemo(() => quote(quoteInput(design, result?.widthIn), catalog, settings), [design, result?.widthIn, catalog, settings]);
  const colours = previewColours(design, catalog);
  // the result can lag the design by a moment; only trust it when it matches
  const fresh = !busy && !!result;
  const preview = result && result.parts.length ? previewSvg(result, { colours, background, showDimensions: true, showThin: true }) : '';
  const rush = design.addonIds.some((id) => catalog.find((o) => o.id === id)?.values.rush);
  const earliestDate = rush ? earliest.rush : earliest.standard;
  const vertical = isVertical(catalog, design.productId);
  const product = catalog.find((o) => o.id === design.productId);
  const delivery = catalog.find((o) => o.id === design.deliveryId);

  // the next step's button is only on when this step is complete
  const engineOk = fresh && result!.ok;
  const blockers: string[] = [];
  if (step === 1 && !design.lines.some((l) => l.role === 'main' && l.text.trim())) blockers.push('Type the main name.');
  if (step >= 1 && step <= 7 && fresh && !result!.ok) blockers.push(...result!.failures.map((f) => f.message));
  if (step >= 3 && !q.ok) blockers.push(...q.errors);
  if (step === 7 && !approved && !editing) blockers.push(admin ? 'Tick the box once the customer has approved the design.' : 'Tick the box to approve the proof.');
  const canNext = !blockers.length && (step < 1 || step > 7 || fresh);

  const next = () => {
    setStep((s) => Math.min(lastStep, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  async function shareDesign() {
    setShare({ busy: true });
    try {
      const res = await fetch('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design }) });
      const body = await res.json();
      if (!res.ok) return setShare({ error: body.error ?? 'Couldn’t save the design.' });
      const url = `${location.origin}${body.url}`;
      setShare({ url });
      if (navigator.share) navigator.share({ title: 'My sign design', url }).catch(() => {});
      else navigator.clipboard?.writeText(url).catch(() => {});
    } catch {
      setShare({ error: 'Couldn’t save the design. Check your connection.' });
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitting(true);
    setSubmitErrors([]);
    try {
      const [url, payload] = editing
        ? [`/api/admin/orders/${orderId}/design`, { design, sendProof, reprice }]
        : mode === 'admin-new'
          ? ['/api/admin/orders', { design, contact: { ...contact, neededBy: contact.neededBy || undefined }, proofApproved: approved, source, sendCustomerEmail: emailCustomer }]
          : ['/api/orders', { design, contact: { ...contact, neededBy: contact.neededBy || undefined }, proofApproved: approved, turnstileToken: token, website: honeypot }];
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && (body.confirmationUrl || body.url)) return router.push(admin ? body.url : body.confirmationUrl);
      setSubmitErrors(body.errors?.length ? body.errors : [body.error ?? `Something went wrong (${res.status}). Please try again.`]);
      (window as any).turnstile?.reset?.();
    } catch {
      setSubmitErrors(['Couldn’t send your order. Check your connection and try again.']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <FontFaces catalog={catalog} />

      {/* preview and price, above every step */}
      <div className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className={`cc-panel relative overflow-hidden p-1.5 ${step === 7 ? 'cc-panel--hung' : 'max-h-[30vh]'}`}>
          {preview ? (
            <div className={`[&>svg]:mx-auto [&>svg]:h-auto [&>svg]:w-full ${step === 7 ? '[&>svg]:max-h-[60vh]' : '[&>svg]:max-h-[26vh]'}`} dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-stone-400">{busy ? 'Drawing your sign…' : 'Your sign appears here'}</div>
          )}
          {busy && <span className="absolute right-2 top-2 rounded bg-white/80 px-2 py-0.5 text-xs text-stone-500">Updating…</span>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0">
            <span className="font-display text-2xl leading-[30px]">{q.ok ? dollars(q.totalCents) : '—'}</span>
            {result && <span className="ml-2 text-stone-600">{result.widthIn.toFixed(1)} × {result.heightIn.toFixed(1)} in</span>}
          </div>
          <label className="flex shrink-0 items-center gap-1 text-xs text-stone-600">
            <input type="checkbox" checked={background === 'wall'} onChange={(e) => setBackground(e.target.checked ? 'wall' : 'plain')} /> On a wall
          </label>
        </div>
        <ol className="mt-2 flex gap-1" aria-label="Steps">
          {STEPS.slice(0, lastStep + 1).map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i >= step}
                aria-current={i === step ? 'step' : undefined}
                aria-label={`${i + 1}. ${s}`}
                className="flex h-6 w-full items-center"
              >
                <span className={`block h-1.5 w-full rounded-full ${i < step ? 'bg-char' : i === step ? 'bg-maple' : 'bg-line'}`} />
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="px-4 pt-4">
        <h1 className="cc-display-s">
          <span className="text-stone-500">{step + 1}.</span> {stepTitle(step, vertical)}
        </h1>

        {step === 0 && (
          <Choices
            options={byCategory(catalog, 'product')}
            value={design.productId}
            onPick={(id) => setDesignRaw(defaultDesign(catalog, settings, id))}
            detail={(p) => p.description}
          />
        )}

        {step === 1 && <TextStep design={design} catalog={catalog} settings={settings} onChange={(lines) => setDesign({ lines })} />}

        {step === 2 &&
          design.lines.map((l, i) =>
            l.text.trim() ? (
              <section key={i} className="mt-4">
                <h2 className="cc-label">{ROLE_LABEL[l.role]}</h2>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {fontsFor(catalog, design.productId, l.role).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={l.fontId === f.id}
                      onClick={() => setDesign({ lines: design.lines.map((x, j) => (j === i ? { ...x, fontId: f.id } : x)) })}
                      className={`cc-choice p-2 text-left`}
                    >
                      <span className="block truncate text-2xl leading-tight" style={{ fontFamily: fontFamily(f.id) }}>{l.text}</span>
                      <span className="mt-1 block text-xs text-stone-500">{f.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null,
          )}

        {step === 3 && (
          <SizeStep design={design} catalog={catalog} settings={settings} ratio={result && result.widthIn ? result.heightIn / result.widthIn : null} onChange={setDesign} />
        )}

        {step === 4 && (
          <>
            <Choices options={stylesFor(catalog, design.productId)} value={design.styleId} onPick={(id) => setDesign({ styleId: id })} detail={(o) => o.description} price />
            {needsBacker(catalog, design.styleId) && !product?.values.forced_backer && (
              <>
                <h2 className="cc-label mt-6">Backer shape</h2>
                <Choices options={backersFor(catalog, design)} value={design.backerId ?? ''} onPick={(id) => setDesign({ backerId: id })} price compact />
              </>
            )}
            <h2 className="cc-label mt-6">Material</h2>
            <Choices options={materialsFor(catalog, design.placementId)} value={design.materialId} onPick={(id) => setDesign({ materialId: id })} detail={(o) => o.values.thickness_label} price compact />
          </>
        )}

        {step === 5 && <FinishStep design={design} catalog={catalog} onChange={setDesign} />}

        {step === 6 && (
          <>
            <h2 className="cc-label mt-4">Where will it hang?</h2>
            <Choices options={byCategory(catalog, 'placement')} value={design.placementId} onPick={(id) => setDesign({ placementId: id })} compact />
            {(() => {
              const coats = topcoatsFor(catalog, design.placementId, design.finishId);
              const forced = catalog.find((o) => o.category === 'topcoat' && o.id === q.topcoatId && o.values.automatic);
              if (forced) return <p className="mt-2 text-sm text-stone-600">Outdoor signs get {forced.label.toLowerCase()} ({dollars(forced.price_value)}) to protect them.</p>;
              if (coats.length < 2) return null;
              return (
                <>
                  <h2 className="cc-label mt-6">Clear coat</h2>
                  <Choices options={coats} value={design.topcoatId ?? ''} onPick={(id) => setDesign({ topcoatId: id })} price compact />
                </>
              );
            })()}
            <h2 className="cc-label mt-6">Extras</h2>
            <div className="mt-2 space-y-2">
              {byCategory(catalog, 'addon')
                .filter((a) => !(a.values.engine === 'engrave_small_line' && !design.lines.some((l) => l.role === 'small' && l.text.trim())))
                .map((a) => (
                  <label key={a.id} className="flex min-h-12 items-start gap-3 rounded-sm border-[1.5px] border-line-strong bg-white p-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={design.addonIds.includes(a.id)}
                      onChange={(e) => setDesign({ addonIds: e.target.checked ? [...design.addonIds, a.id] : design.addonIds.filter((x) => x !== a.id) })}
                    />
                    <span className="flex-1 text-sm">
                      {a.label}
                      {a.values.rush && <span className="block text-xs text-stone-500">Ready by {formatDate(earliest.rush)}</span>}
                    </span>
                    <span className="text-sm text-stone-600">{priceLabel(a)}</span>
                  </label>
                ))}
            </div>
          </>
        )}

        {step === 7 && (
          <div className="mt-3 space-y-4 text-sm">
            <Summary design={design} catalog={catalog} result={result} />
            <div>
              <h2 className="font-medium">Spelling, letter by letter</h2>
              {design.lines.filter((l) => l.text.trim()).map((l, i) => (
                <p key={i} className="mt-1 flex flex-wrap gap-1">
                  <span className="mr-1 text-stone-500">{ROLE_LABEL[l.role]}:</span>
                  {[...l.text.trim()].map((c, j) => (
                    <span key={j} className={`inline-flex h-7 min-w-6 items-center justify-center rounded border px-1 font-mono ${c === ' ' ? 'border-dashed border-stone-300 text-stone-400' : 'border-stone-300 bg-white'}`}>
                      {c === ' ' ? '␣' : c}
                    </span>
                  ))}
                </p>
              ))}
            </div>
            {settings.pricing.show_breakdown && <Breakdown q={q} />}
            <p className="rounded-sm border border-line bg-white p-3">{refundPolicy}</p>
            {editing ? (
              <div className="space-y-2">
                <label className="flex min-h-12 items-start gap-3 rounded-sm border-[1.5px] border-line-strong bg-white p-3">
                  <input type="checkbox" className="mt-0.5 h-5 w-5" checked={sendProof} onChange={(e) => setSendProof(e.target.checked)} />
                  <span>Email the customer the edited proof to approve. The version they approved stays on record.</span>
                </label>
                {currentTotalCents !== undefined && q.ok && q.totalCents !== currentTotalCents && (
                  <label className="flex min-h-12 items-start gap-3 rounded-sm border-[1.5px] border-kerf bg-birch p-3">
                    <input type="checkbox" className="mt-0.5 h-5 w-5" checked={reprice} onChange={(e) => setReprice(e.target.checked)} />
                    <span>Change the price from {dollars(currentTotalCents)} to {dollars(q.totalCents)}. Leave unticked to keep the price the customer agreed to.</span>
                  </label>
                )}
                {submitErrors.length > 0 && (
                  <ErrorList items={submitErrors} role="alert" />
                )}
              </div>
            ) : (
              <label className="flex min-h-12 items-start gap-3 rounded-sm border-[1.5px] border-line-strong bg-white p-3">
                <input type="checkbox" className="mt-0.5 h-5 w-5" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
                <span>
                  {admin
                    ? 'The customer has approved this design and the refund policy (in Messenger or in person).'
                    : 'I’ve checked the spelling, the layout and the size, and I agree to the refund policy. My sign will be made exactly as shown.'}
                </span>
              </label>
            )}
            {settings.production.share_links_enabled && !admin && (
              <div>
                <button type="button" onClick={shareDesign} disabled={share.busy} className="cc-small underline underline-offset-4">
                  {share.busy ? 'Saving…' : 'Share this design (send it to someone before ordering)'}
                </button>
                {share.url && (
                  <p className="mt-1 break-all text-xs text-stone-600">
                    Link copied: <a className="underline" href={share.url}>{share.url}</a>
                  </p>
                )}
                {share.error && <ErrorList items={[share.error]} role="alert" className="mt-1" />}
              </div>
            )}
          </div>
        )}

        {step === 8 && (
          <form id="order-form" onSubmit={submit} className="mt-3 space-y-3">
            {mode === 'admin-new' && (
              <div className="grid gap-3 rounded-sm border border-line bg-white p-3 sm:grid-cols-2">
                <label className="cc-field__label block">
                  Source
                  <select className="cc-field__input mt-2" value={source} onChange={(e) => setSource(e.target.value)}>
                    {['Facebook Marketplace', 'Instagram', 'Market booth', 'Referral', 'Repeat customer', 'Other'].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={emailCustomer} onChange={(e) => setEmailCustomer(e.target.checked)} /> Email the customer their order confirmation
                </label>
              </div>
            )}
            <Field label={admin ? 'Customer name' : 'Your name'} value={contact.name} onChange={(v) => setContact({ ...contact, name: v })} autoComplete="name" required />
            <Field label="Email" type="email" value={contact.email} onChange={(v) => setContact({ ...contact, email: v })} autoComplete="email" required />
            <Field label="Phone" type="tel" value={contact.phone} onChange={(v) => setContact({ ...contact, phone: v })} autoComplete="tel" required />
            <div>
              <span className="cc-field__label block">Pickup or delivery</span>
              <Choices options={byCategory(catalog, 'delivery')} value={design.deliveryId} onPick={(id) => setDesign({ deliveryId: id })} detail={(o) => (o.id === 'delivery.pickup' ? settings.business.pickup_note : o.values.needs_address ? settings.business.delivery_area : '')} price compact />
            </div>
            {delivery?.values.needs_address && (
              <Field label="Delivery address" value={contact.address ?? ''} onChange={(v) => setContact({ ...contact, address: v })} autoComplete="street-address" required />
            )}
            <label className="cc-field__label block">
              Needed by (optional)
              <input type="date" className="cc-field__input mt-2" min={earliestDate} value={contact.neededBy ?? ''} onChange={(e) => setContact({ ...contact, neededBy: e.target.value })} />
              <span className="mt-1 block text-xs font-normal text-stone-500">
                Earliest ready date: {formatDate(earliestDate)}
                {!rush && catalog.some((o) => o.values.rush && o.enabled) && ` (or ${formatDate(earliest.rush)} with rush)`}
              </span>
            </label>
            <label className="cc-field__label block">
              How did you hear about us?
              <select className="cc-field__input mt-2" value={contact.heardFrom} onChange={(e) => setContact({ ...contact, heardFrom: e.target.value })}>
                <option value="">Choose…</option>
                {(settings.business.hear_about_options ?? []).map((o: string) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label className="cc-field__label block">
              Notes (optional)
              <textarea className="cc-field__input mt-2" rows={3} maxLength={1000} value={contact.notes} onChange={(e) => setContact({ ...contact, notes: e.target.value })} />
            </label>
            {/* honeypot: hidden from people, so only bots fill it in */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />
              </label>
            </div>
            {!admin && turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} />}
            {!admin && (
              <p className="text-xs text-stone-500">
                {settings.business.privacy_note} <a href="/privacy" className="underline">Privacy</a>
              </p>
            )}
            <div className="rounded-sm border border-line bg-white p-3 text-sm">
              Amount due when you order: <strong>{dollars(q.amountDueCents)}</strong>
              {q.deliveryQuoted && <span className="block text-xs text-stone-500">Shipping is quoted separately.</span>}
            </div>
            {submitErrors.length > 0 && (
              <ErrorList items={submitErrors} role="alert" />
            )}
          </form>
        )}

        {step >= 1 && step <= 7 && fresh && !result!.ok && <Fixes design={design} catalog={catalog} codes={result!.failures.map((f) => f.code)} onChange={setDesign} onFont={() => setStep(2)} />}
        {blockers.length > 0 && step > 0 && (
          <ErrorList items={[...new Set(blockers)]} role="status" className="mt-4" />
        )}
      </div>

      {/* step buttons, fixed at the bottom for thumbs */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-3">
          {step > 0 && (
            <button type="button" onClick={back} className="cc-btn cc-btn--secondary">
              Back
            </button>
          )}
          {editing && step === lastStep ? (
            <button type="button" onClick={() => submit()} disabled={submitting || !canNext} className="cc-btn cc-btn--primary flex-1">
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          ) : step < lastStep ? (
            <button type="button" onClick={next} disabled={!canNext} className="cc-btn cc-btn--primary flex-1">
              {step === 7 ? (admin ? 'Continue' : 'Approve and continue') : step === 0 ? 'Start designing' : !fresh && step >= 1 ? 'Checking…' : `Next: ${STEPS[step + 1]}`}
            </button>
          ) : (
            <button type="submit" form="order-form" disabled={submitting || !q.ok || !engineOk || (!admin && !!turnstileSiteKey && !token)} className="cc-btn cc-btn--primary flex-1">
              {submitting ? 'Sending…' : admin ? `Save order · ${dollars(q.totalCents)}` : `Place order · ${dollars(q.amountDueCents)} due`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function stepTitle(step: number, vertical: boolean): string {
  return ['Pick a sign', 'Type your text', 'Pick fonts', vertical ? 'Pick a height' : 'Pick a size', 'Style and material', 'Finish and colours', 'Placement and extras', 'Check your proof', 'Your details'][step];
}

export const fontFamily = (id: string) => `"f-${id.replace(/[^a-z0-9]/gi, '-')}"`;

function FontFaces({ catalog }: { catalog: CatalogOption[] }) {
  const css = byCategory(catalog, 'font')
    .map((f) => `@font-face{font-family:${fontFamily(f.id)};src:url("/fonts/${encodeURIComponent(f.values.font_file)}");font-display:swap}`)
    .join('');
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export function priceLabel(o: CatalogOption): string {
  if (o.price_type === 'flat' && o.price_value) return `${o.price_value > 0 ? '+' : ''}${dollars(o.price_value)}`;
  if (o.price_type === 'percent' && o.price_value) return `+${o.price_value}%`;
  if (o.price_type === 'per_inch' && o.price_value) return `+${dollars(o.price_value)}/in`;
  return '';
}

function Choices({ options, value, onPick, detail, price, compact }: { options: CatalogOption[]; value: string; onPick: (id: string) => void; detail?: (o: CatalogOption) => string | undefined; price?: boolean; compact?: boolean }) {
  return (
    <div className={`mt-2 grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'sm:grid-cols-2'}`} role="radiogroup">
      {options.map((o) => {
        const out = o.stock_status === 'out_of_stock';
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            disabled={out}
            onClick={() => onPick(o.id)}
            className={`cc-choice p-3 text-left text-sm`}
          >
            <span className="flex justify-between gap-2">
              <span className="font-medium">{o.label}</span>
              {price && <span className="shrink-0 text-stone-600">{priceLabel(o)}</span>}
            </span>
            {out ? <span className="mt-0.5 block text-xs text-stone-500">Out of stock</span> : detail?.(o) && <span className="mt-0.5 block text-xs text-stone-500">{detail(o)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function TextStep({ design, catalog, settings, onChange }: { design: OrderDesign; catalog: CatalogOption[]; settings: Settings; onChange: (lines: OrderDesign['lines']) => void }) {
  const product = catalog.find((o) => o.id === design.productId);
  const maxLines: number = product?.values.max_lines ?? 0;
  const set = (i: number, text: string) => onChange(design.lines.map((l, j) => (j === i ? { ...l, text } : l)));
  const roles: LineRole[] = ['top', 'main', 'small'];
  return (
    <div className="mt-3 space-y-3">
      {design.lines.map((l, i) => {
        const max = settings.sizes.max_chars[l.role];
        const n = [...l.text].length;
        const optional = l.role !== 'main';
        return (
          <label key={i} className="block">
            <span className="flex justify-between text-sm font-medium text-stone-700">
              <span>
                {ROLE_LABEL[l.role]}
                {optional && <span className="font-normal text-stone-500"> (optional, leave empty to skip)</span>}
              </span>
              <span className={n > max ? 'font-semibold text-danger' : 'font-normal text-stone-500'}>{n}/{max}</span>
            </span>
            <span className="mt-1 flex gap-2">
              <input className="cc-field__input" value={l.text} maxLength={max + 5} onChange={(e) => set(i, e.target.value)} autoCapitalize="words" />
              {maxLines > 0 && design.lines.length > 1 && (
                <button type="button" className="px-2 text-stone-500" onClick={() => onChange(design.lines.filter((_, j) => j !== i))} aria-label="Remove line">×</button>
              )}
            </span>
          </label>
        );
      })}
      {maxLines > design.lines.length && (
        <div className="flex flex-wrap gap-2 text-sm">
          {roles
            .filter((r) => r !== 'main' || !design.lines.some((l) => l.role === 'main'))
            .map((r) => (
              <button
                key={r}
                type="button"
                className="cc-btn cc-btn--secondary"
                onClick={() => {
                  const fonts = fontsFor(catalog, design.productId, r);
                  const line = { role: r, text: '', fontId: fonts[0]?.id ?? '' };
                  const order = { top: 0, main: 1, small: 2 };
                  onChange([...design.lines, line].sort((a, b) => order[a.role] - order[b.role]));
                }}
              >
                + {ROLE_LABEL[r]}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function SizeStep({ design, catalog, settings, ratio, onChange }: { design: OrderDesign; catalog: CatalogOption[]; settings: Settings; ratio: number | null; onChange: (p: Partial<OrderDesign>) => void }) {
  const sizes = sizesFor(catalog, design.productId);
  const custom = sizes.find((s) => s.values.kind === 'custom_width');
  const presets = sizes.filter((s) => s.values.kind !== 'custom_width');
  const min = custom?.values.min_width_in ?? settings.sizes.custom_width_min_in;
  const max = settings.machine.largest_sign_in;
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
        {presets.map((s) => {
          const w = s.values.width_in as number | undefined;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={design.sizeId === s.id}
              onClick={() => onChange({ sizeId: s.id })}
              className={`cc-choice p-3 text-left text-sm`}
            >
              <span className="flex justify-between">
                <span className="font-medium">{s.label}</span>
                <span className="text-stone-600">{dollars(s.price_value)}</span>
              </span>
              {w && ratio && <span className="block text-xs text-stone-500">about {(w * ratio).toFixed(1)} in tall</span>}
            </button>
          );
        })}
      </div>
      {custom && (
        <label className="mt-3 flex min-h-12 items-center gap-3 rounded-sm border-[1.5px] border-line-strong bg-white p-3 text-sm">
          <input type="radio" checked={design.sizeId === custom.id} onChange={() => onChange({ sizeId: custom.id, customWidthIn: design.customWidthIn ?? 30 })} />
          <span className="flex-1">Custom width</span>
          <input
            type="number"
            inputMode="decimal"
            className="cc-field__input w-24"
            min={min}
            max={max}
            step={0.5}
            value={design.sizeId === custom.id ? design.customWidthIn ?? '' : ''}
            placeholder={`${min}–${max}`}
            onChange={(e) => onChange({ sizeId: custom.id, customWidthIn: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          <span>in</span>
        </label>
      )}
      <p className="mt-2 text-xs text-stone-500">The height follows from your text and font. The largest sign we make is {max} in.</p>
    </div>
  );
}

function FinishStep({ design, catalog, onChange }: { design: OrderDesign; catalog: CatalogOption[]; onChange: (p: Partial<OrderDesign>) => void }) {
  const finish = catalog.find((o) => o.id === design.finishId);
  const kinds: string[] = finish?.values.colour_kinds ?? [];
  const pieces: string[] = catalog.find((o) => o.id === design.styleId)?.values.colour_pieces ?? [];
  return (
    <>
      <Choices options={byCategory(catalog, 'finish_type')} value={design.finishId} onPick={(id) => onChange({ finishId: id })} price compact />
      {kinds.map((kind, i) => {
        const swatches = (kind === 'paint_or_stain' ? ['paint', 'stain'] : [kind]).flatMap((c) => byCategory(catalog, c));
        return (
          <section key={i} className="mt-5">
            <h2 className="cc-label">{kinds.length > 1 ? `Colour for the ${pieces[i] ?? `piece ${i + 1}`}` : 'Colour'}</h2>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {swatches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={design.colourIds[i] === c.id}
                  disabled={c.stock_status === 'out_of_stock'}
                  onClick={() => onChange({ colourIds: design.colourIds.map((x, j) => (j === i ? c.id : x)) })}
                  className={`cc-choice p-2 text-left text-xs`}
                >
                  <span className="block h-8 rounded border border-stone-200" style={{ background: c.values.hex }} />
                  <span className="mt-1 block">{c.label}</span>
                  {priceLabel(c) && <span className="block text-stone-500">{priceLabel(c)}</span>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <p className="mt-3 text-xs text-stone-500">Colours on screen are close, not exact.</p>
    </>
  );
}

/** When the sign can't be cut as it is, offer the fix: a bigger size, another font, or letters on a backer. */
function Fixes({ design, catalog, codes, onChange, onFont }: { design: OrderDesign; catalog: CatalogOption[]; codes: string[]; onChange: (p: Partial<OrderDesign>) => void; onFont: () => void }) {
  const sizes = sizesFor(catalog, design.productId).filter((s) => s.values.kind !== 'custom_width');
  const cur = catalog.find((o) => o.id === design.sizeId);
  const curSize = cur?.values.kind === 'custom_width' ? design.customWidthIn ?? 0 : cur?.values.width_in ?? cur?.values.height_in ?? 0;
  const dim = (s: CatalogOption) => s.values.width_in ?? s.values.height_in;
  const bigger = sizes.filter((s) => dim(s) > curSize).sort((a, b) => dim(a) - dim(b))[0];
  const smaller = sizes.filter((s) => dim(s) < curSize).sort((a, b) => dim(b) - dim(a))[0];
  const backer = stylesFor(catalog, design.productId).find((s) => s.values.needs_backer && s.id !== design.styleId && s.id === 'style.letters-on-backer') ?? stylesFor(catalog, design.productId).find((s) => s.values.needs_backer && s.id !== design.styleId);
  const tooBig = codes.some((c) => c === 'too_wide' || c === 'too_tall');
  const cutIssue = codes.some((c) => ['letters_too_small', 'thin_section', 'not_one_piece', 'loose_centres'].includes(c));
  if (!tooBig && !cutIssue && !codes.includes('missing_glyphs') && !codes.includes('font_not_allowed_for_line')) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-sm">
      {cutIssue && bigger && <button type="button" className="cc-btn cc-btn--secondary" onClick={() => onChange({ sizeId: bigger.id })}>Make it bigger ({bigger.label})</button>}
      {tooBig && smaller && <button type="button" className="cc-btn cc-btn--secondary" onClick={() => onChange({ sizeId: smaller.id })}>Make it smaller ({smaller.label})</button>}
      <button type="button" className="cc-btn cc-btn--secondary" onClick={onFont}>Try another font</button>
      {cutIssue && backer && <button type="button" className="cc-btn cc-btn--secondary" onClick={() => onChange({ styleId: backer.id })}>Use {backer.label.toLowerCase()} ({priceLabel(backer) || 'no charge'})</button>}
    </div>
  );
}

function Summary({ design, catalog, result }: { design: OrderDesign; catalog: CatalogOption[]; result: { widthIn: number; heightIn: number } | null }) {
  const label = (id?: string | null) => catalog.find((o) => o.id === id)?.label ?? '';
  const rows: [string, string][] = [
    ['Sign', label(design.productId)],
    ['Finished size', result ? `${result.widthIn.toFixed(2)} in wide × ${result.heightIn.toFixed(2)} in tall` : '—'],
    ['Fonts', design.lines.filter((l) => l.text.trim()).map((l) => `${ROLE_LABEL[l.role]}: ${label(l.fontId)}`).join(' · ')],
    ['Style', [label(design.styleId), needsBacker(catalog, design.styleId) ? label(catalog.find((o) => o.id === design.productId)?.values.forced_backer ?? design.backerId) : ''].filter(Boolean).join(', ')],
    ['Material', label(design.materialId)],
    ['Finish', [label(design.finishId), ...design.colourIds.map(label)].join(', ')],
    ['Placement', label(design.placementId)],
  ];
  if (design.addonIds.length) rows.push(['Extras', design.addonIds.map(label).join(', ')]);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-sm border border-line bg-white p-3">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Breakdown({ q }: { q: ReturnType<typeof quote> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {q.lines.map((l) => (
          <tr key={l.key} className="border-b border-stone-100">
            <td className="py-1">{l.label}{l.note && <span className="text-stone-500"> ({l.note})</span>}</td>
            <td className="py-1 text-right">{dollars(l.cents)}</td>
          </tr>
        ))}
        <tr>
          <td className="py-1 font-semibold">Total</td>
          <td className="py-1 text-right font-semibold">{dollars(q.totalCents)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function Field({ label, value, onChange, type = 'text', autoComplete, required }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; required?: boolean }) {
  return (
    <label className="cc-field__label block">
      {label}
      <input className="cc-field__input mt-2" type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={required} />
    </label>
  );
}

/**
 * Cloudflare Turnstile widget; hands its token up when the check passes. If the
 * check fails or never loads, it says so (with Cloudflare's error code) and
 * offers to try again, rather than leaving the order button greyed out.
 */
function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    const w = window as any;
    let alive = true;
    const render = () => {
      if (!alive || !box.current || widget.current !== undefined) return;
      widget.current = w.turnstile.render(box.current, {
        sitekey: siteKey,
        callback: (t: string) => {
          setProblem('');
          onToken(t);
        },
        'expired-callback': () => onToken(''),
        'error-callback': (code: string) => {
          onToken('');
          setProblem(`The spam check didn’t work (Cloudflare error ${code}).`);
          console.warn('[turnstile] error', code);
          // handled here, so Cloudflare doesn't also throw
          return true;
        },
        retry: 'auto',
        'refresh-expired': 'auto',
      });
    };
    // if Cloudflare's script never arrives (blocked or offline), say so
    const timer = setTimeout(() => {
      if (alive && !w.turnstile) setProblem('The spam check couldn’t load. Check your connection or try another browser.');
    }, 15000);
    if (w.turnstile) render();
    else {
      w.onTurnstileLoad = render;
      if (!document.querySelector('script[data-turnstile]')) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
        s.async = true;
        s.dataset.turnstile = '1';
        document.head.appendChild(s);
      }
    }
    return () => {
      alive = false;
      clearTimeout(timer);
      if (widget.current !== undefined) w.turnstile?.remove?.(widget.current);
      widget.current = undefined;
    };
  }, [siteKey, onToken]);
  return (
    <div>
      <div ref={box} className="min-h-[65px]" />
      {problem && (
        <p className="cc-field__error mt-2" role="alert">
          <AlertIcon />
          <span>
          {problem}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setProblem('');
              const w = window as any;
              if (widget.current !== undefined) w.turnstile?.reset?.(widget.current);
              else location.reload();
            }}
          >
            Try again
          </button>
          </span>
        </p>
      )}
    </div>
  );
}

/** Problems in the danger colour, each with the icon, saying what's wrong and how to fix it. */
function ErrorList({ items, role, className = '' }: { items: string[]; role: 'alert' | 'status'; className?: string }) {
  return (
    <ul className={`space-y-2 ${className}`} role={role}>
      {items.map((e) => (
        <li key={e} className="cc-field__error">
          <AlertIcon />
          <span>{e}</span>
        </li>
      ))}
    </ul>
  );
}
