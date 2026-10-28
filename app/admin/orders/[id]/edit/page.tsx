import { notFound } from 'next/navigation';
import Designer from '@/app/design/Designer';
import { designerData } from '@/app/design/load';
import { requirePage } from '@/lib/auth/session';
import { getOwnerOrder } from '@/lib/db/admin';
import { loadCatalog } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { normalizeDesign, type OrderDesign } from '@/lib/order/design';
import { publicCatalog } from '@/lib/server/public-catalog';

export const dynamic = 'force-dynamic';

/** Fix a typo or change a font. Options switched off since the order was placed stay available for this order. */
export default async function EditDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePage('edit_orders', `/admin/orders/${id}/edit`);
  const db = getDb();
  const o = db ? await getOwnerOrder(db, id) : null;
  if (!o || o.status === 'cancelled') notFound();
  const data = await designerData();
  const saved = o.design as OrderDesign;
  const keep = new Set([saved.productId, saved.styleId, saved.backerId, saved.sizeId, saved.materialId, saved.finishId, saved.topcoatId, saved.placementId, saved.deliveryId, ...saved.colourIds, ...saved.addonIds, ...saved.lines.map((l) => l.fontId)]);
  // the live catalog, plus anything this order already uses even if it's been switched off
  const all = await loadCatalog();
  const catalog = publicCatalog(all.map((x) => (keep.has(x.id) ? { ...x, enabled: true } : x)));
  const { engine: _e, labels: _l, history: _h, heardFrom: _f, earliestReady: _r, ...plain } = o.design;
  return (
    <Designer
      mode="admin-edit"
      orderId={o.id}
      currentTotalCents={o.total}
      catalog={catalog}
      settings={data.settings}
      initial={normalizeDesign(plain as OrderDesign, catalog)}
      startStep={1}
      earliest={data.earliest}
      turnstileSiteKey={null}
      refundPolicy={data.refundPolicy}
    />
  );
}
