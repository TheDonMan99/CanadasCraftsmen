// Final step of the pipeline: strength checks on each part.
//
// Thin sections are found with morphology. Shrinking a part by half the minimum
// feature width deletes everything thinner than that width:
//  - if the shrunk part falls apart, a thin neck joins the pieces (fragile);
//  - if a long sliver vanishes, it's a thin tail or hairline stroke.
// Short tapered tips are ignored (every script letter has them).
// Bridges the engine added are checked at their own set width, not the
// material's, by widening them to the minimum before the test.

import { area, bridgeBar, centroid, closestPoints, difference, offset, pieces, simplify, union } from './geom';
import type { Connector } from './connect';
import type { Shape, ThinSpot } from './types';

const DELTA = 0.005;

export interface ThinResult {
  ok: boolean;
  spots: ThinSpot[];
  regions: Shape;
  thinnestIn: number;
  thinnestAt: { x: number; y: number };
}

function erodedPieces(shape: Shape, r: number, minArea: number): Shape[] {
  return pieces(offset(shape, -r)).filter((p) => area(p) > minArea);
}

function widened(shape: Shape, connectors: Connector[], minFeatureIn: number): Shape {
  const extra = connectors
    .filter((c) => c.a && c.b && c.widthIn < minFeatureIn)
    .map((c) => bridgeBar(c.a!, c.b!, minFeatureIn * 1.5, minFeatureIn / 2 + c.widthIn / 2));
  return extra.length ? union(shape, ...extra) : shape;
}

export function checkThin(partId: string, shape: Shape, connectors: Connector[], minFeatureIn: number, tailIgnoreLenIn: number): ThinResult {
  const geom = widened(shape, connectors, minFeatureIn);
  const r = minFeatureIn / 2;
  const tiny = (r * 0.2) ** 2;
  const spots: ThinSpot[] = [];
  let regions: Shape = [];

  const eroded = erodedPieces(geom, r, tiny);
  if (eroded.length === 0) {
    const c = centroid(geom);
    const w = thinnest(geom, 0, r).w;
    return { ok: false, spots: [{ partId, x: c.x, y: c.y, widthIn: w }], regions: geom, thinnestIn: w, thinnestAt: c };
  }
  if (eroded.length > 1) {
    // necks: between the biggest eroded blob and each other blob
    const sorted = eroded.sort((a, b) => area(b) - area(a));
    const main = simplify(sorted[0], 0.003);
    for (const other of sorted.slice(1)) {
      const cp = closestPoints(simplify(other, 0.003), main);
      const at = { x: (cp.a.x + cp.b.x) / 2, y: (cp.a.y + cp.b.y) / 2 };
      spots.push({ partId, ...at, widthIn: NaN });
    }
  }
  // tails and hairlines: material lost when the shrunk part grows back
  const reopened = offset(union(...eroded), r + DELTA);
  const lost = pieces(difference(geom, reopened)).filter((p) => area(p) > minFeatureIn * tailIgnoreLenIn);
  for (const p of lost) {
    const c = centroid(p);
    spots.push({ partId, x: c.x, y: c.y, widthIn: NaN });
  }
  if (lost.length) regions = union(...lost);

  const t = thinnest(geom, 0, Math.max(1, r * 2));
  // a neck's width is the shrink at which the part first splits
  for (const sp of spots) if (isNaN(sp.widthIn)) sp.widthIn = Math.min(t.w, minFeatureIn);
  if (spots.length && eroded.length > 1) {
    // highlight around each neck
    regions = union(regions, ...spots.map((sp) => bridgeBar({ x: sp.x - r, y: sp.y }, { x: sp.x + r, y: sp.y }, r * 2, 0)));
  }
  return { ok: spots.length === 0, spots, regions, thinnestIn: t.w, thinnestAt: t.at };
}

/**
 * Binary search for the narrowest neck: the largest shrink radius that keeps
 * the part in one piece. Reports width = 2 x radius, capped at 2 x hi.
 */
function thinnest(shape: Shape, lo: number, hi: number): { w: number; at: { x: number; y: number } } {
  const tiny = 1e-5;
  const one = (r: number) => erodedPieces(shape, r, tiny).length === 1;
  if (one(hi)) return { w: hi * 2, at: centroid(shape) };
  let at = centroid(shape);
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (one(mid)) lo = mid;
    else {
      hi = mid;
      const ps = erodedPieces(shape, mid, tiny).sort((a, b) => area(b) - area(a));
      if (ps.length > 1) {
        const cp = closestPoints(simplify(ps[1], 0.003), simplify(ps[0], 0.003));
        at = { x: (cp.a.x + cp.b.x) / 2, y: (cp.a.y + cp.b.y) / 2 };
      } else if (ps.length === 1) at = centroid(ps[0]);
    }
  }
  return { w: lo * 2, at };
}
