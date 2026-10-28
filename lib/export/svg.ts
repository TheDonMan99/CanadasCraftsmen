// LightBurn SVG export and the customer-facing preview.
//
// LightBurn files: width/height in inches with a viewBox in inches (1 unit =
// 1 in), so imports land at true size. Each kind of line is its own stroke
// colour, which LightBurn maps to a layer. Cut and score lines are strokes with
// no fill; engrave areas are filled shapes.

import type { EngineResult, Part, Pt, Shape } from '@/lib/engine/types';
import { bounds, boundsH, boundsW, translate } from '@/lib/engine/geom';

export interface ExportLayer {
  colour: string;
  lightburn_layer: string;
  output: boolean;
}

export interface ExportSettings {
  layers: { cut: ExportLayer; score: ExportLayer; engrave: ExportLayer; labels: ExportLayer };
  stroke_width_in: number;
  decimals: number;
  include_labels: boolean;
}

export interface CutFileOptions {
  export: ExportSettings;
  materialName: string;
  label: string;
  /** Widest row when parts are laid out side by side (the usable panel width). */
  maxRowWidthIn: number;
  spacingIn: number;
  marginIn: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function pathData(shape: Shape, decimals: number): string {
  const f = (n: number) => {
    const v = n.toFixed(decimals);
    return v === '-0' || /^-0\.0+$/.test(v) ? v.slice(1) : v;
  };
  return shape
    .filter((p) => p.length >= 3)
    .map((p) => `M${p.map((q) => `${f(q.x)} ${f(q.y)}`).join('L')}Z`)
    .join('');
}

function lineData(lines: Pt[][], decimals: number): string {
  return lines.filter((l) => l.length >= 2).map((l) => `M${l.map((q) => `${q.x.toFixed(decimals)} ${q.y.toFixed(decimals)}`).join('L')}`).join('');
}

export interface Placement {
  part: Part;
  dx: number;
  dy: number;
}

/**
 * Lay a sign's parts out flat for cutting: shelf rows, tallest first, with
 * spacing between parts. Parts that are already apart (one-piece words) keep
 * their place.
 */
export function arrangeParts(parts: Part[], maxRowWidthIn: number, spacingIn: number): Placement[] {
  if (parts.length === 1) return [{ part: parts[0], dx: -parts[0].bounds.minX, dy: -parts[0].bounds.minY }];
  const sorted = [...parts].sort((a, b) => boundsH(b.bounds) - boundsH(a.bounds) || boundsW(b.bounds) - boundsW(a.bounds));
  const out: Placement[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const p of sorted) {
    const w = boundsW(p.bounds), h = boundsH(p.bounds);
    if (x > 0 && x + w > maxRowWidthIn) {
      x = 0;
      y += rowH + spacingIn;
      rowH = 0;
    }
    out.push({ part: p, dx: x - p.bounds.minX, dy: y - p.bounds.minY });
    x += w + spacingIn;
    rowH = Math.max(rowH, h);
  }
  return out;
}

function svgOpen(w: number, h: number, title: string): string {
  const W = w.toFixed(4), H = h.toFixed(4);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}in" height="${H}in" viewBox="0 0 ${W} ${H}">\n<title>${esc(title)}</title>\n`;
}

/** One file per sign: every part laid out flat, ready to import, frame and cut. */
export function cutFileSvg(result: EngineResult, opt: CutFileOptions): string {
  const ex = opt.export;
  const d = ex.decimals;
  const placements = arrangeParts(result.parts, opt.maxRowWidthIn, opt.spacingIn);
  // score and engrave geometry travels with the backer or panel it sits on
  const host = placements.find((p) => p.part.role === 'backer' || p.part.role === 'panel') ?? placements[0];
  const m = opt.marginIn;
  const cut: string[] = [], labels: string[] = [];
  let maxX = 0, maxY = 0;
  for (const pl of placements) {
    const c = translate(pl.part.cut, pl.dx + m, pl.dy + m);
    const b = bounds(c);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
    cut.push(pathData(c, d));
    if (opt.export.include_labels)
      labels.push(`<text x="${(b.minX + 0.1).toFixed(3)}" y="${(b.minY + 0.35).toFixed(3)}" font-size="0.25" font-family="Arial">${esc(`${opt.label} · ${pl.part.name}`)}</text>`);
  }
  const hx = host ? host.dx + m : m, hy = host ? host.dy + m : m;
  const score = pathData(translate(result.score, hx, hy), d) + lineData(result.scoreLines.map((l) => l.map((q) => ({ x: q.x + hx, y: q.y + hy }))), d);
  const engrave = pathData(translate(result.engrave, hx, hy), d);
  const W = maxX + m, H = maxY + m + (opt.export.include_labels ? 0.5 : 0);
  if (opt.export.include_labels)
    labels.push(`<text x="${m.toFixed(3)}" y="${(H - 0.15).toFixed(3)}" font-size="0.25" font-family="Arial">${esc(`${opt.label} · ${opt.materialName}`)}</text>`);
  const sw = ex.stroke_width_in;
  const L = ex.layers;
  let out = svgOpen(W, H, opt.label);
  out += `<g id="cut" data-lightburn-layer="${L.cut.lightburn_layer}" fill="none" stroke="${L.cut.colour}" stroke-width="${sw}"><path d="${cut.join('')}"/></g>\n`;
  if (score) out += `<g id="score" data-lightburn-layer="${L.score.lightburn_layer}" fill="none" stroke="${L.score.colour}" stroke-width="${sw}"><path d="${score}"/></g>\n`;
  if (engrave) out += `<g id="engrave" data-lightburn-layer="${L.engrave.lightburn_layer}" fill="${L.engrave.colour}" stroke="none"><path d="${engrave}" fill-rule="nonzero"/></g>\n`;
  if (labels.length) out += `<g id="labels" data-lightburn-layer="${L.labels.lightburn_layer}" fill="${L.labels.colour}" stroke="none">${labels.join('')}</g>\n`;
  return out + '</svg>\n';
}

