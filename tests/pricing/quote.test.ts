// Five hand-calculated orders, worked out from the catalog tables in SPEC.md,
// plus the rules of the price formula one at a time.
import { describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings, type CatalogOption } from '@/lib/config/catalog';
import { customWidthPrice, quote, type QuoteInput } from '@/lib/pricing';

const catalog = seedCatalog();
const settings = seedSettings();
const base: QuoteInput = {
  productId: 'product.welcome', styleId: 'style.one-piece', sizeId: 'size.w36', materialId: 'material.birch-6mm',
  finishId: 'finish.raw', colourIds: [], addonIds: [], placementId: 'placement.indoor', deliveryId: 'delivery.pickup',
};
const edit = (patch: Record<string, Partial<CatalogOption>>): CatalogOption[] => catalog.map((o) => (patch[o.id] ? { ...o, ...patch[o.id] } : o));

describe('five hand-calculated orders', () => {
  test('1. 36 in welcome sign, one-piece, birch, raw, keyhole slots, pickup = $75', () => {
    // 36 in $75 + one-piece $0 + birch $0 + raw $0 + no topcoat $0 + keyholes $0 + pickup $0
    const q = quote({ ...base, addonIds: ['addon.keyholes'] }, catalog, settings);
    expect(q.errors).toEqual([]);
    expect(q.totalCents).toBe(7500);
    expect(q.topcoatId).toBe('topcoat.none');
  });

  test('2. 24 in family name, letters on rounded backer, maple, painted white, matte, hardware, local delivery = $150', () => {
    // 24 in $55 + letters on backer $40 + rounded backer $0 + maple $10 + painted $15 + white $10
    // + matte $0 + hardware $5 = $135 subtotal, + delivery $15 = $150
    const q = quote({
      ...base, productId: 'product.family-name', styleId: 'style.letters-on-backer', sizeId: 'size.w24', backerId: 'backer.rounded-rectangle',
      materialId: 'material.maple-6mm', finishId: 'finish.painted', colourIds: ['paint.white'], topcoatId: 'topcoat.matte',
      addonIds: ['addon.hardware'], deliveryId: 'delivery.local',
    }, catalog, settings);
    expect(q.errors).toEqual([]);
    expect(q.subtotalCents).toBe(13500);
    expect(q.deliveryCents).toBe(1500);
    expect(q.totalCents).toBe(15000);
  });

  test('3. 33 in custom nursery sign, painted black, covered outdoor, rush = $138', () => {
    // 33 in sits halfway between 30 in ($65) and 36 in ($75): $70, already a multiple of $5
    // + painted $15 + black $10 + exterior clear $15 (forced by covered outdoor) = $110
    // + rush 25% = $27.50 → $137.50 → rounded to the nearest dollar = $138
    const q = quote({
      ...base, productId: 'product.nursery-name', sizeId: 'size.custom', customWidthIn: 33, finishId: 'finish.painted',
      colourIds: ['paint.black'], topcoatId: 'topcoat.matte', placementId: 'placement.covered-outdoor', addonIds: ['addon.rush'],
    }, catalog, settings);
    expect(q.errors).toEqual([]);
    expect(q.lines.find((l) => l.key === 'size')!.cents).toBe(7000);
    expect(q.topcoatId).toBe('topcoat.exterior');
    expect(q.subtotalCents).toBe(11000);
    expect(q.rushCents).toBe(2750);
    expect(q.totalCents).toBe(13800);
  });

  test('4. 46 in porch leaner, raw, mounting kit, local delivery, with GST on = $113', () => {
    // 46 in leaner $85 + mounting kit $8 + delivery $15 = $108, + GST 5% $5.40 = $113.40 → $113
    const gst = { ...settings, tax: { ...settings.tax, gst_enabled: true } };
    const q = quote({ ...base, productId: 'product.porch-leaner', sizeId: 'size.leaner-h46', addonIds: ['addon.mounting-kit'], deliveryId: 'delivery.local' }, catalog, gst);
    expect(q.errors).toEqual([]);
    expect(q.gstCents).toBe(540);
    expect(q.totalCents).toBe(11300);
    expect(q.heightIn).toBe(46);
  });

  test('5. 12 in custom text with a $10 promo falls to the $30 minimum', () => {
    // 12 in $35 − promo $10 = $25 → minimum order $30
    const promos = { ...settings, pricing: { ...settings.pricing, promo_codes_enabled: true } };
    const q = quote({ ...base, productId: 'product.custom-text', sizeId: 'size.w12', promo: { kind: 'flat', value: 1000, code: 'FALL10' } }, catalog, promos);
    expect(q.errors).toEqual([]);
    expect(q.promoCents).toBe(1000);
    expect(q.minimumAppliedCents).toBe(500);
    expect(q.totalCents).toBe(3000);
  });
});

