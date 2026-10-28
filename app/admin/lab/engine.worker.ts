// Runs the engine off the main thread so the lab stays responsive while
// long names are welded and checked.

import { buildContext, type ContextOverrides } from '@/lib/config/context';
import { byCategory, type CatalogOption, type Settings } from '@/lib/config/catalog';
import { loadFont, runEngine, type Design, type LoadedFont } from '@/lib/engine';

const fonts = new Map<string, LoadedFont>();

async function ensureFonts(catalog: CatalogOption[]) {
  const files = byCategory(catalog, 'font', false).map((o) => o.values.font_file as string);
  await Promise.all(
    files.filter((f) => !fonts.has(f)).map(async (f) => {
      const buf = await (await fetch(`/fonts/${f}`)).arrayBuffer();
      fonts.set(f, loadFont(buf));
    }),
  );
}

type Msg = { id: number; design: Design; materialId: string; overrides: ContextOverrides; catalog: CatalogOption[]; settings: Settings };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const { id, design, materialId, overrides, catalog, settings } = e.data;
  try {
    await ensureFonts(catalog);
    const ctx = buildContext(catalog, settings, (f) => fonts.get(f)!, materialId, overrides);
    const t = performance.now();
    const result = runEngine(design, ctx);
    (self as unknown as Worker).postMessage({ id, result, ms: Math.round(performance.now() - t) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
