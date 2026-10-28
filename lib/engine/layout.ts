// Step 1 and 2 of the pipeline: lay out text lines from font outlines, then scale.
//
// Scale is expressed as `s` = the main line's cap height in inches. Every line's
// letter height is a ratio of that, so the whole layout is linear in `s` and the
// ordered width fixes it directly.

import type { LoadedFont } from './font';
import { offset, scale as scaleShape, translate } from './geom';
import type { DesignLine, EngineContext, Shape } from './types';

export interface PlacedGlyph {
  char: string;
  charIndex: number;
  /** Pen position in font units. */
  x: number;
}

export interface LineLayout {
  line: DesignLine;
  lineIndex: number;
  font: LoadedFont;
  /** Inches per font unit when s = 1. */
  k: number;
  ratio: number;
  glyphs: PlacedGlyph[];
  trackingPct: number;
  /** Ink extents in font units relative to the pen origin and baseline. */
  inkMinX: number;
  inkMaxX: number;
  inkMinY: number;
  inkMaxY: number;
  avgAdvance: number;
  thickenIn: number;
}

/** One cuttable element of a line, positioned in inches. */
export interface Element {
  kind: 'body' | 'bit';
  char: string;
  charIndex: number;
  lineIndex: number;
  shape: Shape;
}

export interface PositionedLine {
  layout: LineLayout;
  baselineY: number;
  offsetX: number;
  elements: Element[];
  /** Ink box in inches. */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function lineRatio(line: DesignLine, ctx: EngineContext): number {
  if (line.sizeRatio) return line.sizeRatio;
  if (line.role === 'top') return ctx.settings.top_line_ratio;
  if (line.role === 'small') return ctx.settings.small_line_ratio;
  return 1;
}

export function layoutLine(line: DesignLine, lineIndex: number, ctx: EngineContext, trackingPct: number, ratio = lineRatio(line, ctx)): LineLayout {
  const entry = ctx.fonts[line.fontId];
  const font = entry.font;
  const chars = [...line.text];
  const nonSpace = chars.filter((c) => c.trim());
  const avgAdvance = nonSpace.length ? nonSpace.reduce((a, c) => a + font.glyph(c).advance, 0) / nonSpace.length : font.unitsPerEm / 2;
  const tracking = -(trackingPct / 100) * avgAdvance;
  const glyphs: PlacedGlyph[] = [];
  let x = 0;
  let inkMinX = Infinity, inkMaxX = -Infinity, inkMinY = Infinity, inkMaxY = -Infinity;
  chars.forEach((ch, i) => {
    const g = font.glyph(ch);
    glyphs.push({ char: ch, charIndex: i, x });
    if (g.shape.length) {
      inkMinX = Math.min(inkMinX, x + g.minX);
      inkMaxX = Math.max(inkMaxX, x + g.maxX);
      inkMinY = Math.min(inkMinY, g.minY);
      inkMaxY = Math.max(inkMaxY, g.maxY);
    }
    if (i < chars.length - 1) x += g.advance + font.kerning(ch, chars[i + 1]) + tracking;
  });
  if (inkMinX === Infinity) inkMinX = inkMaxX = inkMinY = inkMaxY = 0;
  return {
    line,
    lineIndex,
    font,
    k: ratio / font.capHeight,
    ratio,
    glyphs,
    trackingPct,
    inkMinX,
    inkMaxX,
    inkMinY,
    inkMaxY,
    avgAdvance,
    thickenIn: entry.spec.autoThickenIn,
  };
}

/** Ink width in inches at s = 1. */
export const inkWidth1 = (l: LineLayout) => (l.inkMaxX - l.inkMinX) * l.k;
export const inkHeight1 = (l: LineLayout) => (l.inkMaxY - l.inkMinY) * l.k;

/** Build the glyph elements of one line at scale s, with the pen origin at (ox, baseline). */
export function placeLine(l: LineLayout, s: number, ox: number, baselineY: number): Element[] {
  const f = l.k * s;
  const out: Element[] = [];
  for (const pg of l.glyphs) {
    const g = l.font.glyph(pg.char);
    const place = (shape: Shape) => {
      const placed = translate(scaleShape(shape, f), ox + pg.x * f, baselineY);
      return l.thickenIn > 0 ? offset(placed, l.thickenIn) : placed;
    };
    for (const b of g.bodies) out.push({ kind: 'body', char: pg.char, charIndex: pg.charIndex, lineIndex: l.lineIndex, shape: place(b) });
    for (const b of g.bits) out.push({ kind: 'bit', char: pg.char, charIndex: pg.charIndex, lineIndex: l.lineIndex, shape: place(b) });
  }
  return out;
}

/**
 * Stack lines top to bottom and centre them horizontally on x = 0.
 * Gaps are line_spacing_ratio x main letter height (= s).
 */
export function stackLines(layouts: LineLayout[], s: number, ctx: EngineContext): PositionedLine[] {
  const gap = ctx.settings.line_spacing_ratio * s;
  const out: PositionedLine[] = [];
  let y = 0;
  layouts.forEach((l, i) => {
    const f = l.k * s;
    const top = l.inkMinY * f;
    const bottom = l.inkMaxY * f;
    if (i > 0) y += gap;
    const baselineY = y - top;
    const w = (l.inkMaxX - l.inkMinX) * f;
    const ox = -w / 2 - l.inkMinX * f;
    out.push({
      layout: l,
      baselineY,
      offsetX: ox,
      elements: placeLine(l, s, ox, baselineY),
      top: y,
      bottom: baselineY + bottom,
      left: -w / 2,
      right: w / 2,
    });
    y = baselineY + bottom;
  });
  return out;
}

/** Width and height of the stacked text block at s = 1 (excluding thicken). */
export function blockSize1(layouts: LineLayout[], ctx: EngineContext): { w: number; h: number } {
  const w = Math.max(0, ...layouts.map(inkWidth1));
  const h = layouts.reduce((a, l) => a + inkHeight1(l), 0) + ctx.settings.line_spacing_ratio * Math.max(0, layouts.length - 1);
  return { w, h };
}