/** The 10 in calibration square on the cut layer. Must import at exactly 10.000 in. */
export function calibrationSvg(ex: ExportSettings, sizeIn = 10, marginIn = 0.25): string {
  const a = marginIn, b = marginIn + sizeIn;
  const W = sizeIn + 2 * marginIn;
  let out = svgOpen(W, W + 0.5, `Calibration square ${sizeIn} in`);
  out += `<g id="cut" fill="none" stroke="${ex.layers.cut.colour}" stroke-width="${ex.stroke_width_in}"><path d="M${a} ${a}L${b} ${a}L${b} ${b}L${a} ${b}Z"/></g>\n`;
  out += `<g id="labels" fill="${ex.layers.labels.colour}" stroke="none"><text x="${a}" y="${(b + 0.4).toFixed(3)}" font-size="0.25" font-family="Arial">Calibration: this square must measure ${sizeIn.toFixed(3)} in x ${sizeIn.toFixed(3)} in in LightBurn</text></g>\n`;
  return out + '</svg>\n';
}

export interface PreviewOptions {
  colours: Partial<Record<Part['colourPiece'], string>>;
  background: 'plain' | 'wall';
  showDimensions: boolean;
  showThin: boolean;
  /** Draw kerf-offset toolpaths instead of design shapes. */
  showCutPaths?: boolean;
}

const DEFAULT_WOOD = '#E3C9A0';

/** Assembled preview in the chosen colours, with a width x height label. */
export function previewSvg(result: EngineResult, opt: PreviewOptions): string {
  const pad = Math.max(1, result.widthIn * 0.06);
  const dimH = opt.showDimensions ? Math.max(0.8, result.widthIn * 0.04) : 0;
  const W = result.widthIn + 2 * pad, H = result.heightIn + 2 * pad + dimH;
  const d = 3;
  const bg = opt.background === 'wall' ? '#D8D2C8' : '#FFFFFF';
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(3)} ${H.toFixed(3)}" width="${(W * 20).toFixed(0)}" height="${(H * 20).toFixed(0)}">`;
  out += `<rect width="100%" height="100%" fill="${bg}"/>`;
  if (opt.background === 'wall') {
    for (let y = 0; y < H; y += 6) out += `<rect x="0" y="${y.toFixed(2)}" width="${W.toFixed(2)}" height="0.06" fill="#C9C2B6"/>`;
  }
  out += `<g transform="translate(${pad.toFixed(3)} ${pad.toFixed(3)})">`;
  // paint order: backers and outline layers first, words and letters on top
  const order: Part['role'][] = ['backer', 'panel', 'outline', 'word', 'letters', 'bit'];
  const parts = [...result.parts].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const shadow = Math.max(0.05, result.widthIn * 0.004);
  for (const p of parts) {
    const fill = opt.colours[p.colourPiece] ?? DEFAULT_WOOD;
    const data = pathData(opt.showCutPaths ? p.cut : p.shape, d);
    out += `<path d="${data}" fill="rgba(0,0,0,0.18)" transform="translate(${shadow} ${shadow})"/>`;
    out += `<path d="${data}" fill="${fill}" fill-rule="nonzero" stroke="rgba(0,0,0,0.25)" stroke-width="${(shadow / 3).toFixed(3)}"/>`;
  }
  if (result.engrave.length) out += `<path d="${pathData(result.engrave, d)}" fill="rgba(40,25,10,0.75)"/>`;
  if (result.scoreLines.length) out += `<path d="${lineData(result.scoreLines, d)}" fill="none" stroke="rgba(60,40,20,0.35)" stroke-width="${(shadow / 2).toFixed(3)}"/>`;
  if (opt.showThin && result.thinRegions.length) out += `<path d="${pathData(result.thinRegions, d)}" fill="rgba(220,0,0,0.75)"/>`;
  if (opt.showThin) for (const s of result.failures.flatMap((f) => (f.code === 'thin_section' ? ((f.detail?.spots as any[]) ?? []) : [])))
    out += `<circle cx="${s.x.toFixed(3)}" cy="${s.y.toFixed(3)}" r="${Math.max(0.3, result.widthIn * 0.012).toFixed(3)}" fill="none" stroke="#DC0000" stroke-width="${(shadow).toFixed(3)}"/>`;
  out += '</g>';
  if (opt.showDimensions) {
    const fs = dimH * 0.55;
    out += `<text x="${(W / 2).toFixed(3)}" y="${(H - dimH * 0.35).toFixed(3)}" font-size="${fs.toFixed(3)}" text-anchor="middle" font-family="Arial, sans-serif" fill="#444">${result.widthIn.toFixed(2)} in × ${result.heightIn.toFixed(2)} in</text>`;
  }
  return out + '</svg>';
}
