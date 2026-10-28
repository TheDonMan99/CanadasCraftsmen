// True-shape nesting: parts are placed by their real outlines, so a small sign can
// sit in the empty space under an arch or between letters. Each bin is a grid of
// 1/8 in cells. Each part's cut outline is grown by half the part spacing plus
// enough to cover any cell it touches, then drawn onto the grid. Parts whose cells
// don't overlap are therefore at least the spacing apart.
// Same bins, order grouping and result as the rectangle packer.

import { area, bounds, intersect, offset } from '@/lib/engine/geom';
import type { Pt, Shape } from '@/lib/engine/types';
import type { BinLayout, BinSpec, NestPart, NestResult, NestSettings, Placed, Rotation } from './pack';

export const CELL_IN = 0.125;

class Grid {
  words: number;
  data: Uint32Array;
  constructor(public cols: number, public rows: number) {
    this.words = Math.ceil(cols / 32) + 1;
    this.data = new Uint32Array(this.words * rows);
  }
  clone() {
    const g = new Grid(this.cols, this.rows);
    g.data.set(this.data);
    return g;
  }
  set(c: number, r: number) {
    this.data[r * this.words + (c >> 5)] |= 1 << (c & 31);
  }
  /** 32 cells of row r starting at column c */
  read(c: number, r: number): number {
    const i = r * this.words + (c >> 5), sh = c & 31;
    return sh ? ((this.data[i] >>> sh) | (this.data[i + 1] << (32 - sh))) >>> 0 : this.data[i];
  }
  fits(p: Raster, gc: number, gr: number): boolean {
    for (let r = 0; r < p.rows; r++) {
      const base = r * p.words;
      for (let k = 0; k < p.words; k++) {
        const w = p.data[base + k];
        if (w && this.read(gc + k * 32, gr + r) & w) return false;
      }
    }
    return true;
  }
  stamp(p: Raster, gc: number, gr: number) {
    for (let r = 0; r < p.rows; r++)
      for (let c = 0; c < p.cols; c++) if (p.data[r * p.words + (c >> 5)] & (1 << (c & 31))) this.set(gc + c, gr + r);
  }
}

interface Raster {
  cols: number;
  rows: number;
  words: number;
  data: Uint32Array;
  rotation: Rotation;
  /** true outline size after turning */
  w: number;
  h: number;
  /** distance from the raster's corner to the true outline's corner */
  pad: number;
}

/** Turns a shape clockwise by a quarter-turn multiple, with its top-left corner at the origin (same convention as the panel export). */
export function turn(shape: Shape, rotation: Rotation): Shape {
  const b = bounds(shape);
  const f = (q: Pt): Pt =>
    rotation === 90 ? { x: b.maxY - q.y, y: q.x - b.minX } : rotation === 180 ? { x: b.maxX - q.x, y: b.maxY - q.y } : rotation === 270 ? { x: q.y - b.minY, y: b.maxX - q.x } : { x: q.x - b.minX, y: q.y - b.minY };
  return shape.map((ring) => ring.map(f));
}

/** Cells whose centres are inside the shape (even-odd), by scanlines through the cell centres. */
function rasterize(shape: Shape, pad: number, cols: number, rows: number): Uint32Array {
  const words = Math.ceil(cols / 32);
  const data = new Uint32Array(words * rows);
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * CELL_IN - pad;
    const xs: number[] = [];
    for (const ring of shape)
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const c0 = Math.max(0, Math.ceil((xs[i] + pad) / CELL_IN - 0.5));
      const c1 = Math.min(cols - 1, Math.floor((xs[i + 1] + pad) / CELL_IN - 0.5));
      for (let c = c0; c <= c1; c++) data[r * words + (c >> 5)] |= 1 << (c & 31);
    }
  }
  return data;
}

