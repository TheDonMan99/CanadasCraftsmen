// Schema, seed and catalog/settings editing against a real Postgres (PGlite).
import { beforeEach, describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { createOption, duplicateOption, getOption, listCatalog, priceHistory, reorder, setEnabled, updateOption } from '@/lib/db/catalog';
import type { Db } from '@/lib/db/client';
import { seedDatabase } from '@/lib/db/seed';
import { getSettings, updateSettingsGroup } from '@/lib/db/settings';
import { freshDb } from './pglite';

let db: Db;
beforeEach(async () => {
  db = await freshDb();
}, 60_000);

describe('seed', () => {
  test('loads every catalog option, font, material inventory row and role', async () => {
    const cat = await listCatalog(db);
    expect(cat).toHaveLength(seedCatalog().length);
    expect((await db.query('select count(*)::int as n from fonts'))[0].n).toBe(14);
    expect((await db.query('select count(*)::int as n from inventory'))[0].n).toBe(5);
    expect((await db.query('select name from roles order by name')).map((r) => r.name)).toEqual(['owner', 'production']);
  });
  test('round-trips options exactly as in the seed file', async () => {
    const byId = new Map((await listCatalog(db)).map((o) => [o.id, o]));
    for (const o of seedCatalog()) expect(byId.get(o.id)).toEqual(o);
  });
  test('re-running keeps edits and adds nothing', async () => {
    await updateOption(db, 'paint.white', { price_value: 1200 }, 'test');
    const res = await seedDatabase(db, seedCatalog(), seedSettings());
    expect(res.options).toBe(0);
    expect((await getOption(db, 'paint.white'))!.price_value).toBe(1200);
  });
});

describe('catalog edits', () => {
  test('a price edit is recorded in price history and the audit log', async () => {
    await updateOption(db, 'size.w36', { price_value: 8000 }, 'owner@test');
    const h = await priceHistory(db, 'size.w36');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ old_price: 7500, new_price: 8000 });
    const a = await db.query("select actor, action from audit_log where entity_id = 'size.w36'");
    expect(a).toEqual([{ actor: 'owner@test', action: 'update' }]);
  });
  test('editing the label does not write price history', async () => {
    await updateOption(db, 'size.w36', { label: '36 inches wide' }, 'test');
    expect(await priceHistory(db, 'size.w36')).toHaveLength(0);
  });
  test('switching options off and on', async () => {
    await setEnabled(db, ['paint.white', 'paint.black'], false, 'test');
    const on = await listCatalog(db, { enabledOnly: true });
    expect(on.find((o) => o.id === 'paint.white')).toBeUndefined();
    await setEnabled(db, ['paint.white'], true, 'test');
    expect((await getOption(db, 'paint.white'))!.enabled).toBe(true);
  });
  test("a font can't be switched on until its licence is confirmed", async () => {
    await updateOption(db, 'font.great-vibes', { values: { licence_confirmed: false } }, 'test');
    await expect(updateOption(db, 'font.great-vibes', { enabled: true }, 'test')).rejects.toThrow(/licence/);
    await updateOption(db, 'font.great-vibes', { values: { licence_confirmed: true }, enabled: true }, 'test');
    expect((await getOption(db, 'font.great-vibes'))!.enabled).toBe(true);
  });
  test('font fields are stored in the fonts table', async () => {
    await updateOption(db, 'font.pacifico', { values: { auto_thicken_in: 0.01 } }, 'test');
    expect((await db.query("select auto_thicken_in::float as t from fonts where option_id = 'font.pacifico'"))[0].t).toBe(0.01);
    expect((await getOption(db, 'font.pacifico'))!.values.auto_thicken_in).toBe(0.01);
  });
  test('reorder and duplicate', async () => {
    await reorder(db, 'paint', ['paint.black', 'paint.white'], 'test');
    const paints = (await listCatalog(db)).filter((o) => o.category === 'paint');
    expect(paints[0].id).toBe('paint.black');
    const copy = await duplicateOption(db, 'paint.black', 'test');
    expect(copy).toMatchObject({ id: 'paint.black-copy', label: 'Black (copy)', enabled: false, price_value: 1000 });
  });
  test('new options can be added', async () => {
    const o = await createOption(db, { id: 'paint.mint', category: 'paint', label: 'Mint', description: '', enabled: true, stock_status: 'in_stock', sort_order: 0, price_type: 'flat', price_value: 1000, applies_to: null, values: { hex: '#BDE3C3' }, internal_notes: '' }, 'test');
    expect(o.enabled).toBe(true);
    await expect(createOption(db, { ...o }, 'test')).rejects.toThrow(/already exists/);
  });
});

describe('append-only tables', () => {
  test('payments and status history cannot be changed or deleted', async () => {
    const [ord] = await db.query("insert into orders (product, design, price_breakdown, total) values ('product.welcome', '{}', '{}', 9000) returning id, number");
    expect(ord.number).toBe('S-1001');
    await db.query("insert into payments (order_id, amount, kind) values ($1, 9000, 'payment')", [ord.id]);
    await expect(db.query('update payments set amount = 1')).rejects.toThrow(/append-only/);
    await expect(db.query('delete from payments')).rejects.toThrow(/append-only/);
    await db.query("insert into status_history (order_id, to_status) values ($1, 'paid')", [ord.id]);
    await expect(db.query('delete from status_history')).rejects.toThrow(/append-only/);
  });
});

describe('settings', () => {
  test('groups are read, replaced and audited', async () => {
    const s = await getSettings(db);
    expect(s.pricing.minimum_order_cents).toBe(3000);
    await updateSettingsGroup(db, 'pricing', { ...s.pricing, minimum_order_cents: 4000 }, 'test');
    expect((await getSettings(db)).pricing.minimum_order_cents).toBe(4000);
    expect((await db.query("select count(*)::int as n from audit_log where entity = 'settings'"))[0].n).toBe(1);
  });
});
