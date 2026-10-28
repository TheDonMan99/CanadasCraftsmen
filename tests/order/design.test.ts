// The order form's design model: defaults, consistency, and agreement with the engine and calculator.
import { describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings, type CatalogOption } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import { runEngine } from '@/lib/engine';
import { checkOrderDesign, defaultDesign, engineDesign, materialsFor, normalizeDesign, previewColours, quoteInput, sizesFor, topcoatsFor } from '@/lib/order/design';
import { addDays, checkContact, earliestReadyDate, paymentInstructions, refundPolicy } from '@/lib/order/rules';
import { quote } from '@/lib/pricing';
import { loadFontFile } from '@/lib/server/fonts';

const catalog = seedCatalog();
const settings = seedSettings();
const products = catalog.filter((o) => o.category === 'product' && o.enabled);
const edit = (patch: Record<string, Partial<CatalogOption>>) => catalog.map((o) => (patch[o.id] ? { ...o, ...patch[o.id] } : o));

describe('default designs', () => {
  test.each(products.map((p) => [p.id]))('%s starts valid, priced, and cuts', (id) => {
    const d = defaultDesign(catalog, settings, id);
    expect(checkOrderDesign(d, catalog)).toEqual([]);
    const r = runEngine(engineDesign(d, catalog, settings), buildContext(catalog, settings, loadFontFile, d.materialId));
    expect(r.failures.map((f) => f.message)).toEqual([]);
    const q = quote(quoteInput(d, r.widthIn), catalog, settings);
    expect(q.errors).toEqual([]);
    expect(q.totalCents).toBeGreaterThan(0);
  });

  test('the welcome sign starts at 36 in with its three lines', () => {
    const d = defaultDesign(catalog, settings, 'product.welcome');
    expect(d.sizeId).toBe('size.w36');
    expect(d.lines.map((l) => [l.role, l.text, l.fontId])).toEqual([
      ['top', 'Welcome', 'font.pacifico'],
      ['main', 'The Smiths', 'font.pacifico'],
      ['small', 'Est. 2019', 'font.montserrat-bold'],
    ]);
  });

  test('the round door sign is letters on its circle backer, 12 or 18 in only', () => {
    const d = defaultDesign(catalog, settings, 'product.round-door');
    expect(d.backerId).toBe('backer.circle');
    expect(sizesFor(catalog, d.productId).map((s) => s.id)).toEqual(['size.w12', 'size.w18']);
    expect(engineDesign(d, catalog, settings).backer?.shape).toBe('circle');
  });

  test('a porch leaner picks heights, not widths', () => {
    const d = defaultDesign(catalog, settings, 'product.porch-leaner');
    expect(sizesFor(catalog, d.productId).every((s) => s.values.kind === 'height')).toBe(true);
    expect(engineDesign(d, catalog, settings)).toMatchObject({ layout: 'vertical', heightIn: 46 });
  });
});