function rasters(part: NestPart, s: NestSettings): Raster[] {
  // grown by half the spacing, plus the half-diagonal of a cell so every cell the outline touches is marked
  const pad = s.spacingIn / 2 + CELL_IN * 0.75;
  const turns: Rotation[] = s.allowRotate ? [0, 90, 180, 270] : [0, 180];
  return turns.map((rotation) => {
    const turned = turn(part.shape!, rotation);
    const b = bounds(turned);
    const grown = offset(turned, pad, 'round');
    const cols = Math.ceil((b.maxX + 2 * pad) / CELL_IN) + 1, rows = Math.ceil((b.maxY + 2 * pad) / CELL_IN) + 1;
    return { cols, rows, words: Math.ceil(cols / 32), data: rasterize(grown, pad, cols, rows), rotation, w: b.maxX, h: b.maxY, pad };
  });
}

function emptyGrid(bin: BinSpec, margin: number): Grid {
  const cols = Math.floor(bin.w / CELL_IN), rows = Math.floor(bin.h / CELL_IN);
  const g = new Grid(cols + 32, rows);
  // the edge margin, and everything past the bin's edge, is taken
  const c0 = Math.ceil(margin / CELL_IN), c1 = Math.floor((bin.w - margin) / CELL_IN);
  const r0 = Math.ceil(margin / CELL_IN), r1 = Math.floor((bin.h - margin) / CELL_IN);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols + 32; c++) if (r < r0 || r >= r1 || c < c0 || c >= c1) g.set(c, r);
  return g;
}

interface Open {
  spec: BinSpec;
  grid: Grid;
  placements: Placed[];
}

/** The lowest, then leftmost, spot for a part over all its allowed turns. */
function findSpot(grid: Grid, rs: Raster[]): { r: Raster; c: number; row: number } | null {
  let best: { r: Raster; c: number; row: number } | null = null;
  for (const r of rs) {
    let found: { c: number; row: number } | null = null;
    for (let row = 0; row + r.rows <= grid.rows && !found; row++) {
      if (best && row + r.rows >= best.row + best.r.rows) break;
      for (let c = 0; c + r.cols <= grid.cols - 32; c++)
        if (grid.fits(r, c, row)) {
          found = { c, row };
          break;
        }
    }
    if (found && (!best || found.row + r.rows < best.row + best.r.rows || (found.row + r.rows === best.row + best.r.rows && found.c < best.c))) best = { r, ...found };
  }
  return best;
}

