// Panel nesting (SPEC.md, "Sheet nesting"): pack the parts of paid orders onto
// offcuts first, then spare panels, then new 4 × 8 ft sheets ripped into
// Panel A and Panel B. Rectangle packing (MaxRects, best short-side fit) on
// each part's cut outline, with spacing between parts and a margin at the edges.
// Pure: parts and bins in, a layout out.

export type Rotation = 0 | 90 | 180 | 270;

export interface NestPart {
  /** unique within the run, e.g. `${orderId}:${partId}` */
  key: string;
  orderId: string;
  orderNumber: string;
  partId: string;
  partName: string;
  /** cut outline size, unrotated */
  w: number;
  h: number;
  /** real part area, for material use */
  area: number;
  /** the part's cut outline, for true-shape nesting */
  shape?: import('@/lib/engine/types').Shape;
}

export type BinKind = 'offcut' | 'spare' | 'panel';

export interface BinSpec {
  id: string;
  kind: BinKind;
  label: string;
  w: number;
  h: number;
  /** new sheets: which sheet and which half */
  sheet?: number;
  half?: 'A' | 'B';
  offcutId?: string;
}

export interface Placed {
  key: string;
  orderId: string;
  orderNumber: string;
  partId: string;
  partName: string;
  /** top-left of the part's footprint on the bin, in inches */
  x: number;
  y: number;
  /** footprint after rotation */
  w: number;
  h: number;
  /** quarter turns clockwise; rectangle packing only uses 0 and 90 */
  rotation: Rotation;
  area: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BinLayout extends BinSpec {
  placements: Placed[];
}

export interface NestSettings {
  marginIn: number;
  spacingIn: number;
  /** grain lock limits parts to 0° and 180°, so no quarter turns */
  allowRotate: boolean;
  useOffcutsFirst: boolean;
  panelW: number;
  panelH: number;
  minOffcutW: number;
  minOffcutH: number;
  timeLimitMs: number;
}

export interface NestResult {
  bins: BinLayout[];
  unplaced: { key: string; orderNumber: string; partName: string; reason: string }[];
  newSheets: number;
  sparePanelsUsed: number;
  offcutsUsed: string[];
  /** panels left over from new sheets (Panel B unused) */
  sparePanelsLeft: number;
  utilization: number;
}

const EPS = 1e-6;

/** A bin's free space as MaxRects: overlapping maximal rectangles inside the usable area. */
class FreeSpace {
  free: Rect[];
  constructor(public w: number, public h: number, public margin: number, public spacing: number) {
    // spacing is added to every part's footprint, so the usable area grows by one spacing to compensate at the far edges
    this.free = [{ x: margin, y: margin, w: w - 2 * margin + spacing, h: h - 2 * margin + spacing }];
  }
  clone() {
    const f = new FreeSpace(this.w, this.h, this.margin, this.spacing);
    f.free = this.free.map((r) => ({ ...r }));
    return f;
  }
  /** Best short-side fit for a w × h footprint (spacing added); null if it doesn't fit. */
  find(w: number, h: number, allowRotate: boolean): { x: number; y: number; rot: 0 | 90; score: number } | null {
    let best: { x: number; y: number; rot: 0 | 90; score: number } | null = null;
    const tries: [number, number, 0 | 90][] = [[w, h, 0]];
    if (allowRotate && Math.abs(w - h) > EPS) tries.push([h, w, 90]);
    for (const r of this.free)
      for (const [tw, th, rot] of tries) {
        const fw = tw + this.spacing, fh = th + this.spacing;
        if (fw <= r.w + EPS && fh <= r.h + EPS) {
          const score = Math.min(r.w - fw, r.h - fh) * 1000 + Math.max(r.w - fw, r.h - fh) + (r.y * 1e-3 + r.x * 1e-6);
          if (!best || score < best.score) best = { x: r.x, y: r.y, rot, score };
        }
      }
    return best;
  }
  /** Removes a placed footprint (spacing included) from the free space. */
  place(x: number, y: number, w: number, h: number) {
    const used = { x, y, w: w + this.spacing, h: h + this.spacing };
    const next: Rect[] = [];
    for (const r of this.free) {
      if (!overlaps(r, used)) {
        next.push(r);
        continue;
      }
      if (used.x > r.x + EPS) next.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
      if (used.x + used.w < r.x + r.w - EPS) next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - used.x - used.w, h: r.h });
      if (used.y > r.y + EPS) next.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
      if (used.y + used.h < r.y + r.h - EPS) next.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - used.y - used.h });
    }
    this.free = prune(next);
  }
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const contains = (a: Rect, b: Rect) => b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;

function prune(rs: Rect[]): Rect[] {
  const keep = rs.filter((r) => r.w > EPS && r.h > EPS);
  return keep.filter((r, i) => !keep.some((o, j) => j !== i && contains(o, r) && (!contains(r, o) || j < i)));
}

