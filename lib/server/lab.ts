// Server side of the lab: rerun the engine on the server and build files, so
// downloads come from the same path as real order files.

import { buildContext, type ContextOverrides } from '@/lib/config/context';
import { loadCatalog, loadSettings } from '@/lib/data';
import { runEngine, type Design, type EngineResult } from '@/lib/engine';
import { cutFileSvg, cutLayerDxf, orderFileName, previewSvg, type ExportSettings } from '@/lib/export';
import { svgToPng } from '@/lib/export/png';
import { loadFontFile } from './fonts';

export interface LabRequest {
  design: Design;
  materialId: string;
  overrides?: ContextOverrides;
  colours?: Record<string, string>;
  format: 'svg' | 'png' | 'dxf' | 'json';
}

export async function labFile(req: LabRequest): Promise<{ body: string | Buffer; type: string; name: string; result: EngineResult }> {
  const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
  const ctx = buildContext(catalog, settings, loadFontFile, req.materialId, req.overrides);
  const result = runEngine(req.design, ctx);
  const ex = settings.export as ExportSettings;
  const mainText = req.design.lines.find((l) => l.role === 'main')?.text ?? req.design.lines[0]?.text ?? 'Sign';
  const size = req.design.layout === 'vertical' ? req.design.heightIn ?? 0 : req.design.widthIn ?? 0;
  const name = (ext: string) => orderFileName('LAB', mainText, size, ctx.material.fileTag, ext);
  const m = settings.machine;
  switch (req.format) {
    case 'svg':
      return {
        body: cutFileSvg(result, { export: ex, materialName: ctx.material.lightburnName, label: `LAB ${mainText}`, maxRowWidthIn: m.panel_w_in - 2 * m.panel_edge_margin_in, spacingIn: settings.nesting.part_spacing_in, marginIn: 0.25 }),
        type: 'image/svg+xml',
        name: name('svg'),
        result,
      };
    case 'dxf':
      return { body: cutLayerDxf(result.parts.flatMap((p) => p.cut)), type: 'application/dxf', name: name('dxf'), result };
    case 'png': {
      const colours = req.colours ?? {};
      return { body: svgToPng(previewSvg(result, { colours, background: 'plain', showDimensions: true, showThin: true }), 1600), type: 'image/png', name: name('png'), result };
    }
    default:
      return { body: JSON.stringify({ ok: result.ok, failures: result.failures, warnings: result.warnings, report: result.report }), type: 'application/json', name: name('json'), result };
  }
}
