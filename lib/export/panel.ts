// One LightBurn file per nested panel: the panel at true size, each part turned
// and moved to its place, with the panel outline and every part's order number on
// the labels layer (which you set to not output in LightBurn).

import { bounds } from '@/lib/engine/geom';
import type { Bounds, EngineResult, Part, Pt, Shape } from '@/lib/engine/types';
import type { Placed } from '@/lib/nesting/pack';
import { pathData, type ExportSettings } from './svg';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PanelItem {
  placed: Placed;
  part: Part;
  /** the sign this part came from, for its score and engrave lines when it's the backer or panel */
  result: EngineResult;
}

/**
 * Maps a point of a part (in sign coordinates) to the panel: turned clockwise by
 * the placement's rotation, with the turned outline's top-left corner at (x, y).
 */
export function placeTransform(b: Bounds, p: Pick<Placed, 'x' | 'y' | 'rotation'>): (q: Pt) => Pt {
  switch (p.rotation) {
    case 90:
      return (q) => ({ x: b.maxY - q.y + p.x, y: q.x - b.minX + p.y });
    case 180:
      return (q) => ({ x: b.maxX - q.x + p.x, y: b.maxY - q.y + p.y });
    case 270:
      return (q) => ({ x: q.y - b.minY + p.x, y: b.maxX - q.x + p.y });
    default:
      return (q) => ({ x: q.x - b.minX + p.x, y: q.y - b.minY + p.y });
  }
}

const mapShape = (s: Shape, f: (q: Pt) => Pt): Shape => s.map((ring) => ring.map(f));

export function panelSvg(bin: { w: number; h: number; label: string }, items: PanelItem[], opt: { export: ExportSettings; materialName: string; title: string }): string {
  const ex = opt.export;
  const d = ex.decimals;
  const cut: string[] = [], score: string[] = [], engrave: string[] = [], labels: string[] = [];
  const hosts = new Set<EngineResult>();
  for (const it of items) {
    const b = bounds(it.part.cut);
    const f = placeTransform(b, it.placed);
    cut.push(pathData(mapShape(it.part.cut, f), d));
    // score and engrave lines travel with the backer or panel they're on (or the only part)
    const isHost = it.part.role === 'backer' || it.part.role === 'panel' || it.result.parts.length === 1;
    if (isHost && !hosts.has(it.result)) {
      hosts.add(it.result);
      score.push(pathData(mapShape(it.result.score, f), d));
      for (const l of it.result.scoreLines) if (l.length >= 2) score.push(`M${l.map(f).map((q) => `${q.x.toFixed(d)} ${q.y.toFixed(d)}`).join('L')}`);
      engrave.push(pathData(mapShape(it.result.engrave, f), d));
    }
    if (ex.include_labels)
      labels.push(`<text x="${(it.placed.x + 0.1).toFixed(3)}" y="${(it.placed.y + 0.3).toFixed(3)}" font-size="0.25" font-family="Arial">${esc(`${it.placed.orderNumber} · ${it.placed.partName}`)}</text>`);
  }
  const L = ex.layers;
  const sw = ex.stroke_width_in;
  const W = bin.w.toFixed(4), H = bin.h.toFixed(4);
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}in" height="${H}in" viewBox="0 0 ${W} ${H}">\n<title>${esc(opt.title)}</title>\n`;
  out += `<g id="cut" data-lightburn-layer="${L.cut.lightburn_layer}" fill="none" stroke="${L.cut.colour}" stroke-width="${sw}"><path d="${cut.join('')}"/></g>\n`;
  const sc = score.join('');
  if (sc) out += `<g id="score" data-lightburn-layer="${L.score.lightburn_layer}" fill="none" stroke="${L.score.colour}" stroke-width="${sw}"><path d="${sc}"/></g>\n`;
  const en = engrave.join('');
  if (en) out += `<g id="engrave" data-lightburn-layer="${L.engrave.lightburn_layer}" fill="${L.engrave.colour}" stroke="none"><path d="${en}" fill-rule="nonzero"/></g>\n`;
  if (ex.include_labels) {
    // the panel outline, for lining the panel up on the bed
    labels.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${L.labels.colour}" stroke-width="${sw}"/>`);
    labels.push(`<text x="0.1" y="${(bin.h - 0.12).toFixed(3)}" font-size="0.25" font-family="Arial">${esc(`${opt.title} · ${opt.materialName}`)}</text>`);
    out += `<g id="labels" data-lightburn-layer="${L.labels.lightburn_layer}" fill="${L.labels.colour}" stroke="none">${labels.join('')}</g>\n`;
  }
  return out + '</svg>\n';
}
