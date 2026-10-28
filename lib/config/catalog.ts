// Catalog and settings access. In phase 1 these come straight from the seed
// files; from phase 2 the same shapes are read from the database.

import catalogSeed from '@/config/catalog.seed.json';
import settingsSeed from '@/config/settings.seed.json';
import type { EngineSettings, FontSpec, LineRole, MaterialSpec, SizeRules, WeldMode } from '@/lib/engine/types';

export type PriceType = 'none' | 'flat' | 'percent' | 'per_inch';

export interface CatalogOption {
  id: string;
  category: string;
  label: string;
  description: string;
  enabled: boolean;
  stock_status: 'in_stock' | 'out_of_stock';
  sort_order: number;
  price_type: PriceType;
  /** Cents for flat and per-inch prices, whole percent for percent prices. */
  price_value: number;
  applies_to: string[] | null;
  values: Record<string, any>;
  internal_notes: string;
}

export type Settings = typeof settingsSeed;

export const seedCatalog = (): CatalogOption[] => structuredClone(catalogSeed.options) as CatalogOption[];
export const seedSettings = (): Settings => structuredClone(settingsSeed);

export const byCategory = (catalog: CatalogOption[], category: string, enabledOnly = true) =>
  catalog.filter((o) => o.category === category && (!enabledOnly || o.enabled)).sort((a, b) => a.sort_order - b.sort_order);

export function fontSpec(o: CatalogOption): FontSpec {
  return {
    id: o.id,
    label: o.label,
    allowedLines: o.values.allowed_lines as LineRole[],
    autoThickenIn: o.values.auto_thicken_in ?? 0,
    weldMode: (o.values.weld_mode ?? 'block') as WeldMode,
  };
}

export function materialSpec(o: CatalogOption): MaterialSpec {
  return {
    id: o.id,
    label: o.label,
    thicknessIn: o.values.thickness_in,
    kerfIn: o.values.kerf_in,
    minFeatureIn: o.values.min_feature_in,
    passes: o.values.passes ?? 1,
    cutSpeedInMin: o.values.cut_speed_in_min ?? null,
    lightburnName: o.values.lightburn_name ?? o.label,
    fileTag: o.values.file_tag ?? o.id,
  };
}

export const engineSettings = (s: Settings): EngineSettings => s.engine as EngineSettings;
export const sizeRules = (s: Settings): SizeRules => s.sizes as SizeRules;

/** Largest sign: the panel minus its edge margins, rounded down to a whole inch. */
export function largestSign(s: Settings): number {
  const m = s.machine;
  const fit = Math.min(m.panel_w_in, m.panel_h_in, m.cut_area_w_in, m.cut_area_h_in) - 2 * m.panel_edge_margin_in;
  return Math.min(m.largest_sign_in, Math.floor(fit));
}
