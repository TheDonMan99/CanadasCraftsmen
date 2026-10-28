import { freshDb } from '@/tests/db/pglite';
freshDb().then(async (db) => { console.log((await db.query("select count(*) from information_schema.tables where table_schema='public'"))[0]); });
