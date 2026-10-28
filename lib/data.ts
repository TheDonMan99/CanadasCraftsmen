// Where the app reads its catalog and settings from: the database when
// DATABASE_URL is set, otherwise the seed files (local development and tests).

import 'server-only';
import { seedCatalog, seedSettings, type CatalogOption, type Settings } from '@/lib/config/catalog';
import { listCatalog } from '@/lib/db/catalog';
import { getDb } from '@/lib/db/client';
import { getSettings } from '@/lib/db/settings';

export async function loadCatalog(opts: { enabledOnly?: boolean } = {}): Promise<CatalogOption[]> {
  const db = getDb();
  const all = db ? await listCatalog(db, opts) : seedCatalog();
  return opts.enabledOnly ? all.filter((o) => o.enabled) : all;
}

export async function loadSettings(): Promise<Settings> {
  const db = getDb();
  return db ? getSettings(db) : seedSettings();
}

export const dataSource = () => (getDb() ? 'database' : 'seed files');