describe('price rules', () => {
  test('custom widths are interpolated between presets and rounded up to the next $5', () => {
    const presets = [{ widthIn: 30, cents: 6500 }, { widthIn: 36, cents: 7500 }];
    expect(customWidthPrice(presets, 31, 500)).toBe(7000); // $66.67 → $70
    expect(customWidthPrice(presets, 36, 500)).toBe(7500);
    expect(customWidthPrice(presets, 30.1, 500)).toBe(7000);
    // past the last preset the line is extended
    expect(customWidthPrice(presets, 42, 500)).toBe(8500);
  });
  test('switched-off sizes are left out of custom-width pricing', () => {
    // 46 in ($105) is off, so 45 in extends the 40–44 in line: $95 + $2.50 → $100
    const q = quote({ ...base, sizeId: 'size.custom', customWidthIn: 45 }, catalog, settings);
    expect(q.lines[0].cents).toBe(10000);
  });
  test('a price edit changes new quotes only', () => {
    const before = quote(base, catalog, settings);
    const after = quote(base, edit({ 'size.w36': { price_value: 8000 } }), settings);
    expect(before.totalCents).toBe(7500);
    expect(after.totalCents).toBe(8000);
  });
  test('options that are off are refused', () => {
    const q = quote({ ...base, styleId: 'style.layered' }, catalog, settings);
    expect(q.ok).toBe(false);
    expect(q.errors.join(' ')).toMatch(/isn't available/);
    expect(quote({ ...base, finishId: 'finish.painted', colourIds: ['paint.navy'] }, catalog, settings).ok).toBe(false);
  });
  test('the finish decides how many colours are needed', () => {
    expect(quote({ ...base, finishId: 'finish.painted', colourIds: [] }, catalog, settings).errors.join()).toMatch(/needs 1 colour/);
    expect(quote({ ...base, finishId: 'finish.raw', colourIds: ['paint.white'] }, catalog, settings).errors.join()).toMatch(/doesn't take a colour/);
  });
  test('indoor-only materials are refused for covered outdoor signs', () => {
    const cat = edit({ 'material.mdf-6mm': { enabled: true } });
    const q = quote({ ...base, materialId: 'material.mdf-6mm', placementId: 'placement.covered-outdoor' }, cat, settings);
    expect(q.errors.join()).toMatch(/indoor signs only/);
    expect(quote({ ...base, materialId: 'material.mdf-6mm' }, cat, settings).lines.find((l) => l.key === 'material')!.cents).toBe(-500);
  });
  test('product rules: sizes and styles a product does not offer', () => {
    expect(quote({ ...base, productId: 'product.round-door', styleId: 'style.letters-on-backer', sizeId: 'size.w36' }, catalog, settings).errors.join()).toMatch(/isn't offered/);
    const round = quote({ ...base, productId: 'product.round-door', styleId: 'style.letters-on-backer', sizeId: 'size.w18' }, catalog, settings);
    expect(round.errors).toEqual([]);
    expect(round.lines.find((l) => l.key === 'backer')!.optionId).toBe('backer.circle');
  });
  test('per-inch prices use the sign width', () => {
    const cat = edit({ 'addon.gift-wrap': { enabled: true, price_type: 'per_inch', price_value: 25 } });
    expect(quote({ ...base, addonIds: ['addon.gift-wrap'] }, cat, settings).lines.find((l) => l.optionId === 'addon.gift-wrap')!.cents).toBe(900);
  });
  test('promo codes do nothing while switched off', () => {
    expect(quote({ ...base, promo: { kind: 'percent', value: 50 } }, catalog, settings).totalCents).toBe(7500);
  });
  test('the amount due follows the payment setting', () => {
    const deposit = { ...settings, payments: { ...settings.payments, amount_due_pct: 50 } };
    expect(quote(base, catalog, deposit).amountDueCents).toBe(3750);
  });
  test('shipping is quoted separately', () => {
    const cat = edit({ 'delivery.shipping': { enabled: true } });
    const q = quote({ ...base, deliveryId: 'delivery.shipping' }, cat, settings);
    expect(q.deliveryQuoted).toBe(true);
    expect(q.totalCents).toBe(7500);
  });
});