describe('only options that are on appear', () => {
  test('switching a font off removes it and moves lines to another font', () => {
    const cat = edit({ 'font.pacifico': { enabled: false } });
    const d = normalizeDesign(defaultDesign(catalog, settings, 'product.nursery-name'), cat);
    expect(d.lines[0].fontId).not.toBe('font.pacifico');
    expect(checkOrderDesign({ ...d, lines: [{ role: 'main', text: 'Ava', fontId: 'font.pacifico' }] }, cat)[0]).toMatch(/isn't offered/);
  });
  test('switching a size off removes it from the product', () => {
    expect(sizesFor(edit({ 'size.w36': { enabled: false } }), 'product.welcome').map((s) => s.id)).not.toContain('size.w36');
  });
  test('indoor-only materials are hidden outdoors', () => {
    const cat = edit({ 'material.mdf-6mm': { enabled: true } });
    expect(materialsFor(cat, 'placement.indoor').map((m) => m.id)).toContain('material.mdf-6mm');
    expect(materialsFor(cat, 'placement.covered-outdoor').map((m) => m.id)).not.toContain('material.mdf-6mm');
  });
  test('covered outdoor forces the exterior topcoat, so there is nothing to pick', () => {
    expect(topcoatsFor(catalog, 'placement.covered-outdoor', 'finish.painted')).toEqual([]);
    expect(topcoatsFor(catalog, 'placement.indoor', 'finish.painted').map((t) => t.id)).toEqual(['topcoat.matte', 'topcoat.satin']);
    expect(topcoatsFor(catalog, 'placement.indoor', 'finish.raw').map((t) => t.id)).toEqual(['topcoat.none']);
  });
});

describe('normalizeDesign', () => {
  test('a painted finish gets one paint; raw gets none', () => {
    const d = defaultDesign(catalog, settings, 'product.welcome');
    expect(normalizeDesign({ ...d, finishId: 'finish.painted' }, catalog).colourIds).toEqual(['paint.white']);
    expect(normalizeDesign({ ...d, finishId: 'finish.raw', colourIds: ['paint.black'] }, catalog).colourIds).toEqual([]);
  });
  test('a backer only when the style needs one', () => {
    const d = defaultDesign(catalog, settings, 'product.welcome');
    expect(normalizeDesign({ ...d, styleId: 'style.letters-on-backer' }, catalog).backerId).toBe('backer.rectangle');
    expect(normalizeDesign({ ...d, backerId: 'backer.oval' }, catalog).backerId).toBeNull();
  });
  test('preview colours follow the paint picked, or the wood', () => {
    const d = normalizeDesign({ ...defaultDesign(catalog, settings, 'product.welcome'), finishId: 'finish.painted', colourIds: ['paint.black'] }, catalog);
    expect(previewColours(d, catalog).word).toBe('#1E1E1E');
    expect(previewColours(defaultDesign(catalog, settings, 'product.welcome'), catalog).word).toBe('#E3C9A0');
  });
  test('add-ons switch engine features: keyholes and the engraved small line', () => {
    const d = defaultDesign(catalog, settings, 'product.welcome');
    const ed = engineDesign({ ...d, styleId: 'style.stencil', backerId: 'backer.rectangle', addonIds: ['addon.keyholes', 'addon.engraved-small-line'] }, catalog, settings);
    expect(ed.keyholes).toBe(true);
    expect(ed.lines.find((l) => l.role === 'small')?.engraved).toBe(true);
  });
});

describe('dates, contact details and policy', () => {
  test('standard orders queue a week behind each full week of open orders; rush uses 3 days', () => {
    expect(earliestReadyDate(settings, '2026-11-02', false, 0)).toBe('2026-11-09');
    expect(earliestReadyDate(settings, '2026-11-02', false, 4)).toBe('2026-11-09');
    expect(earliestReadyDate(settings, '2026-11-02', false, 5)).toBe('2026-11-16');
    expect(earliestReadyDate(settings, '2026-11-02', true, 50)).toBe('2026-11-05');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
  test('contact checks', () => {
    const ok = { name: 'Jane Smith', email: 'jane@example.com', phone: '780-555-0100' };
    const opts = { needsAddress: false, earliest: '2026-11-09', rush: false };
    expect(checkContact(ok, opts)).toEqual([]);
    expect(checkContact({ ...ok, email: 'nope' }, opts)).toEqual(['Type a valid email address.']);
    expect(checkContact(ok, { ...opts, needsAddress: true })).toEqual(['Type the delivery address.']);
    expect(checkContact({ ...ok, neededBy: '2026-11-05' }, opts)[0]).toMatch(/earliest .* Nov 9, 2026.*add rush/);
  });
  test('refund policy and payment instructions come from settings', () => {
    expect(refundPolicy(settings)).toBe('Custom signs are made to order. If you cancel before cutting starts, you get 50% back; after cutting starts, no refund.');
    const p = paymentInstructions(catalog, settings, 'S-1001', 7500);
    expect(p[0]).toBe('Interac e-Transfer: Send an Interac e-Transfer to donovanarntson@gmail.com and put your order number S-1001 in the message.');
    expect(p).toHaveLength(2);
  });
});
