// A throwaway local Postgres for development without Supabase: PGlite served
// on a TCP port, migrated and seeded. Data lives in .local-db/ until deleted.
//   npm run db:local
// then in another terminal:
//   DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run dev
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { migrate } from '@/lib/db/migrate';
import { seedDatabase } from '@/lib/db/seed';
import { pgliteDb } from '@/tests/db/pglite';

const port = Number(process.env.LOCAL_DB_PORT ?? 54329);
const dir = process.env.LOCAL_DB_DIR ?? '.local-db';

async function main() {
  const pg = new PGlite(dir === 'memory' ? undefined : dir);
  await pg.exec("do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$;");
  const db = pgliteDb(pg);
  const applied = await migrate(db);
  const seeded = await seedDatabase(db, seedCatalog(), seedSettings());
  console.log(`migrations applied: ${applied.length}, options seeded: ${seeded.options}`);
  const server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1', maxConnections: 20 });
  await server.start();
  console.log(`Local database ready: DATABASE_URL=postgres://postgres@127.0.0.1:${port}/postgres`);
}
main();
