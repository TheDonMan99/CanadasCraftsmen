// Settings: one row of grouped JSON. Groups are replaced whole and audited.

import type { Settings } from '@/lib/config/catalog';
import { seedSettings } from '@/lib/config/catalog';
import { audit } from './catalog';
import type { Db } from './client';

export type SettingsGroup = keyof Settings;

/** Stored settings, with any groups or keys added since seeding filled from the seed defaults. */
export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ data: any }>('select data from settings where id = 1');
  const defaults = seedSettings();
  const stored = rows[0] ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data) : {};
  const out: any = { ...defaults };
  for (const k of Object.keys(defaults)) if (stored[k] && typeof stored[k] === 'object') out[k] = { ...(defaults as any)[k], ...stored[k] };
  return out;
}

export async function updateSettingsGroup<G extends SettingsGroup>(db: Db, group: G, value: Settings[G], actor: string): Promise<Settings> {
  return db.tx(async (t) => {
    const before = await getSettings(t);
    if (!(group in before)) throw new Error(`Unknown settings group ${String(group)}`);
    const after = { ...before, [group]: value };
    await t.query('insert into settings (id, data) values (1, $1) on conflict (id) do update set data = excluded.data, updated_at = now()', [JSON.stringify(after)]);
    await audit(t, actor, 'update', 'settings', String(group), before[group], value);
    return after;
  });
}
