import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getSavedDesign } from '@/lib/db/orders';
import { defaultDesign, normalizeDesign, type OrderDesign } from '@/lib/order/design';
import Designer from '../Designer';
import { designerData } from '../load';
import Paused from '../Paused';

export const metadata: Metadata = { title: 'A sign design for you' };
export const dynamic = 'force-dynamic';

/** A design opened from a share link: it opens at the proof, ready to tweak or order. */
export default async function SharedDesignPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const db = getDb();
  if (!db || !/^[A-Za-z0-9]{6,20}$/.test(shareId)) notFound();
  const [data, saved] = await Promise.all([designerData(), getSavedDesign(db, shareId)]);
  if (!saved) notFound();
  if (data.fullSettings.production.paused) return <Paused message={data.fullSettings.production.pause_message} />;
  const d = saved as OrderDesign;
  // options switched off since it was saved are swapped for ones that are on
  const productOn = data.catalog.some((o) => o.id === d.productId);
  const design = productOn ? normalizeDesign({ ...defaultDesign(data.catalog, data.settings, d.productId), ...d }, data.catalog) : defaultDesign(data.catalog, data.settings);
  return (
    <Designer
      catalog={data.catalog}
      settings={data.settings}
      initial={design}
      startStep={7}
      earliest={data.earliest}
      turnstileSiteKey={data.turnstileSiteKey}
      refundPolicy={data.refundPolicy}
    />
  );
}
