// Step 3 of the pipeline: connect a line's letters into one piece, plus the
// floating-bit and line-joining steps. Pure functions over positioned shapes.

import {
  area,
  bounds,
  boundsOverlap,
  bridgeBar,
  closestPoints,
  intersect,
  offset,
  rect,
  simplify,
  union,
} from './geom';
import type { Element } from './layout';
import type { Bounds, EngineSettings, FloatingBits, Pt, Shape } from './types';

const MIN_CONTACT_AREA = 1e-6; // in²
/** A weld's contact must be this many times the minimum feature width long. */
export const JOINT_FACTOR = 1.5;

/** A bridge or bar the engine added, kept so checks and previews can tell it from letters. */
export interface Connector {
  kind: 'bar' | 'bridge' | 'dot_bridge' | 'spine' | 'foot' | 'stencil_bridge';
  shape: Shape;
  a?: Pt;
  b?: Pt;
  widthIn: number;
}

export interface Node {
  shape: Shape;
  eroded: Shape;
  bounds: Bounds;
  chars: string;
}

export function makeNode(shape: Shape, chars: string, overlapIn: number): Node {
  return { shape, eroded: offset(shape, -overlapIn / 2), bounds: bounds(shape), chars };
}

/**
 * Group nodes that touch with at least `overlapIn` of depth. Two shapes count as
 * welded when both, shrunk by half the overlap, still intersect, and the contact
 * is at least `minJointIn` long, so a weld isn't a hair-thin neck.
 */
export function components(nodes: Node[], minJointIn = 0): number[][] {
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      if (find(i) === find(j)) continue;
      if (!boundsOverlap(nodes[i].bounds, nodes[j].bounds)) continue;
      const contact = intersect(nodes[i].eroded, nodes[j].eroded);
      if (area(contact) <= MIN_CONTACT_AREA) continue;
      const cb = bounds(contact);
      if (Math.hypot(cb.maxX - cb.minX, cb.maxY - cb.minY) >= minJointIn) parent[find(i)] = find(j);
    }
  const groups = new Map<number, number[]>();
  nodes.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

export function bodyNodes(elements: Element[], overlapIn: number): Node[] {
  return elements.filter((e) => e.kind === 'body').map((e) => makeNode(e.shape, e.char, overlapIn));
}

/** Weld test: are all bodies of the line connected by real overlap? */
export function isWelded(elements: Element[], overlapIn: number, minJointIn = 0): boolean {
  return components(bodyNodes(elements, overlapIn), minJointIn).length <= 1;
}

/** Baseline bar through the bottom of the letters, trimmed to the first and last letter. */
export function baselineBar(elements: Element[], baselineY: number, s: EngineSettings): Connector | null {
  const bodies = union(...elements.filter((e) => e.kind === 'body').map((e) => e.shape));
  const half = s.baseline_bar_in / 2;
  const b = bounds(bodies);
  const band = intersect(bodies, rect(b.minX - 1, baselineY - half, b.maxX + 1, baselineY + half));
  if (!band.length) return null;
  const bb = bounds(band);
  if (bb.maxX - bb.minX <= 0) return null;
  return { kind: 'bar', shape: rect(bb.minX, baselineY - half, bb.maxX, baselineY + half), widthIn: s.baseline_bar_in };
}

/**
 * Bridge separate groups together at their closest points, largest group first.
 * Returns the bridges added, or the groups still loose when a gap is too long.
 */