export function nestTrueShape(orders: { orderId: string; parts: NestPart[] }[], available: BinSpec[], s: NestSettings): NestResult {
  const open: Open[] = [];
  const unused = s.useOffcutsFirst ? [...available].sort((a, b) => (a.kind === 'offcut' ? 0 : 1) - (b.kind === 'offcut' ? 0 : 1) || a.w * a.h - b.w * b.h) : available.filter((b) => b.kind === 'spare');
  let sheets = 0;
  const unplaced: NestResult['unplaced'] = [];
  const cache = new Map<string, Raster[]>();
  const rastersOf = (p: NestPart) => cache.get(p.key) ?? (cache.set(p.key, rasters(p, s)), cache.get(p.key)!);

  const tryAll = (grid: Grid, parts: NestPart[]): { grid: Grid; placed: Placed[] } | null => {
    const g = grid.clone();
    const placed: Placed[] = [];
    for (const p of parts) {
      const spot = findSpot(g, rastersOf(p));
      if (!spot) return null;
      g.stamp(spot.r, spot.c, spot.row);
      placed.push({
        key: p.key, orderId: p.orderId, orderNumber: p.orderNumber, partId: p.partId, partName: p.partName,
        x: spot.c * CELL_IN + spot.r.pad, y: spot.row * CELL_IN + spot.r.pad, w: spot.r.w, h: spot.r.h, rotation: spot.r.rotation, area: p.area,
      });
    }
    return { grid: g, placed };
  };
  const newPanel = (): BinSpec => {
    const lastA = open.find((b) => b.spec.kind === 'panel' && b.spec.sheet === sheets && b.spec.half === 'A');
    const hasB = open.some((b) => b.spec.kind === 'panel' && b.spec.sheet === sheets && b.spec.half === 'B');
    if (lastA && !hasB) return { id: `sheet${sheets}-B`, kind: 'panel', label: `Sheet ${sheets} Panel B`, w: s.panelW, h: s.panelH, sheet: sheets, half: 'B' };
    sheets++;
    return { id: `sheet${sheets}-A`, kind: 'panel', label: `Sheet ${sheets} Panel A`, w: s.panelW, h: s.panelH, sheet: sheets, half: 'A' };
  };
  /** Opens the first unused bin these parts fit on (offcuts and spare panels, then a new panel). */
  const openFor = (parts: NestPart[]): boolean => {
    for (let i = 0; i < unused.length; i++) {
      const r = tryAll(emptyGrid(unused[i], s.marginIn), parts);
      if (r) {
        const [spec] = unused.splice(i, 1);
        open.push({ spec, grid: r.grid, placements: r.placed });
        return true;
      }
    }
    const blank = { id: '', kind: 'panel' as const, label: '', w: s.panelW, h: s.panelH };
    const r = tryAll(emptyGrid(blank, s.marginIn), parts);
    if (!r) return false;
    open.push({ spec: newPanel(), grid: r.grid, placements: r.placed });
    return true;
  };

  for (const g of orders) {
    const parts = g.parts.filter((p) => p.shape).sort((a, b) => b.area - a.area);
    let done = false;
    for (const bin of open) {
      const r = tryAll(bin.grid, parts);
      if (r) {
        bin.grid = r.grid;
        bin.placements.push(...r.placed);
        done = true;
        break;
      }
    }
    if (done || openFor(parts)) continue;
    // too much for one panel: one part at a time
    for (const p of parts) {
      let placed = false;
      for (const bin of open) {
        const r = tryAll(bin.grid, [p]);
        if (r) {
          bin.grid = r.grid;
          bin.placements.push(...r.placed);
          placed = true;
          break;
        }
      }
      if (!placed && !openFor([p])) unplaced.push({ key: p.key, orderNumber: p.orderNumber, partName: p.partName, reason: `${p.w.toFixed(1)} × ${p.h.toFixed(1)} in doesn’t fit on a panel` });
    }
  }
  const bins: BinLayout[] = open.map((b) => ({ ...b.spec, placements: b.placements }));
  const binArea = bins.reduce((t, b) => t + b.w * b.h, 0);
  const partArea = bins.reduce((t, b) => t + b.placements.reduce((u, p) => u + p.area, 0), 0);
  const panels = bins.filter((b) => b.kind === 'panel').length;
  return {
    bins,
    unplaced,
    newSheets: sheets,
    sparePanelsUsed: bins.filter((b) => b.kind === 'spare').length,
    offcutsUsed: bins.filter((b) => b.kind === 'offcut').map((b) => b.offcutId!),
    sparePanelsLeft: sheets * 2 - panels,
    utilization: binArea ? partArea / binArea : 0,
  };
}

/** Exact check of a true-shape layout: real outlines (grown by half the spacing) don't overlap, and stay inside the usable area. */
export function checkTrueShape(bin: { w: number; h: number; label: string; placements: Placed[] }, shapes: Map<string, Shape>, s: Pick<NestSettings, 'marginIn' | 'spacingIn'>): string[] {
  const errors: string[] = [];
  const placedShapes = bin.placements.map((p) => {
    const t = turn(shapes.get(p.key)!, p.rotation).map((ring) => ring.map((q) => ({ x: q.x + p.x, y: q.y + p.y })));
    const b = bounds(t);
    if (b.minX < s.marginIn - 1e-6 || b.minY < s.marginIn - 1e-6 || b.maxX > bin.w - s.marginIn + 1e-6 || b.maxY > bin.h - s.marginIn + 1e-6)
      errors.push(`${p.orderNumber} ${p.partName} is outside the usable area of ${bin.label}.`);
    return { p, grown: offset(t, s.spacingIn / 2 - 1e-4, 'round') };
  });
  return errors.concat(overlapErrors(placedShapes, bin.label, s.spacingIn));
}

function overlapErrors(list: { p: Placed; grown: Shape }[], label: string, spacing: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) if (area(intersect(list[i].grown, list[j].grown)) > 1e-6) out.push(`${list[i].p.orderNumber} ${list[i].p.partName} and ${list[j].p.orderNumber} ${list[j].p.partName} are closer than ${spacing} in on ${label}.`);
  return out;
}
