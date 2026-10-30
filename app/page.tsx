import Link from 'next/link';
import SiteFooter from '@/app/components/SiteFooter';
import SiteHeader from '@/app/components/SiteHeader';
import { byCategory, seedCatalog, seedSettings, type CatalogOption } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import { loadCatalog, loadSettings } from '@/lib/data';
import { runEngine } from '@/lib/engine';
import { previewSvg } from '@/lib/export/svg';
import { defaultDesign, designLabels, engineDesign, materialsFor, previewColours, quoteInput } from '@/lib/order/design';
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

/** "birch or maple", from the materials that are on */
function woods(catalog: CatalogOption[], placementId: string): string {
  const names = [...new Set(materialsFor(catalog, placementId).map((m) => m.label.split(/\s+/)[0].toLowerCase()))];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0] ?? '';
}

export default async function Home() {
  const { catalog, settings } = await load();
  const products = byCategory(catalog, 'product').map((p) => {
    const d = defaultDesign(catalog, settings, p.id);
    const labels = designLabels(d, catalog);
    const meta = p.description || [labels.size.replace(/ \(leaner\)/, ''), woods(catalog, d.placementId)].filter(Boolean).join(', ');
    try {
      const r = runEngine(engineDesign(d, catalog, settings), buildContext(catalog, settings, loadFontFile, d.materialId));
      const q = quote(quoteInput(d, r.widthIn), catalog, settings);
      // the sign as it will be cut, on its own white ground, inside the birch panel
      return { p, meta, svg: r.parts.length ? previewSvg(r, { colours: previewColours(d, catalog), background: 'plain', showDimensions: false, showThin: false }) : '', from: q.ok ? q.totalCents : null };
    } catch {
      return { p, meta, svg: '', from: null };
    }
  });
  const hero = products.find((x) => x.svg);
  const lead = settings.production.lead_time_days;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="cc-band">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:px-12 md:py-24">
            <div>
              <h1 className="cc-display-xl text-birch">Welcome signs and name signs, cut from real wood</h1>
              <p className="cc-body-l mt-8 max-w-[34rem]">
                Design your sign on your phone in a couple of minutes. You see exactly what gets cut and the price before you order. Pick it up in Sherwood Park, usually within {lead} days.
              </p>
              <Link href="/design" className="cc-btn cc-btn--birch mt-8">Design your sign</Link>
            </div>
            {hero && (
              <div className="cc-panel cc-panel--hung p-3">
                <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: hero.svg }} />
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-12 md:py-24" aria-labelledby="signs">
          <h2 id="signs" className="cc-display-l">Pick a sign</h2>
          <ul className="mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(({ p, svg, from, meta }) => (
              <li key={p.id}>
                <Link href={`/design?product=${encodeURIComponent(p.id)}`} className="cc-product">
                  <div className="cc-product__media cc-panel cc-panel--hung p-3">
                    {svg ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
                  </div>
                  <h3 className="cc-product__name">{p.label}</h3>
                  {from !== null && <p className="cc-product__price">From {dollars(from)}</p>}
                  {meta && <p className="cc-product__meta">{meta}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="cc-band" aria-labelledby="how">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-12 md:py-24">
            <h2 id="how" className="cc-display-l text-birch">How it works</h2>
            <ol className="cc-steps mt-8">
              <li>
                <h3>Design it</h3>
                <p>Type your words and pick the font, size and colour. The preview matches the cut.</p>
              </li>
              <li>
                <h3>Approve the proof</h3>
                <p>Check the spelling and the finished size before anything is cut.</p>
              </li>
              <li>
                <h3>Pay</h3>
                <p>e-Transfer or cash. We start cutting once payment arrives.</p>
              </li>
              <li>
                <h3>Pick it up</h3>
                <p>In Sherwood Park, usually within {lead} days.</p>
              </li>
            </ol>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
