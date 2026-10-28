// Applies supabase/migrations/*.sql in name order, once each, and records them.

import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './client';

export const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sqlText = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.tx(async (t) => {
      await t.query(sqlText);
      await t.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}
