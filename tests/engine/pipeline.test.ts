// One test group per pipeline step, from geometry helpers to the final report.
import { describe, expect, test } from 'vitest';
import { runEngine, type Design, type EngineContext } from '@/lib/engine';
import { area, bounds, bridgeBar, closestPoints, difference, intersect, offset, pieces, rect, union } from '@/lib/engine/geom';
import { layoutLine } from '@/lib/engine/layout';
import { makeCtx } from './fixtures';

const ctx = makeCtx();
const withSettings = (patch: Partial<EngineContext['settings']>): EngineContext => ({ ...ctx, settings: { ...ctx.settings, ...patch } });
const one = (text: string, fontId: string, widthIn: number, extra: Partial<Design> = {}): Design => ({
  layout: 'horizontal', style: 'one_piece', widthIn, lines: [{ role: 'main', text, fontId }], ...extra,
});

describe('geometry helpers', () => {
  test('union merges shapes of opposite winding instead of cancelling them', () => {
    const a = rect(0, 0, 2, 1);
    const b = [[...rect(1, 0, 3, 1)[0]].reverse()];
    expect(area(union(a, b))).toBeCloseTo(3, 4);
    expect(pieces(union(a, b))).toHaveLength(1);
  });
  test('pieces treats an island inside a hole as its own piece', () => {
    const ring = difference(rect(0, 0, 10, 10), rect(2, 2, 8, 8));
    expect(pieces(union(ring, rect(4, 4, 6, 6)))).toHaveLength(2);
  });
  test('offset grows a square by the given distance', () => {
    const b = bounds(offset(rect(0, 0, 2, 2), 0.1, 'miter'));
    expect(b.maxX - b.minX).toBeCloseTo(2.2, 3);
  });
  test('closest points between two shapes', () => {
    const cp = closestPoints(rect(0, 0, 1, 1), rect(3, 0, 4, 1));
    expect(cp.d).toBeCloseTo(2, 6);
  });
  test('a bridge bar has the requested width', () => {
    const bar = bridgeBar({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.25, 0);
    expect(area(bar)).toBeCloseTo(0.5, 4);
  });
});

describe('fonts and text layout', () => {
  test('i dots, accents and apostrophes are floating bits', () => {
    const f = ctx.fonts['font.pacifico'].font;
    expect(f.glyph('i').bits.length).toBe(1);
    expect(f.glyph('ë').bits.length).toBe(2);
    expect(f.glyph("'").bodies.length).toBe(0);
    expect(f.glyph('o').bits.length).toBe(0);
  });
  test('tracking pulls letters closer together', () => {
    const l0 = layoutLine({ role: 'main', text: 'Liam', fontId: 'font.bebas-neue' }, 0, ctx, 0);
    const l10 = layoutLine({ role: 'main', text: 'Liam', fontId: 'font.bebas-neue' }, 0, ctx, 10);
    expect(l10.inkMaxX - l10.inkMinX).toBeLessThan(l0.inkMaxX - l0.inkMinX);
  });
  test('the layout scales to exactly the ordered width', () => {
    for (const w of [12, 24, 36, 44]) expect(runEngine(one('Ava', 'font.pacifico', w), ctx).widthIn).toBeCloseTo(w, 3);
  });
  test('lines stack with the main line largest', () => {
    const r = runEngine({ layout: 'horizontal', style: 'one_piece', widthIn: 36, lines: [{ role: 'main', text: 'Welcome', fontId: 'font.lobster' }, { role: 'small', text: 'Est. 2019', fontId: 'font.montserrat-bold' }] }, ctx);
    expect(r.report.lines[0].letterHeightIn).toBeGreaterThan(r.report.lines[1].letterHeightIn * 3);
  });
});

describe('connecting into one piece', () => {
  test('weld: a connected script is welded where letters overlap', () => {
    const r = runEngine(one('Welcome', 'font.pacifico', 36), ctx);
    expect(r.report.lines[0].method).toBe('weld');
    expect(r.report.pieceCount).toBe(1);
  });
  test('tighten: letter spacing is reduced until neighbours overlap', () => {
    const r = runEngine(one('Zoë', 'font.dancing-script-bold', 24), ctx);
    expect(r.report.lines[0].method).toBe('tighten');
    expect(r.report.lines[0].tightenPct).toBeGreaterThan(0);
    expect(r.report.lines[0].tightenPct).toBeLessThanOrEqual(ctx.settings.max_tighten_pct);
    expect(r.ok).toBe(true);
  });
  test('baseline bar: block letters are joined by a bar along the bottom', () => {
    const r = runEngine(one('Liam', 'font.bebas-neue', 24), ctx);
    expect(r.report.lines[0].method).toBe('baseline_bar');
    expect(r.ok).toBe(true);
  });
  test('bridges: separate pieces get tabs at their closest points', () => {
    // with tightening and the bar ruled out, block letters fall through to bridges
    const r = runEngine(one('Liam', 'font.bebas-neue', 24), withSettings({ max_tighten_pct: 0, baseline_bar_in: 0.0001 }));
    expect(r.report.lines[0].method).toBe('bridges');
    expect(r.report.bridges).toBeGreaterThanOrEqual(3);
    expect(r.report.pieceCount).toBe(1);
  });
  test('lines joined: stacked lines are bridged together', () => {
    const r = runEngine({ layout: 'horizontal', style: 'one_piece', widthIn: 36, lines: [{ role: 'main', text: 'Welcome', fontId: 'font.lobster' }, { role: 'small', text: 'Est. 2019', fontId: 'font.montserrat-bold' }] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.report.pieceCount).toBe(1);
    expect(r.report.bridges).toBeGreaterThanOrEqual(2);
  });
  test('fail: loose letters are named and letters on backer suggested', () => {
    const strict = withSettings({ max_tighten_pct: 0, baseline_bar_in: 0.0001, max_bridge_length_in: 0.001 });
    const r = runEngine(one('Liam', 'font.bebas-neue', 24), strict);
    expect(r.ok).toBe(false);
    const f = r.failures.find((x) => x.code === 'not_one_piece')!;
    expect(f.message).toMatch(/letters on backer/i);
    expect((f.detail!.loose as string[]).length).toBeGreaterThan(0);
  });
});

describe('floating bits', () => {
  const dots = (mode: Design['floatingBits']) => runEngine(one('Zoë', 'font.dancing-script-bold', 36, { floatingBits: mode }), ctx);
  test('bridge (default): dots are bridged to the nearest stroke', () => {
    const r = dots('bridge');
    expect(r.report.pieceCount).toBe(1);
    expect(r.report.bridges).toBe(2);
  });
  test('merge: dots are moved onto the stroke', () => {
    const r = dots('merge');
    expect(r.report.pieceCount).toBe(1);
    expect(r.report.bridges).toBe(0);
  });
  test('remove: dots are dropped', () => {
    const withDots = dots('bridge'), without = dots('remove');
    expect(without.report.pieceCount).toBe(1);
    expect(without.report.partAreaIn2).toBeLessThan(withDots.report.partAreaIn2);
  });
  test("apostrophes are bridged too (O'Brien)", () => {
    const r = runEngine(one("O'Brien", 'font.montserrat-bold', 36), ctx);
    expect(r.report.pieceCount).toBe(1);
  });
});

describe('construction styles', () => {
  test('layered: word plus an outline layer 0.25 in larger', () => {
    const r = runEngine(one('Olivia', 'font.pacifico', 36, { style: 'layered' }), ctx);
    expect(r.parts.map((p) => p.role)).toEqual(['word', 'outline']);
    const top = r.parts[0].bounds, out = r.parts[1].bounds;
    expect(top.minX - out.minX).toBeCloseTo(0.25, 2);
    expect(r.widthIn).toBeCloseTo(36, 2);
    expect(r.ok).toBe(true);
  });
  test('letters on backer: one backer plus each letter listed, with a placement guide', () => {
    const r = runEngine(one('LIAM', 'font.bebas-neue', 24, { style: 'letters_on_backer', backer: { shape: 'rectangle' } }), ctx);
    expect(r.parts.filter((p) => p.role === 'backer')).toHaveLength(1);
    expect(r.parts.filter((p) => p.role === 'letters').map((p) => p.chars).sort()).toEqual(['A', 'I', 'L', 'M']);
    expect(r.score.length).toBeGreaterThan(0);
    expect(r.widthIn).toBeCloseTo(24, 2);
    expect(r.ok).toBe(true);
  });
  test.each(['rectangle', 'rounded_rectangle', 'plank', 'arch_top', 'oval', 'circle'] as const)('backer shape %s is built at the ordered width', (shape) => {
    const r = runEngine(one('Ava', 'font.pacifico', 18, { style: 'letters_on_backer', backer: { shape } }), ctx);
    expect(r.widthIn).toBeCloseTo(18, 1);
    expect(r.ok).toBe(true);
    if (shape === 'plank') expect(r.scoreLines.length).toBeGreaterThan(0);
  });
  test('stencil: one panel, with bridges holding letter centres in', () => {
    const r = runEngine(one('HOME', 'font.montserrat-bold', 24, { style: 'stencil' }), ctx);
    expect(r.parts).toHaveLength(1);
    expect(pieces(r.parts[0].shape)).toHaveLength(1);
    expect(r.ok).toBe(true);
  });
  test('stencil: a letter centre without a bridge is a failure', () => {
    const r = runEngine(one('HOME', 'font.montserrat-bold', 24, { style: 'stencil' }), withSettings({ stencil_bridges_per_hole: 0 }));
    expect(r.failures.map((f) => f.code)).toContain('loose_centres');
  });
});

describe('vertical porch leaners', () => {
  test('block font: spine bar, flat foot, exact height', () => {
    const r = runEngine({ layout: 'vertical', style: 'one_piece', heightIn: 46, lines: [{ role: 'main', text: 'WELCOME', fontId: 'font.bebas-neue' }] }, ctx);
    expect(r.heightIn).toBeCloseTo(46, 2);
    expect(r.ok).toBe(true);
    expect(r.report.lines[0].letterHeightIn).toBeGreaterThan(5);
    // the foot makes the bottom edge flat and as wide as the widest letter
    const foot = bounds(intersect(r.parts[0].shape, rect(-1, 45.9, 100, 46.1)));
    expect(foot.maxX - foot.minX).toBeGreaterThan(r.widthIn * 0.8);
  });
  test('script font: letters overlap vertically into one piece', () => {
    const r = runEngine({ layout: 'vertical', style: 'one_piece', heightIn: 46, lines: [{ role: 'main', text: 'HOME', fontId: 'font.pacifico' }] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.heightIn).toBeCloseTo(46, 2);
  });
  test('optional family name across the bottom', () => {
    const r = runEngine({ layout: 'vertical', style: 'one_piece', heightIn: 46, lines: [{ role: 'main', text: 'HOME', fontId: 'font.pacifico' }, { role: 'small', text: 'The Smiths', fontId: 'font.montserrat-bold' }] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.report.lines).toHaveLength(2);
    expect(r.report.pieceCount).toBe(1);
  });
});

describe('extras', () => {
  test('keyholes: two slots on one row near 25% and 75% of the width', () => {
    const r = runEngine(one('Welcome', 'font.pacifico', 36, { keyholes: true }), ctx);
    const k = r.report.keyholes;
    expect(k).toHaveLength(2);
    expect(k[0].y).toBeCloseTo(k[1].y, 6);
    expect(Math.abs(k[0].x - 9)).toBeLessThan(36 * 0.1 + 0.01);
    expect(Math.abs(k[1].x - 27)).toBeLessThan(36 * 0.1 + 0.01);
    // the slots are holes in the part
    const plain = runEngine(one('Welcome', 'font.pacifico', 36), ctx);
    expect(r.parts[0].shape.length).toBeGreaterThan(plain.parts[0].shape.length);
  });
  test('engraved small line goes on the engrave layer of a backer', () => {
    const r = runEngine({ layout: 'horizontal', style: 'letters_on_backer', widthIn: 30, lines: [{ role: 'main', text: 'Smith', fontId: 'font.bebas-neue' }, { role: 'small', text: 'Est. 2019', fontId: 'font.montserrat-bold', engraved: true }] }, ctx);
    expect(r.engrave.length).toBeGreaterThan(0);
    expect(r.parts.filter((p) => p.role === 'letters').map((p) => p.chars).join('')).not.toContain('2019');
    expect(r.ok).toBe(true);
  });
  test('engraved small line needs a backer', () => {
    const r = runEngine({ layout: 'horizontal', style: 'one_piece', widthIn: 30, lines: [{ role: 'main', text: 'Smith', fontId: 'font.pacifico' }, { role: 'small', text: 'Est. 2019', fontId: 'font.montserrat-bold', engraved: true }] }, ctx);
    expect(r.failures.map((f) => f.code)).toContain('engraved_needs_backer');
  });
});

describe('kerf and clean up', () => {
  const r = runEngine(one('Ava', 'font.pacifico', 24), ctx);
  test('cut paths are offset outward by half the kerf', () => {
    const s = r.parts[0].bounds, c = bounds(r.parts[0].cut);
    expect(s.minX - c.minX).toBeCloseTo(ctx.material.kerfIn / 2, 3);
    expect(c.maxX - s.maxX).toBeCloseTo(ctx.material.kerfIn / 2, 3);
  });
  test('holes shrink by half the kerf', () => {
    const shapeHoles = r.parts[0].shape.filter((p) => area([p]) > 0).length;
    expect(area(r.parts[0].cut)).toBeGreaterThan(area(r.parts[0].shape));
    expect(shapeHoles).toBeGreaterThan(0);
  });
  test('every path is closed with no repeated points', () => {
    for (const p of r.parts)
      for (const path of p.cut) {
        expect(path.length).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < path.length; i++) expect(path[i].x !== path[i - 1].x || path[i].y !== path[i - 1].y).toBe(true);
      }
  });
});

describe('checks and report', () => {
  test('report lists size, piece count, cut length, area and laser minutes', () => {
    const r = runEngine(one('Welcome', 'font.pacifico', 36), ctx);
    expect(r.report.widthIn).toBeCloseTo(36, 3);
    expect(r.report.heightIn).toBeGreaterThan(5);
    expect(r.report.pieceCount).toBe(1);
    expect(r.report.cutLengthIn).toBeGreaterThan(72);
    expect(r.report.partAreaIn2).toBeGreaterThan(10);
    expect(r.report.laserMinutes).toBeGreaterThan(1);
    expect(r.report.thinnest!.widthIn).toBeGreaterThanOrEqual(ctx.material.minFeatureIn);
  });
  test('thin sections are reported with their location', () => {
    const r = runEngine(one("O'Brien", 'font.playfair-display-bold', 24), ctx);
    const f = r.failures.find((x) => x.code === 'thin_section')!;
    const spots = f.detail!.spots as { x: number; y: number }[];
    expect(spots.length).toBeGreaterThan(0);
    expect(spots[0].x).toBeGreaterThanOrEqual(0);
    expect(spots[0].x).toBeLessThanOrEqual(24);
    expect(r.thinRegions.length).toBeGreaterThan(0);
  });
  test('letters below the minimum height suggest the next size up', () => {
    const r = runEngine(one('Montgomery Fairbanks', 'font.montserrat-bold', 12), ctx);
    expect(r.failures.find((f) => f.code === 'letters_too_small')!.message).toMatch(/next size up/);
  });
  test('signs taller than the largest sign are refused', () => {
    const r = runEngine(one('I', 'font.montserrat-bold', 12), ctx);
    expect(r.failures.map((f) => f.code)).toContain('too_tall');
  });
  test('too many characters, missing characters and line rules are reported', () => {
    expect(runEngine(one('A'.repeat(21), 'font.montserrat-bold', 44), ctx).failures.map((f) => f.code)).toContain('too_many_chars');
    expect(runEngine(one('Ava ☃', 'font.pacifico', 24), ctx).failures.map((f) => f.code)).toContain('missing_glyphs');
    expect(runEngine(one('Ava', 'font.oswald', 24), ctx).failures.map((f) => f.code)).toContain('font_not_allowed_for_line');
  });
  test('empty text returns no geometry', () => {
    const r = runEngine(one('  ', 'font.pacifico', 24), ctx);
    expect(r.ok).toBe(false);
    expect(r.parts).toHaveLength(0);
  });
});