export function bridgeGroups(
  groups: { shape: Shape; chars: string }[],
  widthIn: number,
  s: EngineSettings,
  kind: Connector['kind'] = 'bridge',
): { bridges: Connector[]; loose: string[] } {
  if (groups.length <= 1) return { bridges: [], loose: [] };
  const sorted = [...groups].sort((a, b) => area(b.shape) - area(a.shape));
  let main = sorted[0].shape;
  let mainSimple = simplify(main, 0.005);
  const rest = sorted.slice(1).map((g) => ({ ...g, simple: simplify(g.shape, 0.005) }));
  const bridges: Connector[] = [];
  while (rest.length) {
    let bestI = -1;
    let best = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, d: Infinity };
    rest.forEach((g, i) => {
      const cp = closestPoints(g.simple, mainSimple);
      if (cp.d < best.d) { best = cp; bestI = i; }
    });
    if (best.d > s.max_bridge_length_in) return { bridges, loose: rest.map((g) => g.chars) };
    const g = rest.splice(bestI, 1)[0];
    const bar = bridgeBar(best.a, best.b, widthIn, widthIn / 2 + s.weld_overlap_in);
    bridges.push({ kind, shape: bar, a: best.a, b: best.b, widthIn });
    main = union(main, g.shape, bar);
    mainSimple = simplify(main, 0.005);
  }
  return { bridges, loose: [] };
}

/** Attach floating bits (dots, apostrophes, accents) to the nearest stroke. */
export function attachBits(
  base: Shape,
  bits: Element[],
  mode: FloatingBits,
  s: EngineSettings,
): { shape: Shape; connectors: Connector[] } {
  if (mode === 'remove' || bits.length === 0) return { shape: base, connectors: [] };
  let shape = base;
  const connectors: Connector[] = [];
  // measure to the letters themselves, so each dot gets its own bridge to a stroke
  const strokes = simplify(base, 0.003);
  const strokesEroded = offset(base, -s.weld_overlap_in / 2);
  for (const bit of bits) {
    const node = makeNode(bit.shape, bit.char, s.weld_overlap_in);
    if (area(intersect(node.eroded, strokesEroded)) > MIN_CONTACT_AREA) {
      shape = union(shape, bit.shape);
      continue;
    }
    const cp = closestPoints(simplify(bit.shape, 0.003), strokes);
    if (mode === 'merge') {
      const len = cp.d || 1;
      const move = cp.d + s.weld_overlap_in * 2;
      const dx = ((cp.b.x - cp.a.x) / len) * move, dy = ((cp.b.y - cp.a.y) / len) * move;
      shape = union(shape, bit.shape.map((p) => p.map((q) => ({ x: q.x + dx, y: q.y + dy }))));
    } else {
      const w = s.dot_bridge_width_in;
      const bar = bridgeBar(cp.a, cp.b, w, w / 2 + s.weld_overlap_in);
      connectors.push({ kind: 'dot_bridge', shape: bar, a: cp.a, b: cp.b, widthIn: w });
      shape = union(shape, bit.shape, bar);
    }
  }
  return { shape, connectors };
}

/**
 * Join stacked lines with bridges: two per gap (left and right half of the
 * narrower line) so the sign doesn't pivot on a single tab.
 */
export function joinLines(upper: Shape, lower: Shape, s: EngineSettings): Connector[] {
  const ub = bounds(upper), lb = bounds(lower);
  const narrow = ub.maxX - ub.minX < lb.maxX - lb.minX ? 'upper' : 'lower';
  const nb = narrow === 'upper' ? ub : lb;
  const mid = (nb.minX + nb.maxX) / 2;
  const us = simplify(upper, 0.005), ls = simplify(lower, 0.005);
  const out: Connector[] = [];
  const w = s.bridge_width_in;
  for (const side of [(p: Pt) => p.x <= mid, (p: Pt) => p.x >= mid]) {
    const cp = narrow === 'upper' ? closestPoints(us, ls, side) : flip(closestPoints(ls, us, side));
    if (!isFinite(cp.d)) continue;
    if (out.length && Math.hypot(cp.a.x - out[0].a!.x, cp.a.y - out[0].a!.y) < w * 2) continue;
    out.push({ kind: 'bridge', shape: bridgeBar(cp.a, cp.b, w, w / 2 + s.weld_overlap_in), a: cp.a, b: cp.b, widthIn: w });
  }
  return out;
}

const flip = (cp: { a: Pt; b: Pt; d: number }) => ({ a: cp.b, b: cp.a, d: cp.d });
