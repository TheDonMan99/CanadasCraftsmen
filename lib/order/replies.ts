// Fills Messenger reply templates: {price_list}, {design_link}, {payment_email}, {pickup_note}.
import { byCategory, type CatalogOption, type Settings } from '@/lib/config/catalog';
import { dollars } from '@/lib/pricing';
import { businessName } from '@/lib/brand';

export function replyVars(catalog: CatalogOption[], settings: Settings, siteUrl: string): Record<string, string> {
  const widths = byCategory(catalog, 'size').filter((s) => s.values.kind === 'width');
  const heights = byCategory(catalog, 'size').filter((s) => s.values.kind === 'height');
  const list = [...widths.map((s) => `${s.values.width_in} in wide: ${dollars(s.price_value)}`), ...heights.map((s) => `Porch leaner ${s.values.height_in} in tall: ${dollars(s.price_value)}`)];
  return {
    price_list: list.join('\n'),
    design_link: `${siteUrl}/design`,
    payment_email: settings.payments.payment_email,
    pickup_note: settings.business.pickup_note,
    business_name: businessName(settings),
  };
}

export const fillReply = (body: string, vars: Record<string, string>) => body.replace(/\{([a-z_]+)\}/g, (m, k) => vars[k] ?? m);
