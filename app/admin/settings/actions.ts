'use server';

// Server actions behind the settings pages. Each writes to the database (with
// an audit-log entry) and refreshes every admin page, so the lab and the
// designer see changes straight away.

import { revalidatePath } from 'next/cache';
import type { CatalogOption, Settings } from '@/lib/config/catalog';
import { CatalogError, createOption, duplicateOption, priceHistory, reorder, setEnabled, updateOption, type OptionPatch } from '@/lib/db/catalog';
import { getDb } from '@/lib/db/client';
import { updateSettingsGroup, type SettingsGroup } from '@/lib/db/settings';

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

// Sign-in arrives in phase 4; until then edits are recorded as the owner.
const ACTOR = 'owner';

async function run<T>(fn: (db: NonNullable<ReturnType<typeof getDb>>) => Promise<T>): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'The database isn’t connected (DATABASE_URL is not set), so changes can’t be saved.' };
  try {
    const data = await fn(db);
    revalidatePath('/admin', 'layout');
    revalidatePath('/api/catalog');
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof CatalogError ? e.message : e instanceof Error ? e.message.replace(/^error: /, '') : String(e);
    return { ok: false, error: msg };
  }
}

export async function saveOption(id: string, patch: OptionPatch) {
  return run((db) => updateOption(db, id, patch, ACTOR));
}
export async function setOptionsEnabled(ids: string[], enabled: boolean) {
  return run(async (db) => (await setEnabled(db, ids, enabled, ACTOR), null));
}
export async function saveOrder(category: string, ids: string[]) {
  return run(async (db) => (await reorder(db, category, ids, ACTOR), null));
}
export async function copyOption(id: string) {
  return run((db) => duplicateOption(db, id, ACTOR));
}
export async function addOption(o: CatalogOption) {
  return run((db) => createOption(db, o, ACTOR));
}
export async function loadPriceHistory(id: string) {
  const db = getDb();
  if (!db) return [];
  return (await priceHistory(db, id)).map((h) => ({ ...h, changed_at: new Date(h.changed_at).toISOString() }));
}
export async function saveSettingsGroup(group: SettingsGroup, value: Settings[SettingsGroup]) {
  return run(async (db) => (await updateSettingsGroup(db, group, value as any, ACTOR), null));
}
