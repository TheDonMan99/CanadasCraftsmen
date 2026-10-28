// Build an engine context from the catalog, settings and loaded fonts, with
// optional per-run overrides (used by the lab to try settings without saving).

import type { LoadedFont } from '@/lib/engine/font';
import type { EngineContext, EngineSettings, MaterialSpec } from '@/lib/engine/types';
import { byCategory, engineSettings, fontSpec, largestSign, materialSpec, sizeRules, type CatalogOption, type Settings } from './catalog';

export interface ContextOverrides {
  engine?: Partial<EngineSettings>;
  material?: Partial<MaterialSpec>;
}

export function buildContext(
  catalog: CatalogOption[],
  settings: Settings,
  loadFont: (file: string) => LoadedFont,
  materialId: string,
  overrides: ContextOverrides = {},
): EngineContext {
  const mat = catalog.find((o) => o.id === materialId && o.category === 'material') ?? byCategory(catalog, 'material')[0];
  const fonts: EngineContext['fonts'] = {};
  for (const o of byCategory(catalog, 'font', false)) fonts[o.id] = { spec: fontSpec(o), font: loadFont(o.values.font_file) };
  return {
    fonts,
    material: { ...materialSpec(mat), ...overrides.material },
    settings: { ...engineSettings(settings), ...overrides.engine },
    sizes: sizeRules(settings),
    largestSignIn: largestSign(settings),
  };
}
