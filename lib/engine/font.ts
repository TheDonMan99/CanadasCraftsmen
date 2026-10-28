// Font loading and glyph outlines. Glyph shapes are kept in font units (y down,
// baseline at 0) and cached; layout scales them to inches.
//
// Text shaping is done here (character to glyph plus kerning) rather than by
// opentype.js, whose shaper throws on some fonts' substitution tables.

import * as opentype from 'opentype.js';
import { area, pieces, union } from './geom';
import type { Pt, Shape } from './types';

/** Characters treated entirely as floating bits (bridged to the nearest stroke). */
const PUNCTUATION = new Set([...`'’‘"“”.,·:;!¡?¿-–—`]);
/** A glyph component smaller than this share of the glyph's largest component is a floating bit. */
const BIT_AREA_RATIO = 0.5;

export interface GlyphShape {
  char: string;
  advance: number;
  /** All contours, unioned. Font units. */
  shape: Shape;
  /** Main strokes; usually one, more for letters drawn as separate strokes. */
  bodies: Shape[];
  /** Dots, accents and punctuation marks. */
  bits: Shape[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LoadedFont {
  unitsPerEm: number;
  capHeight: number;
  hasChar(ch: string): boolean;
  glyph(ch: string): GlyphShape;
  kerning(left: string, right: string): number;
}

function flattenQuad(out: Pt[], p0: Pt, c: Pt, p1: Pt, tol: number) {
  const dd = Math.hypot(p0.x - 2 * c.x + p1.x, p0.y - 2 * c.y + p1.y);
  const n = Math.max(1, Math.ceil(Math.sqrt(dd / (4 * tol))));
  for (let i = 1; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    out.push({ x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x, y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y });
  }
}

function flattenCubic(out: Pt[], p0: Pt, c1: Pt, c2: Pt, p1: Pt, tol: number) {
  const dd = Math.max(
    Math.hypot(p0.x - 2 * c1.x + c2.x, p0.y - 2 * c1.y + c2.y),
    Math.hypot(c1.x - 2 * c2.x + p1.x, c1.y - 2 * c2.y + p1.y),
  );
  const n = Math.max(1, Math.ceil(Math.sqrt((3 * dd) / (4 * tol))));
  for (let i = 1; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    out.push({ x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y });
  }
}

/** Convert an opentype path (font units, y down) to closed polygons. */
export function pathToShape(path: opentype.Path, tol: number): Shape {
  const contours: Pt[][] = [];
  let cur: Pt[] = [];
  let last: Pt = { x: 0, y: 0 };
  for (const cmd of path.commands as any[]) {
    switch (cmd.type) {
      case 'M':
        if (cur.length > 2) contours.push(cur);
        cur = [{ x: cmd.x, y: cmd.y }];
        last = { x: cmd.x, y: cmd.y };
        break;
      case 'L':
        cur.push({ x: cmd.x, y: cmd.y });
        last = { x: cmd.x, y: cmd.y };
        break;
      case 'Q':
        flattenQuad(cur, last, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x, y: cmd.y }, tol);
        last = { x: cmd.x, y: cmd.y };
        break;
      case 'C':
        flattenCubic(cur, last, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x2, y: cmd.y2 }, { x: cmd.x, y: cmd.y }, tol);
        last = { x: cmd.x, y: cmd.y };
        break;
      case 'Z':
        if (cur.length > 2) contours.push(cur);
        cur = [];
        break;
    }
  }
  if (cur.length > 2) contours.push(cur);
  return contours;
}

export function loadFont(data: ArrayBuffer): LoadedFont {
  const font = opentype.parse(data);
  const upm = font.unitsPerEm;
  const tol = upm * 0.0002;
  const os2 = (font.tables as any).os2;
  let capHeight: number = os2?.sCapHeight ?? 0;
  const cache = new Map<string, GlyphShape>();

  const glyph = (ch: string): GlyphShape => {
    const hit = cache.get(ch);
    if (hit) return hit;
    const g = font.charToGlyph(ch);
    // Raw glyph units: y up in the font, flipped here so y grows downward.
    const raw = pathToShape(g.getPath(0, 0, upm), tol);
    const shape = raw.length ? union(raw) : [];
    const comps = pieces(shape).map((p) => ({ p, a: area(p) }));
    const maxA = Math.max(0, ...comps.map((c) => c.a));
    const bodies: Shape[] = [];
    const bits: Shape[] = [];
    for (const c of comps) {
      if (PUNCTUATION.has(ch) || c.a < maxA * BIT_AREA_RATIO) bits.push(c.p);
      else bodies.push(c.p);
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const path of shape)
      for (const p of path) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    const out: GlyphShape = {
      char: ch,
      advance: g.advanceWidth ?? 0,
      shape,
      bodies,
      bits,
      minX: isFinite(minX) ? minX : 0,
      maxX: isFinite(maxX) ? maxX : 0,
      minY: isFinite(minY) ? minY : 0,
      maxY: isFinite(maxY) ? maxY : 0,
    };
    cache.set(ch, out);
    return out;
  };

  if (!capHeight) {
    const h = glyph('H');
    capHeight = -h.minY || upm * 0.7;
  }

  return {
    unitsPerEm: upm,
    capHeight,
    hasChar: (ch) => ch === ' ' || font.hasChar(ch),
    glyph,
    kerning: (l, r) => {
      try {
        return font.getKerningValue(font.charToGlyph(l), font.charToGlyph(r)) || 0;
      } catch {
        return 0;
      }
    },
  };
}
