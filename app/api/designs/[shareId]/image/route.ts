import { buildContext } from '@/lib/config/context';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { getSavedDesign } from '@/lib/db/orders';
import { runEngine } from '@/lib/engine';
import { previewSvg } from '@/lib/export/svg';
import { svgToPng } from '@/lib/export/png';
import { defaultDesign, engineDesign, normalizeDesign, previewColours, type OrderDesign } from '@/lib/order/design';
import { loadFontFile } from '@/lib/server/fonts';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** A saved design's preview image, for link previews when a design link is pasted into Messenger. */
export async function GET(_: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const db = getDb();
  const saved = db && /^[A-Za-z0-9]{6,20}$/.test(shareId) ? ((await getSavedDesign(db, shareId)) as OrderDesign | null) : null;
  if (!saved) return new Response('Not found', { status: 404 });
  const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
  const d = normalizeDesign({ ...defaultDesign(catalog, settings, saved.productId), ...saved }, catalog);
  const result = runEngine(engineDesign(d, catalog, settings), buildContext(catalog, settings, loadFontFile, d.materialId));
  if (!result.parts.length) return new Response('Not found', { status: 404 });
  const png = svgToPng(previewSvg(result, { colours: previewColours(d, catalog), background: 'wall', showDimensions: true, showThin: false }), 1200);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
}
