'use server';

// Server actions behind the settings pages. Each writes to the database (with
// an audit-log entry) and refreshes every admin page, so the lab and the
// designer see changes straight away.

import { revalidatePath } from 'next/cache';
import type { Perm } from '@/lib/auth/permissions';
import { AuthError, requireUser } from '@/lib/auth/session';
import type { CatalogOption, Settings } from '@/lib/config/catalog';
import { CatalogError, createOption, duplicateOption, priceHistory, reorder, setEnabled, updateOption, type OptionPatch } from '@/lib/db/catalog';
import { getDb } from '@/lib/db/client';
import { updateSettingsGroup, type SettingsGroup } from '@/lib/db/settings';

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(perm: Perm, fn: (db: NonNullable<ReturnType<typeof getDb>>, actor: string) => Promise<T>): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'The database isn’t connected (DATABASE_URL is not set), so changes can’t be saved.' };
  try {
    const user = await requireUser(perm);
    const data = await fn(db, user.email);
    revalidatePath('/admin', 'layout');
    revalidatePath('/api/catalog');
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof CatalogError || e instanceof AuthError ? e.message : e instanceof Error ? e.message.replace(/^error: /, '') : String(e);
    return { ok: false, error: msg };
  }
}

export async function saveOption(id: string, patch: OptionPatch) {
  return run('edit_catalog', (db, actor) => updateOption(db, id, patch, actor));
}
export async function setOptionsEnabled(ids: string[], enabled: boolean) {
  return run('edit_catalog', async (db, actor) => (await setEnabled(db, ids, enabled, actor), null));
}
export async function saveOrder(category: string, ids: string[]) {
  return run('edit_catalog', async (db, actor) => (await reorder(db, category, ids, actor), null));
}
export async function copyOption(id: string) {
  return run('edit_catalog', (db, actor) => duplicateOption(db, id, actor));
}
export async function addOption(o: CatalogOption) {
  return run('edit_catalog', (db, actor) => createOption(db, o, actor));
}
export async function loadPriceHistory(id: string) {
  const db = getDb();
  await requireUser('edit_catalog');
  if (!db) return [];
  return (await priceHistory(db, id)).map((h) => ({ ...h, changed_at: new Date(h.changed_at).toISOString() }));
}
export async function saveSettingsGroup(group: SettingsGroup, value: Settings[SettingsGroup]) {
  return run('edit_settings', async (db, actor) => (await updateSettingsGroup(db, group, value as any, actor), null));
}
