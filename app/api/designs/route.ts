import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { saveDesign } from '@/lib/db/orders';
import { normalizeDesign, type OrderDesign } from '@/lib/order/design';
import { clientIp, deviceId } from '@/lib/server/request';
import { recordSubmission } from '@/lib/db/orders';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Saves a design for a share link. Only catalog ids and text are kept. */
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return Response.json({ error: 'Share links need the database.' }, { status: 503 });
  const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
  if (!settings.production.share_links_enabled) return Response.json({ error: 'Share links are off.' }, { status: 403 });
  let d: OrderDesign;
  try {
    d = (await req.json())?.design;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!d || typeof d.productId !== 'string' || !Array.isArray(d.lines) || d.lines.length > 5) return Response.json({ error: 'Expected { design }' }, { status: 400 });
  // a generous limit, so share links can't be used to fill the database
  const key = 'share:' + createHash('sha256').update(`${clientIp(req) ?? ''}|${deviceId(req).id}`).digest('hex');
  if ((await recordSubmission(db, key)) > 30) return Response.json({ error: 'Too many share links in the last hour.' }, { status: 429 });
  const clean = normalizeDesign(
    {
      productId: d.productId,
      lines: d.lines.map((l) => ({ role: l.role, text: String(l.text ?? '').slice(0, 40), fontId: String(l.fontId ?? '') })),
      sizeId: String(d.sizeId ?? ''),
      customWidthIn: typeof d.customWidthIn === 'number' ? d.customWidthIn : undefined,
      styleId: String(d.styleId ?? ''),
      backerId: d.backerId ? String(d.backerId) : null,
      materialId: String(d.materialId ?? ''),
      finishId: String(d.finishId ?? ''),
      colourIds: Array.isArray(d.colourIds) ? d.colourIds.map(String) : [],
      topcoatId: d.topcoatId ? String(d.topcoatId) : null,
      placementId: String(d.placementId ?? ''),
      addonIds: Array.isArray(d.addonIds) ? d.addonIds.map(String) : [],
      deliveryId: String(d.deliveryId ?? ''),
    },
    catalog,
  );
  const shareId = await saveDesign(db, clean);
  return Response.json({ shareId, url: `/design/${shareId}` }, { status: 201 });
}
