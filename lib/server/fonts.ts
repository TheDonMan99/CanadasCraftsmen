// Server-side font loading from public/fonts, cached per process.

import fs from 'node:fs';
import path from 'node:path';
import { byCategory, fontSpec, type CatalogOption } from '@/lib/config/catalog';
import { loadFont, type LoadedFont } from '@/lib/engine/font';
import type { EngineContext } from '@/lib/engine/types';

const cache = new Map<string, LoadedFont>();
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

export function loadFontFile(file: string): LoadedFont {
  const hit = cache.get(file);
  if (hit) return hit;
  const buf = fs.readFileSync(path.join(FONT_DIR, path.basename(file)));
  const font = loadFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  cache.set(file, font);
  return font;
}

/** Every font in the catalog (enabled or not), ready for the engine. */
export function engineFonts(catalog: CatalogOption[], enabledOnly = false): EngineContext['fonts'] {
  const out: EngineContext['fonts'] = {};
  for (const o of byCategory(catalog, 'font', enabledOnly)) out[o.id] = { spec: fontSpec(o), font: loadFontFile(o.values.font_file) };
  return out;
}
