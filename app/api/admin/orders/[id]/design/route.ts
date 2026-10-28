import { withUser } from '@/lib/auth/session';
import { buildContext } from '@/lib/config/context';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getOwnerOrder, saveEditedDesign } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { runEngine } from '@/lib/engine';
import { checkOrderDesign, designLabels, engineDesign, quoteInput, type OrderDesign } from '@/lib/order/design';
import { quote } from '@/lib/pricing';
import { emailOrder, regenerateFiles } from '@/lib/server/admin-orders';
import { env } from '@/lib/server/env';
import { loadFontFile } from '@/lib/server/fonts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Saves an edited design, regenerates the files, and optionally emails an edited proof to approve. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withUser('edit_orders', async (user) => {
    const { id } = await params;
    const db = getDb();
    if (!db) return Response.json({ error: 'No database' }, { status: 503 });
    const body = (await req.json().catch(() => null)) as { design: OrderDesign; sendProof?: boolean; reprice?: boolean } | null;
    if (!body?.design) return Response.json({ error: 'Expected { design }' }, { status: 400 });
    const o = await getOwnerOrder(db, id);
    if (!o) return Response.json({ error: 'Order not found' }, { status: 404 });
    const [all, settings] = await Promise.all([loadCatalog(), loadSettings()]);
    // options this order already used stay allowed, even if switched off since
    const prev = o.design as OrderDesign;
    const keep = new Set([prev.productId, prev.styleId, prev.backerId, prev.sizeId, prev.materialId, prev.finishId, prev.topcoatId, prev.placementId, prev.deliveryId, ...prev.colourIds, ...prev.addonIds, ...prev.lines.map((l) => l.fontId)]);
    const catalog = all.map((x) => (keep.has(x.id) ? { ...x, enabled: true } : x));
    const d = body.design;
    const errors = checkOrderDesign(d, catalog);
    if (errors.length) return Response.json({ error: errors[0], errors }, { status: 422 });
    const ed = engineDesign(d, catalog, settings);
    const result = runEngine(ed, buildContext(catalog, settings, loadFontFile, d.materialId));
    if (!result.ok) return Response.json({ error: result.failures[0]?.message, errors: result.failures.map((f) => f.message) }, { status: 422 });
    const q = quote(quoteInput(d, result.widthIn), catalog, settings);
    if (!q.ok) return Response.json({ error: q.errors[0], errors: q.errors }, { status: 422 });
    const { proofToken } = await saveEditedDesign(
      db,
      id,
      {
        design: { ...d, engine: ed, labels: designLabels(d, catalog), heardFrom: o.design.heardFrom, earliestReady: o.design.earliestReady },
        widthIn: Math.round(result.widthIn * 1000) / 1000,
        heightIn: Math.round(result.heightIn * 1000) / 1000,
        engineReport: result.report,
        ...(body.reprice && { priceBreakdown: q, totalCents: q.totalCents, depositCents: q.amountDueCents }),
        requestProof: !!body.sendProof,
      },
      user.email,
    );
    await regenerateFiles(db, settings, catalog, id);
    if (proofToken) await emailOrder(db, settings, catalog, id, 'edited_proof', { proofLink: `${env.siteUrl()}/proof/${proofToken}` });
    return Response.json({ url: `/admin/orders/${id}` });
  });
}
