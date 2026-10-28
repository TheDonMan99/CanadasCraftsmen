import { designerData } from '@/app/design/load';
import { requirePage } from '@/lib/auth/session';
import { defaultDesign } from '@/lib/order/design';
import QuoteClient from './QuoteClient';

export const dynamic = 'force-dynamic';

export default async function QuotePage() {
  await requirePage('edit_orders', '/admin/quote');
  const data = await designerData();
  return <QuoteClient catalog={data.catalog} settings={data.settings} initial={defaultDesign(data.catalog, data.settings)} />;
}
