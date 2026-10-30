'use client';

// Quick quote for Messenger: build a design in under a minute, then copy the price,
// save a square preview image to paste, or make a short design link.

import { useMemo, useState } from 'react';
import { byCategory, type CatalogOption, type Settings } from '@/lib/config/catalog';
import { runEngineOnce, squareImage } from '@/lib/client/runEngineOnce';
import { useEngine } from '@/lib/client/useEngine';
import type { LineRole } from '@/lib/engine/types';
import { previewSvg } from '@/lib/export/svg';
import { backersFor, defaultDesign, engineDesign, fontsFor, materialsFor, needsBacker, normalizeDesign, previewColours, quoteInput, sizesFor, stylesFor, type OrderDesign } from '@/lib/order/design';
import { dollars, quote } from '@/lib/pricing';
import { shortLinkFor } from '../orders/actions';
import BackdropPicker, { useBackdrop, type Backdrop } from '@/app/components/BackdropPicker';

const ROLE: Record<LineRole, string> = { top: 'Top line', main: 'Main name', small: 'Small line' };

export default function QuoteClient({ catalog, settings, initial }: { catalog: CatalogOption[]; settings: Settings; initial: OrderDesign }) {
  const [design, setRaw] = useState(initial);
  const backdrops: Backdrop[] = settings.preview?.backgrounds ?? [];
  const [backdrop, setBackdrop] = useBackdrop(backdrops);
  const set = (p: Partial<OrderDesign>) => setRaw((d) => normalizeDesign({ ...d, ...p }, catalog));
  const ed = useMemo(() => engineDesign(design, catalog, settings), [design, catalog, settings]);
  const { result, busy } = useEngine(ed, design.materialId, catalog, settings, 150);
  const q = useMemo(() => quote(quoteInput(design, result?.widthIn), catalog, settings), [design, result?.widthIn, catalog, settings]);
  const svg = result?.parts.length ? previewSvg(result, { colours: previewColours(design, catalog), background: 'plain', backdrop, showDimensions: false, showThin: true }) : '';
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState<{ url: string; shareId: string } | null>(null);
  const [listing, setListing] = useState<{ label: string; url: string }[] | null>(null);
  const [working, setWorking] = useState('');

  const label = (id?: string | null) => catalog.find((o) => o.id === id)?.label ?? '';
  const size = result ? `${Number(result.widthIn.toFixed(1))} × ${Number(result.heightIn.toFixed(1))} in` : '';
  const text = design.lines.filter((l) => l.text.trim()).map((l) => l.text.trim()).join(' / ');
  const finish = [label(design.finishId), ...design.colourIds.map(label)].filter(Boolean).join(', ');
  const message = q.ok ? `“${text}” sign, ${size}, ${label(design.materialId)}, ${finish}: ${dollars(q.totalCents)}.${link ? ` See it and order here: ${link.url}` : ''}` : '';
  const ok = !!result?.ok && q.ok && !busy;

  const copy = async (t: string, what: string) => {
    await navigator.clipboard?.writeText(t).catch(() => {});
    setMsg(`${what} copied.`);
  };
  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  async function makeLink() {
    setWorking('link');
    try {
      const res = await fetch('/api/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ design }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const r = await shortLinkFor(body.shareId);
      if (!r.ok) throw new Error(r.error);
      const url = `${location.origin}/d/${r.data}`;
      setLink({ url, shareId: body.shareId });
      await copy(url, 'Design link');
    } catch (e) {
      setMsg(`Couldn’t make a link: ${(e as Error).message}`);
    } finally {
      setWorking('');
    }
  }

  async function listingImages() {
    setWorking('listing');
    setListing([]);
    const out: { label: string; url: string }[] = [];
    for (const s of sizesFor(catalog, design.productId).filter((x) => x.values.kind !== 'custom_width')) {
      const d = normalizeDesign({ ...design, sizeId: s.id }, catalog);
      try {
        const r = await runEngineOnce(engineDesign(d, catalog, settings), d.materialId, catalog, settings);
        const p = quote(quoteInput(d, r.widthIn), catalog, settings);
        if (!r.ok || !p.ok) continue;
        const cap = `${s.label} · ${dollars(p.totalCents)}`;
        const blob = await squareImage(previewSvg(r, { colours: previewColours(d, catalog), background: 'wall', backdrop, showDimensions: false, showThin: false }), cap);
        out.push({ label: cap, url: URL.createObjectURL(blob) });
        setListing([...out]);
      } catch {}
    }
    setWorking('');
    if (!out.length) setMsg('None of the sizes can be cut with this design.');
  }

  const sel = (value: string, options: CatalogOption[], onChange: (v: string) => void, aria: string) => (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={aria}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Quick quote</h1>
      <div className="mt-4 grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-2 text-sm">
          {sel(design.productId, byCategory(catalog, 'product'), (id) => setRaw(defaultDesign(catalog, settings, id)), 'Product')}
          {design.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <input className="input" placeholder={ROLE[l.role]} aria-label={ROLE[l.role]} value={l.text} onChange={(e) => set({ lines: design.lines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              {sel(l.fontId, fontsFor(catalog, design.productId, l.role), (v) => set({ lines: design.lines.map((x, j) => (j === i ? { ...x, fontId: v } : x)) }), `${ROLE[l.role]} font`)}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {sel(design.sizeId, sizesFor(catalog, design.productId), (v) => set({ sizeId: v, customWidthIn: design.customWidthIn ?? 30 }), 'Size')}
            {catalog.find((o) => o.id === design.sizeId)?.values.kind === 'custom_width' && (
              <input className="input" type="number" step={0.5} aria-label="Custom width (in)" value={design.customWidthIn ?? ''} onChange={(e) => set({ customWidthIn: Number(e.target.value) })} />
            )}
          </div>
          {sel(design.styleId, stylesFor(catalog, design.productId), (v) => set({ styleId: v }), 'Style')}
          {needsBacker(catalog, design.styleId) && sel(design.backerId ?? '', backersFor(catalog, design), (v) => set({ backerId: v }), 'Backer')}
          {sel(design.materialId, materialsFor(catalog, design.placementId), (v) => set({ materialId: v }), 'Material')}
          {sel(design.finishId, byCategory(catalog, 'finish_type'), (v) => set({ finishId: v }), 'Finish')}
          {design.colourIds.map((c, i) => {
            const kinds: string[] = catalog.find((o) => o.id === design.finishId)?.values.colour_kinds ?? [];
            const opts = (kinds[i] === 'paint_or_stain' ? ['paint', 'stain'] : [kinds[i]]).flatMap((k) => byCategory(catalog, k));
            return <div key={i}>{sel(c, opts, (v) => set({ colourIds: design.colourIds.map((x, j) => (j === i ? v : x)) }), `Colour ${i + 1}`)}</div>;
          })}
          {sel(design.placementId, byCategory(catalog, 'placement'), (v) => set({ placementId: v }), 'Placement')}
          <fieldset className="space-y-1">
            {byCategory(catalog, 'addon').map((a) => (
              <label key={a.id} className="flex items-center gap-2">
                <input type="checkbox" checked={design.addonIds.includes(a.id)} onChange={(e) => set({ addonIds: e.target.checked ? [...design.addonIds, a.id] : design.addonIds.filter((x) => x !== a.id) })} />
                {a.label}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg bg-white p-3 ring-1 ring-stone-200">
            {svg ? <div className="[&>svg]:h-auto [&>svg]:max-h-[45vh] [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="py-16 text-center text-stone-500">{busy ? 'Drawing…' : 'No preview'}</p>}
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-semibold">{q.ok ? dollars(q.totalCents) : '—'}</span>
              <span className="text-stone-600">{size}</span>
              {busy && <span className="text-xs text-stone-500">updating…</span>}
            </div>
            <BackdropPicker list={backdrops} value={backdrop} onPick={setBackdrop} />
            {result && !result.ok && <ul className="mt-1 text-sm text-red-800">{result.failures.map((f, i) => <li key={i}>{f.message}</li>)}</ul>}
            {!q.ok && <ul className="mt-1 text-sm text-red-800">{q.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
          {ok && <textarea className="input text-sm" rows={3} readOnly value={message} aria-label="Quote message" />}
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={!ok} onClick={() => copy(message, 'Price message')}>Copy price message</button>
            <button className="btn" disabled={!ok} onClick={async () => download(await squareImage(previewSvg(result!, { colours: previewColours(design, catalog), background: 'wall', backdrop, showDimensions: false, showThin: false }), `${size} · ${dollars(q.totalCents)}`), `quote-${Date.now()}.png`)}>
              Save preview image
            </button>
            <button className="btn" disabled={!ok || working === 'link'} onClick={makeLink}>{working === 'link' ? 'Making link…' : 'Make design link'}</button>
            {link && <a className="rounded-md border border-stone-300 px-3 py-2 text-sm" href={`/admin/orders/new?share=${link.shareId}`}>Enter as an order</a>}
            <button className="rounded-md border border-stone-300 px-3 py-2 text-sm" disabled={!result || working === 'listing'} onClick={listingImages}>
              {working === 'listing' ? 'Making listing images…' : 'Listing images (every size)'}
            </button>
          </div>
          {link && <p className="break-all text-sm">Link: <a className="text-char underline" href={link.url}>{link.url}</a></p>}
          {msg && <p className="text-sm text-stone-700" role="status">{msg}</p>}
          {listing && listing.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listing.map((x) => (
                <a key={x.url} href={x.url} download={`listing-${x.label.replace(/[^a-z0-9]+/gi, '-')}.png`} className="block rounded-lg bg-white p-1 ring-1 ring-stone-200">
                  <img src={x.url} alt={x.label} className="w-full" />
                  <span className="block px-1 py-0.5 text-xs">{x.label} · save</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
