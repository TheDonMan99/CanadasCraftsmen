// JSON columns hold objects, not JSON text in a string, so SQL can look inside them.
import { describe, expect, test } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { freshDb } from './pglite';

describe('JSON columns', () => {
  test('values wrapped in a string are unwrapped by the repair migration', async () => {
    const db = await freshDb();
    await db.query(`update settings set data = to_jsonb(data::text) where id = 1`);
    expect((await db.query(`select jsonb_typeof(data) t from settings`))[0].t).toBe('string');
    await db.query(`delete from schema_migrations where name = '20261031000001_fix_json_strings.sql'`);
    await migrate(db);
    const [r] = await db.query(`select jsonb_typeof(data) t, data -> 'pricing' ->> 'minimum_order_cents' m from settings`);
    expect(r).toEqual({ t: 'object', m: '3000' });
  });
});
