// Polygon helpers over Clipper2. Shapes are in inches; Clipper works on integers,
// so every operation scales by SCALE (1 unit = 0.0001 in) on the way in and out.

import {
  Clipper,
  Clipper64,
  ClipType,
  EndType,
  FillRule,
  JoinType,
  PointInPolygonResult,
  PolyPath64,
  PolyTree64,
  type Path64,
  type Paths64,
} from '@countertype/clipper2-ts';
import type { Bounds, Pt, Shape } from './types';

export const SCALE = 10_000;
const ARC_TOL_IN = 0.002;

export function toP64(shape: Shape): Paths64 {
  return shape.map((path) => path.map((p) => ({ x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) })));
}

export function fromP64(paths: Paths64): Shape {
  return paths.map((path) => path.map((p) => ({ x: p.x / SCALE, y: p.y / SCALE })));
}

/**
 * Union of several shapes. Each is normalised on its own first (outers
 * positive, holes negative): mixing a clockwise bridge with counter-clockwise
 * letters under non-zero fill would otherwise cancel where they overlap.
 */
export function union(...shapes: Shape[]): Shape {
  const parts = shapes.filter((s) => s.length);
  if (parts.length === 0) return [];
  if (parts.length === 1) return fromP64(Clipper.union(toP64(parts[0]), FillRule.NonZero));
  const all: Paths64 = [];
  for (const s of parts) all.push(...Clipper.union(toP64(s), FillRule.NonZero));
  return fromP64(Clipper.union(all, FillRule.NonZero));
}

export function difference(a: Shape, b: Shape): Shape {
  if (a.length === 0) return [];
  if (b.length === 0) return union(a);
  return fromP64(Clipper.difference(toP64(a), toP64(b), FillRule.NonZero));
}

export function intersect(a: Shape, b: Shape): Shape {
  if (a.length === 0 || b.length === 0) return [];
  return fromP64(Clipper.intersect(toP64(a), toP64(b), FillRule.NonZero));
}

/** Grow (d > 0) or shrink (d < 0) a shape. Holes move the opposite way automatically. */
export function offset(shape: Shape, d: number, join: 'round' | 'miter' = 'round', arcTolIn = ARC_TOL_IN): Shape {
  if (shape.length === 0) return [];
  if (d === 0) return union(shape);
  const jt = join === 'round' ? JoinType.Round : JoinType.Miter;
  const out = Clipper.inflatePaths(toP64(union(shape)), d * SCALE, jt, EndType.Polygon, 2, arcTolIn * SCALE);
  return fromP64(out);
}

/** Total filled area (outers minus holes) of a normalised shape. */
export function area(shape: Shape): number {
  if (shape.length === 0) return 0;
  return Math.abs(Clipper.areaPaths(toP64(union(shape)))) / (SCALE * SCALE);
}

export function pathArea(path: Pt[]): number {
  let a = 0;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) a += (path[j].x + path[i].x) * (path[j].y - path[i].y);
  return a / 2;
}

/** Split a shape into separate physical pieces: each outer contour with its own holes. */
export function pieces(shape: Shape): Shape[] {
  if (shape.length === 0) return [];
  const c = new Clipper64();
  c.addSubject(toP64(shape));
  const tree = new PolyTree64();
  c.execute(ClipType.Union, FillRule.NonZero, tree);
  const out: Shape[] = [];
  const visit = (node: PolyPath64) => {
    for (let i = 0; i < node.count; i++) {
      const outer = node.child(i);
      const piece: Paths64 = [outer.poly as Path64];
      for (let j = 0; j < outer.count; j++) {
        const hole = outer.child(j);
        piece.push(hole.poly as Path64);
        visit(hole); // islands inside a hole are pieces of their own
      }
      out.push(fromP64(piece));
    }
  };
  visit(tree);
  return out;
}

export function countPieces(shape: Shape, minAreaIn2 = 0): number {
  return pieces(shape).filter((p) => minAreaIn2 === 0 || area(p) > minAreaIn2).length;
}

export function bounds(shape: Shape): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of shape)
    for (const p of path) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export const boundsW = (b: Bounds) => b.maxX - b.minX;
export const boundsH = (b: Bounds) => b.maxY - b.minY;

export function boundsOverlap(a: Bounds, b: Bounds, pad = 0): boolean {
  return a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
}

