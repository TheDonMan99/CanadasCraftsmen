// What the public is allowed to see of the catalog: enabled options only,
// without internal notes or costs.
import type { CatalogOption, Settings } from '@/lib/config/catalog';

const PRIVATE_VALUES = ['sheet_cost_cents', 'licence_file'];

export function publicCatalog(catalog: CatalogOption[]): CatalogOption[] {
  return catalog
    .filter((o) => o.enabled)
    .map(({ internal_notes: _n, ...o }) => {
      const values = { ...o.values };
      for (const k of PRIVATE_VALUES) delete values[k];
      return { ...o, values, internal_notes: '' };
    });
}

/** The settings the order form needs: no email setup, costs or nesting. */
export function publicSettings(settings: Settings): Settings {
  const { emails: _e, nesting: _n, export: _x, ...rest } = settings;
  return { ...rest, pricing: { ...rest.pricing, hourly_rate_cents: null } } as Settings;
}
