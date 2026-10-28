// The panel packer: everything inside the usable area and apart, orders kept
// together, grain lock, offcuts first, leftovers worth keeping.
import { describe, expect, test } from 'vitest';
import { checkLayout, leftovers, nest, type BinSpec, type NestPart, type NestSettings } from '@/lib/nesting/pack';

const S: NestSettings = { marginIn: 0.5, spacingIn: 0.25, allowRotate: false, useOffcutsFirst: true, panelW: 48, panelH: 47.875, minOffcutW: 6, minOffcutH: 12, timeLimitMs: 2000 };
let n = 0;
const part = (orderNumber: string, w: number, h: number, name = 'Word'): NestPart => ({ key: `${orderNumber}:${++n}`, orderId: orderNumber, orderNumber, partId: `p${n}`, partName: name, w, h, area: w * h * 0.5 });
const order = (num: string, ...parts: [number, number][]) => ({ orderId: num, parts: parts.map(([w, h]) => part(num, w, h)) });

function valid(r: ReturnType<typeof nest>, s = S) {
  for (const b of r.bins) expect(checkLayout(b, s), b.label).toEqual([]);
}

describe('packing', () => {
  test('four 36 in signs fit two to a panel, on one sheet', () => {
    const orders = ['S-1', 'S-2', 'S-3', 'S-4'].map((num) => order(num, [36, 17]));
    const r = nest(orders, [], S);
    valid(r);
    expect(r.newSheets).toBe(1);
    expect(r.bins.map((b) => [b.label, b.placements.length])).toEqual([['Sheet 1 Panel A', 2], ['Sheet 1 Panel B', 2]]);
    expect(r.unplaced).toEqual([]);
    expect(r.sparePanelsLeft).toBe(0);
    expect(r.utilization).toBeGreaterThan(0.2);
  });

  test('an order’s parts stay on one panel when they fit', () => {
    const orders = [order('S-1', [40, 30]), order('S-2', [20, 10], [20, 10], [20, 10], [20, 10])];
    const r = nest(orders, [], S);
    valid(r);
    const binsFor = (num: string) => new Set(r.bins.filter((b) => b.placements.some((p) => p.orderNumber === num)).map((b) => b.id));
    expect(binsFor('S-2').size).toBe(1);
  });

  test('grain lock: no quarter turns; without it a tall part can turn to fit', () => {
    const tall = [order('S-1', [10, 46.5])];
    const locked = nest([order('S-1', [46.5, 10]), order('S-2', [46.5, 10])], [], S);
    expect(locked.bins.flatMap((b) => b.placements).every((p) => p.rotation === 0)).toBe(true);
    const free = nest(tall, [], { ...S, allowRotate: true });
    valid(free, { ...S, allowRotate: true });
    expect(free.unplaced).toEqual([]);
  });

  test('a part bigger than a panel is reported, not placed', () => {
    const r = nest([order('S-1', [50, 10])], [], S);
    expect(r.unplaced[0]).toMatchObject({ orderNumber: 'S-1', reason: expect.stringContaining('bigger than a panel') });
    expect(r.bins).toEqual([]);
  });

  test('offcuts first, then spare panels, then new sheets', () => {
    const bins: BinSpec[] = [
      { id: 'spare1', kind: 'spare', label: 'Spare panel 1', w: 48, h: 47.875 },
      { id: 'off1', kind: 'offcut', label: 'Offcut 20 × 14', w: 20, h: 14, offcutId: 'off-uuid' },
    ];
    const r = nest([order('S-1', [12, 8]), order('S-2', [36, 17])], bins, S);
    valid(r);
    expect(r.bins.map((b) => [b.kind, b.placements.map((p) => p.orderNumber)])).toEqual([
      ['offcut', ['S-1']],
      ['spare', ['S-2']],
    ]);
    expect(r).toMatchObject({ newSheets: 0, sparePanelsUsed: 1, offcutsUsed: ['off-uuid'] });
  });

  test('a lone sign uses Panel A and leaves Panel B as a spare', () => {
    const r = nest([order('S-1', [36, 17])], [], S);
    expect(r).toMatchObject({ newSheets: 1, sparePanelsLeft: 1 });
  });

  test('many small parts fill gaps on a panel', () => {
    const orders = [order('S-1', [44, 20]), ...Array.from({ length: 12 }, (_, i) => order(`S-${i + 2}`, [6, 5]))];
    const r = nest(orders, [], S);
    valid(r);
    expect(r.bins).toHaveLength(1);
  });
});

describe('checkLayout and leftovers', () => {
  test('overlapping or out-of-bounds parts are caught', () => {
    const p = (x: number, y: number) => ({ key: `${x}`, orderId: 'o', orderNumber: 'S-1', partId: 'w', partName: 'Word', x, y, w: 10, h: 10, rotation: 0 as const, area: 50 });
    expect(checkLayout({ w: 48, h: 48, label: 'P', placements: [p(1, 1), p(11.1, 1)] }, S)[0]).toMatch(/closer than 0.25/);
    expect(checkLayout({ w: 48, h: 48, label: 'P', placements: [p(0.2, 1)] }, S)[0]).toMatch(/outside/);
    expect(checkLayout({ w: 48, h: 48, label: 'P', placements: [p(1, 1), p(11.25, 1)] }, S)).toEqual([]);
  });
  test('the big free area under a sign is kept as an offcut', () => {
    const r = nest([order('S-1', [36, 17])], [], S);
    const offs = leftovers(r.bins[0], S);
    expect(offs.length).toBeGreaterThan(0);
    const biggest = offs[0];
    expect(biggest.w * biggest.h).toBeGreaterThan(48 * 25);
    expect(Math.min(biggest.w, biggest.h)).toBeGreaterThanOrEqual(6);
  });
  test('scraps smaller than 6 × 12 in are not kept', () => {
    const full = { w: 20, h: 14, placements: [{ key: 'a', orderId: 'o', orderNumber: 'S-1', partId: 'w', partName: 'Word', x: 0.5, y: 0.5, w: 18.5, h: 12.5, rotation: 0 as const, area: 1 }] };
    expect(leftovers(full, S)).toEqual([]);
  });
});
