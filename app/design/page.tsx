import type { Metadata } from 'next';
import { defaultDesign } from '@/lib/order/design';
import Designer from './Designer';
import { designerData } from './load';
import Paused from './Paused';

export const metadata: Metadata = { title: 'Design your sign' };
// always the live catalog: switching an option off hides it at once
export const dynamic = 'force-dynamic';

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const [data, q] = await Promise.all([designerData(), searchParams]);
  if (data.fullSettings.production.paused) return <Paused message={data.fullSettings.production.pause_message} />;
  const product = data.catalog.some((o) => o.id === q.product && o.category === 'product') ? q.product : undefined;
  return (
    <Designer
      catalog={data.catalog}
      settings={data.settings}
      initial={defaultDesign(data.catalog, data.settings, product)}
      startStep={product ? 1 : 0}
      earliest={data.earliest}
      turnstileSiteKey={data.turnstileSiteKey}
      refundPolicy={data.refundPolicy}
    />
  );
}
