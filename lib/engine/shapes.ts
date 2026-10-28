// Backer shapes, keyhole slots and open score lines.

import { Clipper64, ClipType, FillRule, type Paths64 } from '@countertype/clipper2-ts';
import {
  bounds,
  ellipse,
  fromP64,
  intersect,
  offset,
  pointInShape,
  rect,
  roundedRect,
  toP64,
  union,
} from './geom';
import type { BackerShapeKey, Bounds, EngineSettings, Pt, Shape } from './types';

export interface BackerParams {
  shape: BackerShapeKey;
  paddingIn: number;
  cornerRadiusIn: number;
  plankWidthIn: number;
  archRiseRatio: number;
}

/**
 * Text scale for a backer of ordered width W, given the text block size at s = 1.
 * Rectangles add padding to each side; ovals and circles must contain the
 * padded text box's corners.
 */
export function backerScale(p: BackerParams, W: number, w1: number, h1: number): number {
  const pad = p.paddingIn;
  switch (p.shape) {
    case 'oval':
      return Math.max(0, (W / (2 * Math.SQRT2) - pad) * 2) / w1;
    case 'circle':
      return Math.max(0, (W / 2 - pad) * 2) / Math.hypot(w1, h1);
    default:
      return Math.max(0, W - 2 * pad) / w1;
  }
}

/** Build the backer outline around a text box centred at (cx, cy). */
export function backerShape(p: BackerParams, W: number, text: Bounds): { shape: Shape; scoreLines: Pt[][] } {
  const cx = (text.minX + text.maxX) / 2, cy = (text.minY + text.maxY) / 2;
  const th = text.maxY - text.minY;
  const pad = p.paddingIn;
  const x0 = cx - W / 2, x1 = cx + W / 2;
  const y0 = text.minY - pad, y1 = text.maxY + pad;
  switch (p.shape) {
    case 'rectangle':
      return { shape: rect(x0, y0, x1, y1), scoreLines: [] };
    case 'rounded_rectangle':
      return { shape: roundedRect(x0, y0, x1, y1, p.cornerRadiusIn), scoreLines: [] };
    case 'plank': {
      const shape = rect(x0, y0, x1, y1);
      const lines: Pt[][] = [];
      for (let y = y0 + p.plankWidthIn; y < y1 - 0.25; y += p.plankWidthIn) lines.push([{ x: x0, y }, { x: x1, y }]);
      return { shape, scoreLines: lines };
    }
    case 'arch_top': {
      const h = p.archRiseRatio * W;
      const R = (W * W) / 4 / (2 * h) + h / 2;
      const cap = intersect(ellipse(cx, y0 - h + R, R, R), rect(x0, y0 - h, x1, y0 + 0.01));
      return { shape: union(rect(x0, y0, x1, y1), cap), scoreLines: [] };
    }
    case 'oval': {
      const rx = W / 2;
      const ry = (th / 2 + pad) * Math.SQRT2;
      return { shape: ellipse(cx, cy, rx, ry), scoreLines: [] };
    }
    case 'circle':
      return { shape: ellipse(cx, cy, W / 2, W / 2), scoreLines: [] };
  }
}

/** Clip open polylines to the inside of a shape (for plank lines on a backer). */
export function clipLines(lines: Pt[][], shape: Shape): Pt[][] {
  if (!lines.length || !shape.length) return [];
  const c = new Clipper64();
  c.addOpenSubject(toP64(lines));
  c.addClip(toP64(shape));
  const closed: Paths64 = [];
  const open: Paths64 = [];
  c.execute(ClipType.Intersection, FillRule.NonZero, closed, open);
  return fromP64(open);
}

/** Keyhole outline: a round head hole with a slot running up from it. */
export function keyholeShape(c: Pt, s: EngineSettings): Shape {
  const rh = s.keyhole_head_dia_in / 2;
  const rs = s.keyhole_slot_width_in / 2;
  const top = c.y - s.keyhole_slot_length_in;
  return union(ellipse(c.x, c.y, rh, rh), rect(c.x - rs, top, c.x + rs, c.y), ellipse(c.x, top, rs, rs));
}

/**
 * Find keyhole centres near the given fractions of the width, all on one row so
 * the sign hangs level. A spot counts as strong when the head and the whole
 * slot keep at least the minimum feature width of material around them.
 * Among strong spots the thickest material wins, then the closest to target.
 */
export function placeKeyholes(shape: Shape, fractions: number[], s: EngineSettings, minFeatureIn: number, region?: Bounds): Pt[] | null {
  const b = region ?? bounds(shape);
  const W = b.maxX - b.minX;
  const rh = s.keyhole_head_dia_in / 2, rs = s.keyhole_slot_width_in / 2;
  const headOk = offset(shape, -(rh + minFeatureIn));
  const slotOk = offset(shape, -(rs + minFeatureIn));
  if (!headOk.length) return null;
  const levels = [0.1, 0.25, 0.5, 1].map((extra) => offset(shape, -(rh + minFeatureIn + extra)));
  const hb = bounds(headOk);
  const step = Math.max(0.05, Math.min(W, b.maxY - b.minY) / 80);
  const window = W * 0.1;
  const strength = (p: Pt) => {
    let k = 0;
    for (const lv of levels) if (lv.length && pointInShape(p, lv)) k++; else break;
    return k;
  };
  const fits = (p: Pt) => {
    if (!pointInShape(p, headOk)) return false;
    for (let t = 0.25; t <= 1.0001; t += 0.25) if (!pointInShape({ x: p.x, y: p.y - s.keyhole_slot_length_in * t }, slotOk)) return false;
    return true;
  };
  type Pick = { pts: Pt[]; score: number; dist: number };
  let best: Pick | null = null;
  for (let y = Math.max(hb.minY, b.minY); y <= Math.min(hb.maxY, b.maxY); y += step) {
    const pts: Pt[] = [];
    let score = Infinity, dist = 0;
    for (const f of fractions) {
      const tx = b.minX + W * f;
      let rowBest: { p: Pt; k: number; d: number } | null = null;
      for (let x = tx - window; x <= tx + window; x += step) {
        const p = { x, y };
        if (!fits(p)) continue;
        const k = strength(p);
        const d = Math.abs(x - tx);
        if (!rowBest || k > rowBest.k || (k === rowBest.k && d < rowBest.d)) rowBest = { p, k, d };
      }
      if (!rowBest) { score = -1; break; }
      pts.push(rowBest.p);
      score = Math.min(score, rowBest.k);
      dist += rowBest.d;
    }
    if (score < 0) continue;
    // prefer the upper half of the sign when strength and distance tie
    const yPenalty = Math.abs(y - (b.minY + (b.maxY - b.minY) * 0.35)) * 0.01;
    if (!best || score > best.score || (score === best.score && dist + yPenalty < best.dist)) best = { pts, score, dist: dist + yPenalty };
  }
  return best?.pts ?? null;
}
