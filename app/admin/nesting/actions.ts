'use server';

// Server actions for nesting and inventory. Each checks the signed-in user's permission.

import { revalidatePath } from 'next/cache';
import type { Perm } from '@/lib/auth/permissions';
import { AuthError, requireUser, type AdminUser } from '@/lib/auth/session';
import { updateOption } from '@/lib/db/catalog';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb, type Db } from '@/lib/db/client';
import { addOffcut, addStock, deleteJob, discardOffcut, NestError, setInventory } from '@/lib/db/nesting';
import type { BinLayout } from '@/lib/nesting/pack';
import { emailOrder } from '@/lib/server/admin-orders';
import { loadFontFile } from '@/lib/server/fonts';
import { adjustLayout, cutJob, nextBatch, planJob, type Deps } from '@/lib/server/nesting';
import { uploadFile } from '@/lib/server/storage';

export type Result<T = null> = { ok: true; data: T; message?: string } | { ok: false; error: string };

async function run<T>(perm: Perm, fn: (db: Db, user: AdminUser, deps: Deps) => Promise<T>, message?: (t: T) => string): Promise<Result<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'The database isn’t connected.' };
  try {
    const user = await requireUser(perm);
    const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
    const data = await fn(db, user, { db, catalog, settings, loadFont: loadFontFile, upload: uploadFile });
    revalidatePath('/admin', 'layout');
    return { ok: true, data, message: message?.(data) };
  } catch (e) {
    if (e instanceof AuthError || e instanceof NestError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function plan(materialId: string, orderIds: string[]) {
  return run('manage_nesting', (_, u, deps) => planJob(deps, materialId, orderIds.slice(0, 60), u.email));
}

export async function pickNextBatch(materialId: string) {
  return run('manage_nesting', (_, __, deps) => nextBatch(deps, materialId));
}

export async function saveAdjusted(jobId: string, bins: BinLayout[]) {
  return run('manage_nesting', (_, u, deps) => adjustLayout(deps, jobId, bins, u.email), () => 'Layout saved.');
}

export async function markCut(jobId: string) {
  return run(
    'manage_nesting',
    async (db, u, deps) => {
      const r = await cutJob(deps, jobId, u.email);
      for (const id of r.movedOrderIds) await emailOrder(db, deps.settings, deps.catalog, id, 'in_production');
      return r;
    },
    (r) => `Marked as cut. ${r.movedOrderIds.length} order${r.movedOrderIds.length === 1 ? '' : 's'} moved to In production; ${r.offcutsSaved} offcut${r.offcutsSaved === 1 ? '' : 's'} saved.`,
  );
}

export async function removeJob(jobId: string) {
  return run('manage_nesting', (db, u) => deleteJob(db, jobId, u.email));
}

export async function stock(materialId: string, sheets: number, costPerSheet?: string) {
  return run('manage_inventory', async (db, u, deps) => {
    await addStock(db, materialId, sheets, u.email);
    // the cost of the sheets you bought becomes the material's sheet cost (owner only)
    if (costPerSheet?.trim()) {
      if (!u.perms.edit_catalog) throw new AuthError(403, 'Only the owner can change sheet costs.');
      const cents = Math.round(Number(costPerSheet.replace(/[$,\s]/g, '')) * 100);
      if (!(cents > 0)) throw new NestError('Enter the cost per sheet in dollars.');
      const m = deps.catalog.find((o) => o.id === materialId)!;
      await updateOption(db, materialId, { values: { ...m.values, sheet_cost_cents: cents } }, u.email);
    }
    return null;
  }, () => 'Stock added.');
}

export async function setCounts(materialId: string, v: { full_sheets: number; cut_panels: number; low_stock_alert: number }) {
  return run('manage_inventory', (db, u) => setInventory(db, materialId, v, u.email), () => 'Saved.');
}

export async function newOffcut(materialId: string, w: number, h: number) {
  return run('manage_inventory', (db, u) => addOffcut(db, materialId, w, h, u.email), () => 'Offcut added.');
}

export async function dropOffcut(id: string) {
  return run('manage_inventory', (db, u) => discardOffcut(db, id, u.email), () => 'Offcut removed.');
}

/** Plans the same orders again from scratch (planned jobs only). */
export async function rerun(jobId: string) {
  return run('manage_nesting', async (db, u, deps) => {
    const { getJob } = await import('@/lib/db/nesting');
    const job = await getJob(db, jobId);
    if (!job) throw new NestError('Job not found.');
    await deleteJob(db, jobId, u.email);
    return planJob(deps, job.material_option_id, job.summary.orderIds, u.email);
  });
}
