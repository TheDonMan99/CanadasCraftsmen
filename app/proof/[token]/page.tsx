import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildContext } from '@/lib/config/context';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getOrderByProofToken } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { runEngine } from '@/lib/engine';
import { previewSvg } from '@/lib/export/svg';
import { previewColours } from '@/lib/order/design';
import { loadFontFile } from '@/lib/server/fonts';
import SiteFooter from '@/app/components/SiteFooter';
import SiteHeader from '@/app/components/SiteHeader';
import ApproveButton from './ApproveButton';

export const metadata: Metadata = { title: 'Check your updated sign', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** The customer's link to approve an edited proof. */
export default async function ProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const o = db ? await getOrderByProofToken(db, token) : null;
  if (!o) notFound();
  const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
  const result = runEngine(o.design.engine, buildContext(catalog, settings, loadFontFile, o.design.materialId));
  const svg = previewSvg(result, { colours: previewColours(o.design, catalog), background: 'plain', showDimensions: true, showThin: false });
  const l = o.design.labels ?? {};
  return (
    <>
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-2xl px-4 py-16 md:px-12">
        <p className="cc-small text-kerf">Order {o.number}</p>
        <h1 className="cc-display-l mt-2">Check your updated sign</h1>
        <div className="cc-panel cc-panel--hung mt-8 p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="cc-body mt-8">
          <h2 className="cc-title">Spelling, letter by letter</h2>
          {(l.lines ?? []).map((x: { text: string; font: string }, i: number) => (
            <p key={i} className="mt-2 flex flex-wrap items-center gap-1">
              {[...x.text].map((c, j) => (
                <span key={j} className="inline-flex h-8 min-w-7 items-center justify-center rounded-sm border border-line-strong bg-white px-1 font-mono">{c === ' ' ? '␣' : c}</span>
              ))}
              <span className="cc-small ml-2 text-kerf">in {x.font}</span>
            </p>
          ))}
          <p className="mt-4 text-kerf">{[l.product, l.size, l.style, l.material, [l.finish, ...(l.colours ?? [])].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 text-kerf">Finished size: {result.widthIn.toFixed(2)} in × {result.heightIn.toFixed(2)} in</p>
        </div>
        <ApproveButton token={token} />
        <p className="cc-small mt-4 text-kerf">Something not right? Reply to our email and we’ll fix it.</p>
      </main>
      <SiteFooter />
    </>
  );
}
