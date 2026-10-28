// True-shape nesting: parts fit into each other's empty space, outlines stay the
// spacing apart, grain lock holds, and the panel export turns parts the same way.
import { describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import { runEngine } from '@/lib/engine';
import { bounds } from '@/lib/engine/geom';
import type { Shape } from '@/lib/engine/types';
import { placeTransform } from '@/lib/export/panel';
import { nest, type NestPart, type NestSettings } from '@/lib/nesting/pack';
import { checkTrueShape, nestTrueShape, turn } from '@/lib/nesting/trueshape';
import { defaultDesign, engineDesign, normalizeDesign } from '@/lib/order/design';
import { loadFontFile } from '@/lib/server/fonts';

const S: NestSettings = { marginIn: 0.5, spacingIn: 0.25, allowRotate: false, useOffcutsFirst: true, panelW: 48, panelH: 47.875, minOffcutW: 6, minOffcutH: 12, timeLimitMs: 2000 };
const poly = (...pts: [number, number][]): Shape => [pts.map(([x, y]) => ({ x, y }))];
const part = (key: string, shape: Shape, orderNumber = key): NestPart => {
  const b = bounds(shape);
  return { key, orderId: orderNumber, orderNumber, partId: key, partName: 'Part', w: b.maxX - b.minX, h: b.maxY - b.minY, area: 1, shape };
};
const shapesOf = (parts: NestPart[]) => new Map(parts.map((p) => [p.key, p.shape!]));

describe('true-shape packing', () => {
  test('a small part tucks into the empty corner of an L, where rectangle packing needs a second panel', () => {
    const L = part('L', poly([0, 0], [46, 0], [46, 10], [10, 10], [10, 46], [0, 46]), 'S-1');
    const sq = part('sq', poly([0, 0], [20, 0], [20, 20], [0, 20]), 'S-2');
    const orders = [{ orderId: 'S-1', parts: [L] }, { orderId: 'S-2', parts: [sq] }];
    expect(nest(orders, [], S).bins).toHaveLength(2);
    const r = nestTrueShape(orders, [], S);
    expect(r.bins).toHaveLength(1);
    expect(r.unplaced).toEqual([]);
    expect(checkTrueShape(r.bins[0], shapesOf([L, sq]), S)).toEqual([]);
  });

  test('outlines too close are caught by the exact check', () => {
    const a = part('a', poly([0, 0], [10, 0], [10, 10], [0, 10]));
    const bin = { w: 48, h: 48, label: 'P', placements: [
      { key: 'a', orderId: 'a', orderNumber: 'a', partId: 'a', partName: 'A', x: 1, y: 1, w: 10, h: 10, rotation: 0 as const, area: 1 },
      { key: 'b', orderId: 'b', orderNumber: 'b', partId: 'b', partName: 'B', x: 11.1, y: 1, w: 10, h: 10, rotation: 0 as const, area: 1 },
    ] };
    expect(checkTrueShape(bin, new Map([['a', a.shape!], ['b', a.shape!]]), S)[0]).toMatch(/closer than 0.25/);
    bin.placements[1].x = 11.3;
    expect(checkTrueShape(bin, new Map([['a', a.shape!], ['b', a.shape!]]), S)).toEqual([]);
  });

  test('grain lock: only 0° and 180°', () => {
    const tri = part('t', poly([0, 0], [30, 0], [0, 12]));
    const r = nestTrueShape([1, 2, 3, 4, 5, 6].map((i) => ({ orderId: `S-${i}`, parts: [{ ...tri, key: `t${i}`, orderId: `S-${i}`, orderNumber: `S-${i}` }] })), [], S);
    expect(r.bins.flatMap((b) => b.placements).every((p) => p.rotation === 0 || p.rotation === 180)).toBe(true);
    expect(r.bins.flatMap((b) => b.placements).some((p) => p.rotation === 180)).toBe(true);
  });

  test('the panel export turns a part exactly as the packer did', () => {
    const shape = poly([2, 3], [9, 3], [9, 4], [3, 8]);
    for (const rotation of [0, 90, 180, 270] as const) {
      const f = placeTransform(bounds(shape), { x: 5, y: 7, rotation });
      const viaExport = shape[0].map(f);
      const viaPacker = turn(shape, rotation)[0].map((q) => ({ x: q.x + 5, y: q.y + 7 }));
      viaExport.forEach((q, i) => {
        expect(q.x).toBeCloseTo(viaPacker[i].x, 9);
        expect(q.y).toBeCloseTo(viaPacker[i].y, 9);
      });
    }
  });

  test('real signs: four 30 in names pack without touching, quickly', () => {
    const catalog = seedCatalog(), settings = seedSettings();
    const parts = ['Ava', 'Liam', 'Noah', 'Emma'].map((text) => {
      const d = normalizeDesign({ ...defaultDesign(catalog, settings, 'product.nursery-name'), lines: [{ role: 'main', text, fontId: 'font.pacifico' }], sizeId: 'size.w30' }, catalog);
      const r = runEngine(engineDesign(d, catalog, settings), buildContext(catalog, settings, loadFontFile, d.materialId));
      return part(text, r.parts[0].cut, text);
    });
    const t = Date.now();
    const r = nestTrueShape(parts.map((p) => ({ orderId: p.orderId, parts: [p] })), [], S);
    expect(Date.now() - t).toBeLessThan(15_000);
    expect(r.unplaced).toEqual([]);
    for (const b of r.bins) expect(checkTrueShape(b, shapesOf(parts), S)).toEqual([]);
    expect(r.bins.length).toBeLessThanOrEqual(nest(parts.map((p) => ({ orderId: p.orderId, parts: [p] })), [], S).bins.length);
  });
});
