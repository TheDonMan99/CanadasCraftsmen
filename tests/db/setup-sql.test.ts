// The paste-in setup script must leave the database exactly as `npm run db:setup` does.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, test } from 'vitest';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { listCatalog } from '@/lib/db/catalog';
import { migrate } from '@/lib/db/migrate';
import { seedDatabase } from '@/lib/db/seed';
import { buildSetupSql } from '@/lib/db/setup-sql';
import { getSettings } from '@/lib/db/settings';
import { freshDb, pgliteDb } from './pglite';

async function viaScript() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated;');
  await pg.exec(await buildSetupSql(seedCatalog(), seedSettings()));
  return { pg, db: pgliteDb(pg) };
}

const count = async (db: any, table: string) => (await db.query(`select count(*)::int as n from ${table}`))[0].n;

describe('setup.sql', () => {
  test('gives the same catalog, settings, fonts, inventory and roles as db:setup', async () => {
    const { db } = await viaScript();
    const ref = await freshDb();
    expect(await listCatalog(db)).toEqual(await listCatalog(ref));
    expect(await getSettings(db)).toEqual(await getSettings(ref));
    for (const t of ['fonts', 'inventory', 'roles']) expect(await count(db, t)).toBe(await count(ref, t));
    expect(await db.query('select * from fonts order by option_id')).toEqual(await ref.query('select * from fonts order by option_id'));
  }, 60_000);

  test('re-running it, or db:setup after it, changes nothing', async () => {
    const { pg, db } = await viaScript();
    await db.query("update catalog_options set price_value = 1200 where id = 'paint.white'");
    await pg.exec(await buildSetupSql(seedCatalog(), seedSettings()));
    expect(await migrate(db)).toEqual([]);
    expect(await seedDatabase(db, seedCatalog(), seedSettings())).toEqual({ options: 0, settings: false });
    expect((await db.query("select price_value from catalog_options where id = 'paint.white'"))[0].price_value).toBe(1200);
    expect(await count(db, 'catalog_options')).toBe(seedCatalog().length);
  }, 60_000);

  test('the committed supabase/setup.sql is up to date (run npm run db:sql)', async () => {
    expect(fs.readFileSync('supabase/setup.sql', 'utf8')).toBe(await buildSetupSql(seedCatalog(), seedSettings()));
  });
});