interface OpenBin {
  spec: BinSpec;
  space: FreeSpace;
  placements: Placed[];
}

type Group = { orderId: string; parts: NestPart[] };

function packOnce(groups: Group[], available: BinSpec[], s: NestSettings, partOrder: (a: NestPart, b: NestPart) => number): { bins: OpenBin[]; unplaced: NestResult['unplaced']; sheets: number } {
  const open: OpenBin[] = [];
  const unused = [...available];
  let sheets = 0;
  const unplaced: NestResult['unplaced'] = [];
  const fitsAnywhere = (p: NestPart) => {
    const usableW = s.panelW - 2 * s.marginIn, usableH = s.panelH - 2 * s.marginIn;
    return (p.w <= usableW + EPS && p.h <= usableH + EPS) || (s.allowRotate && p.h <= usableW + EPS && p.w <= usableH + EPS);
  };
  const tryAll = (bin: OpenBin, parts: NestPart[]): { space: FreeSpace; placed: Placed[] } | null => {
    const space = bin.space.clone();
    const placed: Placed[] = [];
    for (const p of parts) {
      const f = space.find(p.w, p.h, s.allowRotate);
      if (!f) return null;
      const w = f.rot === 90 ? p.h : p.w, h = f.rot === 90 ? p.w : p.h;
      space.place(f.x, f.y, w, h);
      placed.push({ key: p.key, orderId: p.orderId, orderNumber: p.orderNumber, partId: p.partId, partName: p.partName, x: f.x, y: f.y, w, h, rotation: f.rot, area: p.area });
    }
    return { space, placed };
  };
  const openBin = (spec: BinSpec): OpenBin => {
    const b = { spec, space: new FreeSpace(spec.w, spec.h, s.marginIn, s.spacingIn), placements: [] as Placed[] };
    open.push(b);
    return b;
  };
  // the next bin to open: unused offcuts and spare panels in order, then new sheets (Panel A, then B)
  const nextBin = (forParts: NestPart[]): OpenBin | null => {
    for (let i = 0; i < unused.length; i++) {
      const trial = { spec: unused[i], space: new FreeSpace(unused[i].w, unused[i].h, s.marginIn, s.spacingIn), placements: [] };
      if (tryAll(trial, forParts)) {
        const [spec] = unused.splice(i, 1);
        return openBin(spec);
      }
    }
    const trial = { spec: { id: 'x', kind: 'panel' as const, label: '', w: s.panelW, h: s.panelH }, space: new FreeSpace(s.panelW, s.panelH, s.marginIn, s.spacingIn), placements: [] };
    if (!tryAll(trial, forParts)) return null;
    // Panel B of the last sheet first, if that sheet's B isn't open yet
    const lastA = open.find((b) => b.spec.kind === 'panel' && b.spec.sheet === sheets && b.spec.half === 'A');
    const hasB = open.some((b) => b.spec.kind === 'panel' && b.spec.sheet === sheets && b.spec.half === 'B');
    if (lastA && !hasB) return openBin({ id: `sheet${sheets}-B`, kind: 'panel', label: `Sheet ${sheets} Panel B`, w: s.panelW, h: s.panelH, sheet: sheets, half: 'B' });
    sheets++;
    return openBin({ id: `sheet${sheets}-A`, kind: 'panel', label: `Sheet ${sheets} Panel A`, w: s.panelW, h: s.panelH, sheet: sheets, half: 'A' });
  };
  const commit = (bin: OpenBin, r: { space: FreeSpace; placed: Placed[] }) => {
    bin.space = r.space;
    bin.placements.push(...r.placed);
  };

  for (const g of groups) {
    const parts = g.parts.filter((p) => {
      if (fitsAnywhere(p)) return true;
      unplaced.push({ key: p.key, orderNumber: p.orderNumber, partName: p.partName, reason: `${p.w.toFixed(1)} × ${p.h.toFixed(1)} in is bigger than a panel` });
      return false;
    });
    if (!parts.length) continue;
    const sorted = [...parts].sort(partOrder);
    // keep an order's parts on one panel when they fit: the open bins first, then a new one
    let done = false;
    for (const bin of open) {
      const r = tryAll(bin, sorted);
      if (r) {
        commit(bin, r);
        done = true;
        break;
      }
    }
    if (!done) {
      const bin = nextBin(sorted);
      if (bin) {
        commit(bin, tryAll(bin, sorted)!);
        done = true;
      }
    }
    if (done) continue;
    // too much for one panel: place the parts one by one
    for (const p of sorted) {
      let placed = false;
      for (const bin of open) {
        const r = tryAll(bin, [p]);
        if (r) {
          commit(bin, r);
          placed = true;
          break;
        }
      }
      if (!placed) {
        const bin = nextBin([p]);
        if (bin) commit(bin, tryAll(bin, [p])!);
        else unplaced.push({ key: p.key, orderNumber: p.orderNumber, partName: p.partName, reason: 'does not fit' });
      }
    }
  }
  return { bins: open, unplaced, sheets };
}

