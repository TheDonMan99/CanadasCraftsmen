// A fresh in-memory Postgres (PGlite) with the app's migrations applied.
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db/client';
import { migrate } from '@/lib/db/migrate';
import { seedDatabase } from '@/lib/db/seed';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';

export function pgliteDb(pg: PGlite): Db {
  const wrap = (q: Pick<PGlite, 'query' | 'exec'>, inTx: boolean): Db => ({
    query: async (text, params = []) => {
      // multi-statement SQL (migrations) has to go through exec
      if (!params.length && /;\s*\S/.test(text.trim().replace(/;\s*$/, ''))) {
        const res = await q.exec(text);
        return (res.at(-1)?.rows ?? []) as any;
      }
      return (await q.query(text, params as any[])).rows as any;
    },
    tx: (fn) => (inTx ? fn(wrap(q, true)) : pg.transaction((t) => fn(wrap(t as any, true)))),
  });
  return wrap(pg, false);
}

async function bootstrap(pg: PGlite) {
  // Supabase provides these roles; PGlite needs them created.
  await pg.exec("do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$;");
}

let template: Promise<Blob> | null = null;

/** A fresh migrated (and by default seeded) database, copied from a template built once per test file. */
export async function freshDb(opts: { seed?: boolean } = {}): Promise<Db> {
  if (opts.seed === false) {
    const pg = new PGlite();
    await bootstrap(pg);
    const db = pgliteDb(pg);
    await migrate(db);
    return db;
  }
  template ??= (async () => {
    const pg = new PGlite();
    await bootstrap(pg);
    const db = pgliteDb(pg);
    await migrate(db);
    await seedDatabase(db, seedCatalog(), seedSettings());
    const blob = await pg.dumpDataDir('none');
    await pg.close();
    return blob;
  })();
  const pg = new PGlite({ loadDataDir: await template });
  return pgliteDb(pg);
}
