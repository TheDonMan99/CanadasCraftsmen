import Designer from '@/app/design/Designer';
import { designerData } from '@/app/design/load';
import { requirePage } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { getSavedDesign } from '@/lib/db/orders';
import { defaultDesign, normalizeDesign, type OrderDesign } from '@/lib/order/design';

export const dynamic = 'force-dynamic';

/** You entering an order (from Messenger, a market booth…) through the same designer. */
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ share?: string }> }) {
  await requirePage('edit_orders', '/admin/orders/new');
  const [data, q] = await Promise.all([designerData(), searchParams]);
  const db = getDb();
  const saved = q.share && db ? ((await getSavedDesign(db, q.share)) as OrderDesign | null) : null;
  const initial = saved && data.catalog.some((o) => o.id === saved.productId)
    ? normalizeDesign({ ...defaultDesign(data.catalog, data.settings, saved.productId), ...saved }, data.catalog)
    : defaultDesign(data.catalog, data.settings);
  return (
    <Designer
      mode="admin-new"
      catalog={data.catalog}
      settings={data.settings}
      initial={initial}
      startStep={saved ? 7 : 0}
      earliest={data.earliest}
      turnstileSiteKey={null}
      refundPolicy={data.refundPolicy}
    />
  );
}