/**
 * Packs whole orders (in the order given, normally by needed-by date) onto the
 * bins. A few part orderings are tried within the time limit; the plan with the
 * fewest new sheets, then the fewest bins, wins.
 */
export function nest(orders: { orderId: string; parts: NestPart[] }[], available: BinSpec[], s: NestSettings): NestResult {
  const bins = s.useOffcutsFirst ? [...available].sort((a, b) => rank(a) - rank(b) || a.w * a.h - b.w * b.h) : available.filter((b) => b.kind === 'spare');
  const orderings: ((a: NestPart, b: NestPart) => number)[] = [
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
  ];
  const start = Date.now();
  let best: ReturnType<typeof packOnce> | null = null;
  const scoreOf = (r: ReturnType<typeof packOnce>) => r.unplaced.length * 1e6 + r.sheets * 1e3 + r.bins.length;
  for (const o of orderings) {
    const r = packOnce(orders, bins, s, o);
    if (!best || scoreOf(r) < scoreOf(best)) best = r;
    if (Date.now() - start > s.timeLimitMs) break;
  }
  const r = best!;
  const binArea = r.bins.reduce((t, b) => t + b.spec.w * b.spec.h, 0);
  const partArea = r.bins.reduce((t, b) => t + b.placements.reduce((u, p) => u + p.area, 0), 0);
  const panelsOpened = r.bins.filter((b) => b.spec.kind === 'panel').length;
  return {
    bins: r.bins.map((b) => ({ ...b.spec, placements: b.placements })),
    unplaced: r.unplaced,
    newSheets: r.sheets,
    sparePanelsUsed: r.bins.filter((b) => b.spec.kind === 'spare').length,
    offcutsUsed: r.bins.filter((b) => b.spec.kind === 'offcut').map((b) => b.spec.offcutId!),
    sparePanelsLeft: r.sheets * 2 - panelsOpened,
    utilization: binArea ? partArea / binArea : 0,
  };
}

const rank = (b: BinSpec) => (b.kind === 'offcut' ? 0 : b.kind === 'spare' ? 1 : 2);

/** Checks a hand-adjusted layout: every part inside the usable area and clear of the others by the spacing. */
export function checkLayout(bin: { w: number; h: number; label: string; placements: Placed[] }, s: Pick<NestSettings, 'marginIn' | 'spacingIn'>): string[] {
  const errors: string[] = [];
  const m = s.marginIn;
  for (const p of bin.placements) {
    if (p.x < m - EPS || p.y < m - EPS || p.x + p.w > bin.w - m + EPS || p.y + p.h > bin.h - m + EPS)
      errors.push(`${p.orderNumber} ${p.partName} is outside the usable area of ${bin.label}.`);
  }
  for (let i = 0; i < bin.placements.length; i++)
    for (let j = i + 1; j < bin.placements.length; j++) {
      const a = bin.placements[i], b = bin.placements[j];
      const grow = (r: Rect) => ({ x: r.x, y: r.y, w: r.w + s.spacingIn, h: r.h + s.spacingIn });
      if (overlaps(grow(a), grow(b))) errors.push(`${a.orderNumber} ${a.partName} and ${b.orderNumber} ${b.partName} are closer than ${s.spacingIn} in on ${bin.label}.`);
    }
  return errors;
}

/**
 * Usable leftovers on a bin once its parts are cut: the biggest free rectangles
 * that are at least the smallest offcut worth keeping, not overlapping each other.
 */
export function leftovers(bin: { w: number; h: number; placements: Placed[] }, s: Pick<NestSettings, 'marginIn' | 'spacingIn' | 'minOffcutW' | 'minOffcutH'>, max = 3): Rect[] {
  const space = new FreeSpace(bin.w, bin.h, 0, 0);
  for (const p of bin.placements) space.place(Math.max(0, p.x - s.spacingIn / 2), Math.max(0, p.y - s.spacingIn / 2), p.w + s.spacingIn, p.h + s.spacingIn);
  const out: Rect[] = [];
  const ok = (r: Rect) => Math.min(r.w, r.h) >= s.minOffcutW - EPS && Math.max(r.w, r.h) >= s.minOffcutH - EPS;
  while (out.length < max) {
    const cands = space.free.filter(ok).sort((a, b) => b.w * b.h - a.w * a.h);
    if (!cands.length) break;
    const r = { x: round(cands[0].x), y: round(cands[0].y), w: floorTo(cands[0].w), h: floorTo(cands[0].h) };
    if (!ok(r)) break;
    out.push(r);
    space.place(r.x, r.y, r.w, r.h);
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
/** offcut sizes are rounded down to the 1/8 in */
const floorTo = (n: number) => Math.floor(n * 8 + EPS) / 8;
