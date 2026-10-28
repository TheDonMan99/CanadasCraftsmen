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
import ApproveButton from './ApproveButton';

export const metadata: Metadata = { title: 'Approve your sign', robots: { index: false } };
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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm text-stone-500">Order {o.number}</p>
      <h1 className="text-2xl font-semibold">Please check your updated sign</h1>
      <div className="mt-4 rounded-lg bg-white p-3 ring-1 ring-stone-200 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="mt-4 text-sm">
        <h2 className="font-medium">Spelling, letter by letter</h2>
        {(l.lines ?? []).map((x: { text: string; font: string }, i: number) => (
          <p key={i} className="mt-1 flex flex-wrap gap-1">
            {[...x.text].map((c, j) => (
              <span key={j} className="inline-flex h-7 min-w-6 items-center justify-center rounded border border-stone-300 bg-white px-1 font-mono">{c === ' ' ? '␣' : c}</span>
            ))}
            <span className="ml-2 text-stone-500">in {x.font}</span>
          </p>
        ))}
        <p className="mt-3 text-stone-600">{[l.product, l.size, l.style, l.material, [l.finish, ...(l.colours ?? [])].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
        <p className="mt-1 text-stone-600">Finished size: {result.widthIn.toFixed(2)} in × {result.heightIn.toFixed(2)} in</p>
      </div>
      <ApproveButton token={token} />
      <p className="mt-3 text-sm text-stone-500">Something not right? Reply to our email and we’ll fix it.</p>
    </main>
  );
}
