// A tiny database interface the repositories use, so the same SQL runs on
// Supabase Postgres in production and on PGlite (Postgres in WebAssembly) in tests.

import postgres from 'postgres';

export interface Db {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export function postgresDb(url: string): Db {
  // prepare: false is required by Supabase's transaction pooler (port 6543)
  // the local test database (PGlite over a socket) runs every connection through one session and
  // mixes up overlapping queries' parameter types, so local use sends one query at a time over one
  // connection; Supabase connections work as normal
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, { prepare: false, max: local ? 1 : 5, idle_timeout: 20, ...(local && { max_pipeline: 1 }) } as postgres.Options<{}>);
  const wrap = (s: postgres.Sql | postgres.TransactionSql): Db => ({
    query: async (text, params = []) => (await s.unsafe(text, params as any[])) as any,
    tx: (fn) => ('begin' in s ? (s as postgres.Sql).begin((t) => fn(wrap(t))) : fn(wrap(s))) as any,
  });
  return wrap(sql);
}

let shared: Db | null | undefined;

/** The app's database, or null when DATABASE_URL isn't set (seed files are used instead). */
export function getDb(): Db | null {
  if (shared === undefined) shared = process.env.DATABASE_URL ? postgresDb(process.env.DATABASE_URL) : null;
  return shared;
}

/** For tests: point the app at a given database. */
export function setDb(db: Db | null) {
  shared = db;
}
