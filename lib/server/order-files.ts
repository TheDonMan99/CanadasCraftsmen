// An order's files: the LightBurn SVG, the preview PNG and (when on) the DXF of
// the cut layer. Built when an order is placed and again when you regenerate.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { Db } from '@/lib/db/client';
import { addOrderFile } from '@/lib/db/orders';
import type { EngineResult, MaterialSpec } from '@/lib/engine';
import { cutFileSvg, cutLayerDxf, orderFileName, previewSvg, type ExportSettings } from '@/lib/export';
import { svgToPng } from '@/lib/export/png';
import { previewColours, type OrderDesign } from '@/lib/order/design';
import type { Upload } from './storage';

export type FileKind = 'svg' | 'png' | 'dxf';
export interface OrderFile {
  kind: FileKind;
  name: string;
  body: Buffer | string;
  type: string;
}

export const FILE_TYPES: Record<FileKind, string> = { svg: 'image/svg+xml', png: 'image/png', dxf: 'application/dxf' };

export function buildOrderFiles(
  result: EngineResult,
  o: { number: string; lastName: string; sizeIn: number; design: OrderDesign; material: MaterialSpec },
  catalog: CatalogOption[],
  settings: Settings,
  kinds: FileKind[] = ['svg', 'png', 'dxf'],
): OrderFile[] {
  const name = (ext: string) => orderFileName(o.number, o.lastName, o.sizeIn, o.material.fileTag, ext);
  const m = settings.machine;
  const out: OrderFile[] = [];
  if (kinds.includes('svg'))
    out.push({
      kind: 'svg',
      name: name('svg'),
      type: FILE_TYPES.svg,
      body: cutFileSvg(result, {
        export: settings.export as ExportSettings,
        materialName: o.material.lightburnName,
        label: `${o.number} ${o.lastName}`,
        maxRowWidthIn: m.panel_w_in - 2 * m.panel_edge_margin_in,
        spacingIn: settings.nesting.part_spacing_in,
        marginIn: 0.25,
      }),
    });
  if (kinds.includes('png'))
    out.push({
      kind: 'png',
      name: name('png'),
      type: FILE_TYPES.png,
      body: svgToPng(previewSvg(result, { colours: previewColours(o.design, catalog), background: 'plain', showDimensions: true, showThin: false }), 1200),
    });
  if (kinds.includes('dxf') && settings.export.dxf_enabled)
    out.push({ kind: 'dxf', name: name('dxf'), type: FILE_TYPES.dxf, body: cutLayerDxf(result.parts.flatMap((p) => p.cut)) });
  return out;
}

/** Uploads files as a new version; returns the kinds that couldn't be stored. */
export async function storeOrderFiles(db: Db, upload: Upload, orderId: string, number: string, version: number, files: OrderFile[]): Promise<string[]> {
  const failed: string[] = [];
  for (const f of files) {
    const path = `orders/${number}/v${version}/${f.name}`;
    const up = await upload(path, f.body, f.type);
    if (up.ok) await addOrderFile(db, orderId, f.kind, path);
    else {
      failed.push(`${f.kind}: ${up.error}`);
      console.warn(`[orders] ${number}: ${f.kind} not stored: ${up.error}`);
    }
  }
  return failed;
}

export const lastNameOf = (name: string) => name.trim().split(/\s+/).at(-1) || 'Customer';
