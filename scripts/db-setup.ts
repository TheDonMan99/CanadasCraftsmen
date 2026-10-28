// Apply migrations and seed the catalog into the database at DATABASE_URL.
//   npm run db:setup
// Safe to re-run: applied migrations are skipped and existing rows are kept.
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { postgresDb } from '@/lib/db/client';
import { migrate } from '@/lib/db/migrate';
import { seedDatabase } from '@/lib/db/seed';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL to your Supabase connection string first.');
  const db = postgresDb(url);
  const applied = await migrate(db);
  console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Migrations already up to date.');
  const res = await seedDatabase(db, seedCatalog(), seedSettings());
  console.log(`Seeded ${res.options} new catalog option(s)${res.settings ? ' and the default settings' : ''}.`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