export function translate(shape: Shape, dx: number, dy: number): Shape {
  return shape.map((path) => path.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

export function scale(shape: Shape, s: number, ox = 0, oy = 0): Shape {
  return shape.map((path) => path.map((p) => ({ x: ox + (p.x - ox) * s, y: oy + (p.y - oy) * s })));
}

export function rotate180(shape: Shape, cx: number, cy: number): Shape {
  return shape.map((path) => path.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y })));
}

export function rect(x0: number, y0: number, x1: number, y1: number): Shape {
  return [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, tolIn = ARC_TOL_IN): Shape {
  const r = Math.max(rx, ry);
  const steps = Math.max(24, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tolIn / r))));
  const path: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    path.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return [path];
}

export function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number, tolIn = ARC_TOL_IN): Shape {
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  if (rr <= 0) return rect(x0, y0, x1, y1);
  return offset(rect(x0 + rr, y0 + rr, x1 - rr, y1 - rr), rr, 'round', tolIn);
}

/** A bar of the given width from a to b, extended past both ends so it bites into the material. */
export function bridgeBar(a: Pt, b: Pt, width: number, extend: number): Shape {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 1e-9 ? dx / len : 1, uy = len > 1e-9 ? dy / len : 0;
  const nx = -uy * (width / 2), ny = ux * (width / 2);
  const s = { x: a.x - ux * extend, y: a.y - uy * extend };
  const e = { x: b.x + ux * extend, y: b.y + uy * extend };
  return [[
    { x: s.x + nx, y: s.y + ny },
    { x: e.x + nx, y: e.y + ny },
    { x: e.x - nx, y: e.y - ny },
    { x: s.x - nx, y: s.y - ny },
  ]];
}

function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return a;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Closest pair of boundary points between two shapes (vertex-to-segment both ways). */
export function closestPoints(a: Shape, b: Shape, filterA?: (p: Pt) => boolean): { a: Pt; b: Pt; d: number } {
  let best = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, d: Infinity };
  const scan = (from: Shape, to: Shape, swap: boolean, filter?: (p: Pt) => boolean) => {
    const tb = bounds(to);
    for (const path of from)
      for (const p of path) {
        if (filter && !filter(p)) continue;
        // cheap reject: distance to the other shape's bounding box
        const bx = Math.max(tb.minX - p.x, 0, p.x - tb.maxX), by = Math.max(tb.minY - p.y, 0, p.y - tb.maxY);
        if (bx * bx + by * by >= best.d * best.d) continue;
        for (const q of to)
          for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
            const c = closestOnSegment(p, q[j], q[i]);
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            if (d < best.d) best = swap ? { a: c, b: p, d } : { a: p, b: c, d };
          }
      }
  };
  scan(a, b, false, filterA);
  // With a filter on A, only A's own vertices are candidates, so skip the reverse scan.
  if (!filterA) scan(b, a, true);
  return best;
}

export function perimeter(shape: Shape): number {
  let len = 0;
  for (const path of shape)
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) len += Math.hypot(path[i].x - path[j].x, path[i].y - path[j].y);
  return len;
}

export function simplify(shape: Shape, tolIn: number): Shape {
  if (shape.length === 0) return [];
  const out = Clipper.simplifyPaths(toP64(shape), tolIn * SCALE, true);
  return fromP64(out).filter((p) => p.length >= 3);
}

export function pointInShape(pt: Pt, shape: Shape): boolean {
  const p = { x: Math.round(pt.x * SCALE), y: Math.round(pt.y * SCALE) };
  let winding = 0;
  for (const path of toP64(shape)) {
    const r = Clipper.pointInPolygon(p, path);
    if (r === PointInPolygonResult.IsOn) return true;
    if (r === PointInPolygonResult.IsInside) winding += Clipper.isPositive(path) ? 1 : -1;
  }
  return winding !== 0;
}

export function centroid(shape: Shape): Pt {
  let a = 0, cx = 0, cy = 0;
  for (const path of shape)
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const f = path[j].x * path[i].y - path[i].x * path[j].y;
      a += f;
      cx += (path[j].x + path[i].x) * f;
      cy += (path[j].y + path[i].y) * f;
    }
  if (Math.abs(a) < 1e-12) {
    const b = bounds(shape);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Outer contours only (holes dropped), as one filled shape. */
export function fillHoles(shape: Shape): Shape {
  return union(pieces(shape).map((p) => [p[0]]).flat());
}
