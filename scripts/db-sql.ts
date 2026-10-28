// Write supabase/setup.sql: the same migrations and seed as `npm run db:setup`, as one
// script to paste into the Supabase SQL Editor.
//   npm run db:sql
import fs from 'node:fs';
import { seedCatalog, seedSettings } from '@/lib/config/catalog';
import { buildSetupSql } from '@/lib/db/setup-sql';

const file = 'supabase/setup.sql';
fs.writeFileSync(file, await buildSetupSql(seedCatalog(), seedSettings()));
console.log(`Wrote ${file}. Paste it into Supabase → SQL Editor and click Run.`);
