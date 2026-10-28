import Link from 'next/link';
import { byCategory, seedCatalog, seedSettings } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import { loadCatalog, loadSettings } from '@/lib/data';
import { runEngine } from '@/lib/engine';
import { previewSvg } from '@/lib/export/svg';
import { defaultDesign, engineDesign, previewColours, quoteInput } from '@/lib/order/design';
import { dollars, quote } from '@/lib/pricing';
import { loadFontFile } from '@/lib/server/fonts';

// drawn by the engine once an hour, not on every visit
export const revalidate = 3600;

async function load() {
  try {
    return { catalog: await loadCatalog({ enabledOnly: true }), settings: await loadSettings() };
  } catch {
    return { catalog: seedCatalog().filter((o) => o.enabled), settings: seedSettings() };
  }
}

export default async function Home() {
  const { catalog, settings } = await load();
  const products = byCategory(catalog, 'product').map((p) => {
    const d = defaultDesign(catalog, settings, p.id);
    try {
      const r = runEngine(engineDesign(d, catalog, settings), buildContext(catalog, settings, loadFontFile, d.materialId));
      const q = quote(quoteInput(d, r.widthIn), catalog, settings);
      return { p, svg: r.parts.length ? previewSvg(r, { colours: previewColours(d, catalog), background: 'wall', showDimensions: false, showThin: false }) : '', from: q.ok ? q.totalCents : null };
    } catch {
      return { p, svg: '', from: null };
    }
  });
  const name = settings.business.name.startsWith('[') ? 'Custom laser-cut signs' : settings.business.name;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-amber-700">{name}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Welcome signs and name signs, cut from real wood</h1>
        <p className="mx-auto mt-3 max-w-xl text-stone-600">Design yours on your phone in a couple of minutes. You see exactly what we’ll cut, and the price, before you order.</p>
        <Link href="/design" className="mt-6 inline-block rounded-lg bg-stone-900 px-6 py-3 font-medium text-white">Design your sign</Link>
      </header>

      <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map(({ p, svg, from }) => (
          <Link key={p.id} href={`/design?product=${encodeURIComponent(p.id)}`} className="group overflow-hidden rounded-xl bg-white ring-1 ring-stone-200 hover:ring-stone-400">
            {svg ? <div className="aspect-[4/3] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-[4/3] bg-stone-100" />}
            <div className="flex items-baseline justify-between p-3">
              <span className="font-medium group-hover:underline">{p.label}</span>
              {from !== null && <span className="text-sm text-stone-600">from {dollars(from)}</span>}
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="text-center text-2xl font-semibold">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-4">
          {[
            ['Design it', 'Type your text, pick a font, size and colour. The preview is the exact sign we’ll cut.'],
            ['Approve the proof', 'Check the spelling letter by letter and the finished size.'],
            ['Pay', 'Pay by Interac e-Transfer or cash. We start once payment arrives.'],
            ['Pick it up', `${settings.production.lead_time_days} days is our usual turnaround. ${settings.business.pickup_note}`],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
              <span className="text-sm font-semibold text-amber-700">{i + 1}</span>
              <h3 className="mt-1 font-medium">{t}</h3>
              <p className="mt-1 text-sm text-stone-600">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-14 border-t border-stone-200 pt-6 text-center text-sm text-stone-500">
        <Link href="/privacy" className="underline">Privacy</Link>
      </footer>
    </main>
  );
}
