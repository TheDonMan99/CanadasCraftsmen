// What the public is allowed to see of the catalog: enabled options only,
// without internal notes or costs.
import type { CatalogOption } from '@/lib/config/catalog';

const PRIVATE_VALUES = ['sheet_cost_cents', 'licence_file'];

export function publicCatalog(catalog: CatalogOption[]) {
  return catalog
    .filter((o) => o.enabled)
    .map(({ internal_notes: _n, ...o }) => {
      const values = { ...o.values };
      for (const k of PRIVATE_VALUES) delete values[k];
      return { ...o, values };
    });
}
