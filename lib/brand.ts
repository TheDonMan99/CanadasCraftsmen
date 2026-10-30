// The business name shown to customers: the one in Settings → Business, or
// "Canada's Craftsmen" while that is still the "[Business name]" placeholder.
import type { Settings } from '@/lib/config/catalog';

export const BRAND_NAME = 'Canada’s Craftsmen';

export const businessName = (settings: Pick<Settings, 'business'>) => {
  const n = settings.business.name?.trim();
  return n && !n.startsWith('[') ? n : BRAND_NAME;
};
