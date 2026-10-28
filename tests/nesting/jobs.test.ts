// Nest jobs against a real Postgres (PGlite) and the real engine: four paid
// orders nest onto panels, panel files are true size with order labels, marking
// as cut lowers inventory and saves an offcut, and the next run uses it first.
import { beforeEach, describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { getOwnerOrder, recordPayment } from '@/lib/db/admin';
import type { Db } from '@/lib/db/client';
import { getInventory, getJob, nestableOrders, openOffcuts, setInventory } from '@/lib/db/nesting';
import { createOrder } from '@/lib/db/orders';
import { defaultDesign, designLabels, engineDesign, normalizeDesign } from '@/lib/order/design';
import { loadFontFile } from '@/lib/server/fonts';
import { adjustLayout, cutJob, nextBatch, panelFile, planJob, type Deps } from '@/lib/server/nesting';
import { freshDb } from '../db/pglite';

const catalog = seedCatalog();
const settings = seedSettings();
let db: Db;
let deps: Deps;
const uploads: string[] = [];

async function paidOrder(text: string, sizeId = 'size.w36', neededBy = '2026-11-20') {
  const d = normalizeDesign({ ...defaultDesign(catalog, settings, 'product.nursery-name'), lines: [{ role: 'main', text, fontId: 'font.pacifico' }], sizeId }, catalog);
  const o = await createOrder(db, {
    customer: { name: `${text} Parent`, email: `${text.toLowerCase()}@example.com`, phone: '780-555-0100' },
    product: d.productId, design: { ...d, engine: engineDesign(d, catalog, settings), labels: designLabels(d, catalog) },
    widthIn: 36, heightIn: 17, priceBreakdown: {}, totalCents: 7500, depositRequiredCents: 7500, placement: d.placementId, deliveryMethod: d.deliveryId,
    deliveryAddress: null, neededBy, rush: false, source: null, createdBy: 'customer', proofApprovedAt: new Date(), engineReport: {}, notesCustomer: null,
  });
  await recordPayment(db, o.id, { amountCents: 7500, kind: 'payment', method: 'Cash', receivedAt: '2026-11-01' }, 'owner', settings);
  return o.id;
}

beforeEach(async () => {
  db = await freshDb();
  deps = { db, catalog, settings, loadFont: loadFontFile, upload: async (p) => (uploads.push(p), { ok: true }) };
  await setInventory(db, 'material.birch-6mm', { full_sheets: 5, cut_panels: 0, low_stock_alert: 2 }, 'owner');
}, 60_000);

describe('nest jobs', () => {
  test('four paid orders nest, the panel file is true size with order labels, and marking as cut updates everything', async () => {
    const ids = [await paidOrder('Ava'), await paidOrder('Liam'), await paidOrder('Noah'), await paidOrder('Emma')];
    expect((await nestableOrders(db, 'material.birch-6mm')).map((o) => o.id).sort()).toEqual([...ids].sort());

    const jobId = await planJob(deps, 'material.birch-6mm', ids, 'owner');
    const job = (await getJob(db, jobId))!;
    expect(job.status).toBe('planned');
    expect(job.summary.unplaced).toEqual([]);
    expect(job.summary.newSheets).toBe(1);
    expect(job.panels.map((b) => b.label)).toEqual(['Sheet 1 Panel A', 'Sheet 1 Panel B']);
    expect(job.panels.flatMap((b) => b.placements)).toHaveLength(4);
    expect(job.utilization).toBeGreaterThan(0.1);
    // birch is $25 a sheet: each 36 in sign uses a few dollars of wood
    for (const id of ids) expect(job.summary.costs[id]).toBeGreaterThan(100), expect(job.summary.costs[id]).toBeLessThan(600);
    expect(uploads.filter((u) => u.startsWith(`nesting/${jobId}/`))).toHaveLength(2);
    // orders on a planned job aren't offered again
    expect(await nestableOrders(db, 'material.birch-6mm')).toEqual([]);

    const f = (await panelFile(deps, job, 'sheet1-A'))!;
    expect(f.name).toMatch(/^\d{4}-\d{2}-\d{2}_Birch-6mm_Sheet1_PanelA\.svg$/);
    expect(f.svg).toContain('width="48.0000in" height="47.8750in" viewBox="0 0 48.0000 47.8750"');
    const labels = f.svg.match(/<g id="labels"[^>]*>(.*?)<\/g>/s)![1];
    expect(labels).toContain('stroke="#00E000"');
    for (const p of job.panels[0].placements) expect(labels).toContain(p.orderNumber);
    expect(f.svg.match(/<g id="cut"[^>]*><path d="([^"]+)"/)![1].length).toBeGreaterThan(1000);

    const r = await cutJob(deps, jobId, 'owner');
    expect(r.movedOrderIds.sort()).toEqual([...ids].sort());
    for (const id of ids) expect((await getOwnerOrder(db, id))!.status).toBe('in_production');
    expect(await getInventory(db, 'material.birch-6mm')).toMatchObject({ full_sheets: 4, cut_panels: 0 });
    expect(r.offcutsSaved).toBeGreaterThan(0);
    expect((await openOffcuts(db, 'material.birch-6mm')).length).toBe(r.offcutsSaved);
    await expect(cutJob(deps, jobId, 'owner')).rejects.toThrow(/already/);
  });

  test('the next run places a fitting part on the saved offcut first; a lone sign leaves a spare panel', async () => {
    const first = await planJob(deps, 'material.birch-6mm', [await paidOrder('Ava')], 'owner');
    expect((await getJob(db, first))!.summary).toMatchObject({ newSheets: 1, sparePanelsLeft: 1 });
    await cutJob(deps, first, 'owner');
    expect(await getInventory(db, 'material.birch-6mm')).toMatchObject({ full_sheets: 4, cut_panels: 1 });
    const offcuts = await openOffcuts(db, 'material.birch-6mm');
    expect(offcuts.length).toBeGreaterThan(0);

    const small = await paidOrder('Mia', 'size.w12');
    const second = (await getJob(db, await planJob(deps, 'material.birch-6mm', [small], 'owner')))!;
    expect(second.panels[0].kind).toBe('offcut');
    expect(second.summary).toMatchObject({ newSheets: 0, offcutsUsed: [second.panels[0].offcutId] });
    await cutJob(deps, second.id, 'owner');
    expect((await openOffcuts(db, 'material.birch-6mm')).map((o) => o.id)).not.toContain(second.panels[0].offcutId);
  });

  test('plan next batch picks by needed-by date, up to one new sheet', async () => {
    const late = await paidOrder('Late', 'size.w36', '2026-12-20');
    const early = await paidOrder('Early', 'size.w36', '2026-11-10');
    const batch = await nextBatch(deps, 'material.birch-6mm');
    expect(batch[0]).toBe(early);
    expect(batch).toContain(late);
  });

  test('a dragged part must stay inside its panel and clear of the others', async () => {
    const ids = [await paidOrder('Ava'), await paidOrder('Liam')];
    const job = (await getJob(db, await planJob(deps, 'material.birch-6mm', ids, 'owner')))!;
    const moved = structuredClone(job.panels);
    const [a, b] = moved[0].placements;
    b.x = a.x;
    b.y = a.y;
    await expect(adjustLayout(deps, job.id, moved, 'owner')).rejects.toThrow(/closer than/);
    const ok = structuredClone(job.panels);
    ok[0].placements[1].y = 47.875 - 0.5 - ok[0].placements[1].h;
    await adjustLayout(deps, job.id, ok, 'owner');
    expect((await getJob(db, job.id))!.panels[0].placements[1].y).toBeCloseTo(ok[0].placements[1].y, 5);
  });

  test('true-shape jobs plan, record their method, and a dragged part is checked against the real outlines', async () => {
    deps = { ...deps, settings: { ...settings, nesting: { ...settings.nesting, method: 'true_shape' } } };
    const ids = [await paidOrder('Ava', 'size.w24'), await paidOrder('Liam', 'size.w24')];
    const job = (await getJob(db, await planJob(deps, 'material.birch-6mm', ids, 'owner')))!;
    expect(job.summary.method).toBe('true_shape');
    expect(job.panels).toHaveLength(1);
    const f = (await panelFile(deps, job, job.panels[0].id))!;
    expect(f.svg).toContain('S-1001');
    const moved = structuredClone(job.panels);
    moved[0].placements[1].x = moved[0].placements[0].x;
    moved[0].placements[1].y = moved[0].placements[0].y;
    await expect(adjustLayout(deps, job.id, moved, 'owner')).rejects.toThrow(/closer than/);
    await cutJob(deps, job.id, 'owner');
    expect((await getJob(db, job.id))!.status).toBe('cut');
  });
});
