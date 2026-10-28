// Nest jobs, inventory and offcuts. Planned jobs can be adjusted or deleted;
// marking a job as cut updates inventory, saves the leftovers as offcuts and
// moves its orders to In production, all in one transaction.

import type { BinLayout, Rect } from '@/lib/nesting/pack';
import { audit } from './catalog';
import type { Db } from './client';

const json = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
export class NestError extends Error {}

/** Orders ready to nest on a material: paid in full (or released by override), not already on a planned job. Specs only. */
export async function nestableOrders(db: Db, materialId: string) {
  const rows = await db.query<{ id: string; number: string; status: string; needed_by: string | null; rush: boolean; created_at: string; design: any; first_name: string }>(
    `select o.id, o.number, o.status, to_char(o.needed_by, 'YYYY-MM-DD') as needed_by, o.rush, o.created_at, o.design, split_part(c.name, ' ', 1) as first_name
       from orders o join customers c on c.id = o.customer_id
      where o.design ->> 'materialId' = $1
        and (o.status = 'paid_in_full' or (o.cut_override_reason is not null and o.status in ('new', 'awaiting_payment', 'deposit_paid')))
        and not exists (select 1 from nest_jobs j where j.status = 'planned' and j.summary -> 'orderIds' ? o.id::text)
      order by o.rush desc, o.needed_by nulls last, o.created_at`,
    [materialId],
  );
  return rows.map((r) => ({ ...r, design: json(r.design) }));
}

export interface InventoryRow {
  material_option_id: string;
  full_sheets: number;
  cut_panels: number;
  low_stock_alert: number;
}

export async function getInventory(db: Db, materialId: string): Promise<InventoryRow> {
  const [r] = await db.query<InventoryRow>('select material_option_id, full_sheets, cut_panels, low_stock_alert from inventory where material_option_id = $1', [materialId]);
  return r ?? { material_option_id: materialId, full_sheets: 0, cut_panels: 0, low_stock_alert: 2 };
}

export async function listInventory(db: Db) {
  return db.query<InventoryRow>('select material_option_id, full_sheets, cut_panels, low_stock_alert from inventory order by material_option_id');
}

export async function openOffcuts(db: Db, materialId?: string) {
  return db.query<{ id: string; material_option_id: string; width_in: number; height_in: number; source_panel: string | null; created_at: string }>(
    `select id, material_option_id, width_in::float8 as width_in, height_in::float8 as height_in, source_panel, created_at
       from offcuts where used_at is null ${materialId ? 'and material_option_id = $1' : ''} order by width_in * height_in desc`,
    materialId ? [materialId] : [],
  );
}

export interface JobSummary {
  orderIds: string[];
  orderNumbers: string[];
  newSheets: number;
  sparePanelsUsed: number;
  sparePanelsLeft: number;
  offcutsUsed: string[];
  unplaced: { orderNumber: string; partName: string; reason: string }[];
  /** material cost per order in cents, when the sheet cost is known */
  costs: Record<string, number>;
  marginIn: number;
  spacingIn: number;
  /** stored panel files by bin id */
  files?: Record<string, string>;
  inventoryWarning?: string;
}

export interface NestJob {
  id: string;
  material_option_id: string;
  status: 'planned' | 'cut';
  panels: BinLayout[];
  utilization: number;
  created_at: string;
  cut_at: string | null;
  created_by: string | null;
  summary: JobSummary;
}

export async function createJob(db: Db, j: { materialId: string; bins: BinLayout[]; utilization: number; summary: JobSummary }, actor: string): Promise<string> {
  return db.tx(async (t) => {
    for (const id of j.summary.orderIds) {
      const [busy] = await t.query("select 1 from nest_jobs where status = 'planned' and summary -> 'orderIds' ? $1", [id]);
      if (busy) throw new NestError('One of these orders is already on a planned job.');
    }
    const [r] = await t.query<{ id: string }>(
      'insert into nest_jobs (material_option_id, status, panels, utilization, summary, created_by) values ($1, $2, $3, $4, $5, $6) returning id',
      [j.materialId, 'planned', JSON.stringify(j.bins), j.utilization, JSON.stringify(j.summary), actor],
    );
    await audit(t, actor, 'plan', 'nest_job', r.id, null, { orders: j.summary.orderNumbers, panels: j.bins.length });
    return r.id;
  });
}

export async function getJob(db: Db, id: string): Promise<NestJob | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.query('select id, material_option_id, status, panels, utilization::float8 as utilization, created_at, cut_at, created_by, summary from nest_jobs where id = $1', [id]);
  return r ? ({ ...r, panels: json(r.panels), summary: json(r.summary) } as NestJob) : null;
}

export async function listJobs(db: Db, limit = 30) {
  const rows = await db.query('select id, material_option_id, status, panels, utilization::float8 as utilization, created_at, cut_at, created_by, summary from nest_jobs order by created_at desc limit $1', [limit]);
  return rows.map((r) => ({ ...r, panels: json(r.panels), summary: json(r.summary) }) as NestJob);
}

export async function saveLayout(db: Db, id: string, bins: BinLayout[], summary: JobSummary, utilization: number, actor: string) {
  await db.tx(async (t) => {
    const [j] = await t.query<{ status: string }>('select status from nest_jobs where id = $1 for update', [id]);
    if (!j) throw new NestError('Job not found.');
    if (j.status !== 'planned') throw new NestError('This job is already cut.');
    await t.query('update nest_jobs set panels = $2, summary = $3, utilization = $4 where id = $1', [id, JSON.stringify(bins), JSON.stringify(summary), utilization]);
    await audit(t, actor, 'adjust', 'nest_job', id, null, null);
  });
}

export async function deleteJob(db: Db, id: string, actor: string) {
  await db.tx(async (t) => {
    const [j] = await t.query<{ status: string }>('select status from nest_jobs where id = $1 for update', [id]);
    if (!j) return;
    if (j.status !== 'planned') throw new NestError('A cut job is kept for re-cutting broken parts.');
    await t.query('delete from nest_jobs where id = $1', [id]);
    await audit(t, actor, 'delete', 'nest_job', id, null, null);
  });
}

/**
 * Marks a job as cut: sheets and spare panels come off inventory (unused Panel B
 * halves go back as spare panels), used offcuts are closed, leftovers are saved
 * as new offcuts, and the job's paid orders move to In production.
 */
export async function markJobCut(db: Db, id: string, leftoversByBin: Record<string, Rect[]>, actor: string): Promise<{ movedOrderIds: string[]; offcutsSaved: number }> {
  return db.tx(async (t) => {
    const [row] = await t.query('select id, material_option_id, status, panels, summary from nest_jobs where id = $1 for update', [id]);
    if (!row) throw new NestError('Job not found.');
    if (row.status !== 'planned') throw new NestError('This job is already marked as cut.');
    const s = json(row.summary) as JobSummary;
    const bins = json(row.panels) as BinLayout[];
    const mat = row.material_option_id;
    await t.query('insert into inventory (material_option_id) values ($1) on conflict do nothing', [mat]);
    const [before] = await t.query<InventoryRow>('select full_sheets, cut_panels from inventory where material_option_id = $1', [mat]);
    await t.query(
      'update inventory set full_sheets = greatest(0, full_sheets - $2), cut_panels = greatest(0, cut_panels - $3 + $4) where material_option_id = $1',
      [mat, s.newSheets, s.sparePanelsUsed, s.sparePanelsLeft],
    );
    if (s.offcutsUsed.length) await t.query('update offcuts set used_at = now() where id = any($1::uuid[]) and used_at is null', [s.offcutsUsed]);
    let saved = 0;
    for (const b of bins)
      for (const r of leftoversByBin[b.id] ?? []) {
        await t.query('insert into offcuts (material_option_id, width_in, height_in, source_panel, nest_job_id) values ($1, $2, $3, $4, $5)', [mat, r.w, r.h, `${b.label} (${new Date().toISOString().slice(0, 10)})`, id]);
        saved++;
      }
    await t.query("update nest_jobs set status = 'cut', cut_at = now() where id = $1", [id]);
    const moved = await t.query<{ id: string; status: string }>(
      `select id, status from orders where id = any($1::uuid[]) and status in ('new', 'awaiting_payment', 'deposit_paid', 'paid_in_full') for update`,
      [s.orderIds],
    );
    for (const o of moved) {
      await t.query("update orders set status = 'in_production' where id = $1", [o.id]);
      await t.query("insert into status_history (order_id, from_status, to_status, note) values ($1, $2, 'in_production', $3)", [o.id, o.status, `Cut on nest job ${id.slice(0, 8)} (${actor})`]);
    }
    await audit(t, actor, 'mark_cut', 'nest_job', id, before, { newSheets: s.newSheets, sparePanelsUsed: s.sparePanelsUsed, sparePanelsLeft: s.sparePanelsLeft, offcutsUsed: s.offcutsUsed.length, offcutsSaved: saved });
    return { movedOrderIds: moved.map((o) => o.id), offcutsSaved: saved };
  });
}

// ---------- inventory ----------

export async function addStock(db: Db, materialId: string, sheets: number, actor: string) {
  if (!Number.isInteger(sheets) || sheets === 0 || Math.abs(sheets) > 500) throw new NestError('Enter a whole number of sheets.');
  await db.tx(async (t) => {
    await t.query('insert into inventory (material_option_id) values ($1) on conflict do nothing', [materialId]);
    await t.query('update inventory set full_sheets = greatest(0, full_sheets + $2) where material_option_id = $1', [materialId, sheets]);
    await audit(t, actor, 'stock', 'inventory', materialId, null, { sheets });
  });
}

export async function setInventory(db: Db, materialId: string, v: { full_sheets: number; cut_panels: number; low_stock_alert: number }, actor: string) {
  for (const n of [v.full_sheets, v.cut_panels, v.low_stock_alert]) if (!Number.isInteger(n) || n < 0) throw new NestError('Counts are whole numbers, 0 or more.');
  await db.tx(async (t) => {
    const [before] = await t.query('select full_sheets, cut_panels, low_stock_alert from inventory where material_option_id = $1', [materialId]);
    await t.query(
      `insert into inventory (material_option_id, full_sheets, cut_panels, low_stock_alert) values ($1, $2, $3, $4)
       on conflict (material_option_id) do update set full_sheets = excluded.full_sheets, cut_panels = excluded.cut_panels, low_stock_alert = excluded.low_stock_alert`,
      [materialId, v.full_sheets, v.cut_panels, v.low_stock_alert],
    );
    await audit(t, actor, 'count', 'inventory', materialId, before ?? null, v);
  });
}

export async function addOffcut(db: Db, materialId: string, w: number, h: number, actor: string) {
  if (!(w > 0 && h > 0 && w <= 96 && h <= 96)) throw new NestError('Enter the offcut’s width and height in inches.');
  await db.tx(async (t) => {
    await t.query('insert into offcuts (material_option_id, width_in, height_in, source_panel) values ($1, $2, $3, $4)', [materialId, w, h, 'Added by hand']);
    await audit(t, actor, 'add', 'offcut', materialId, null, { w, h });
  });
}

export async function discardOffcut(db: Db, id: string, actor: string) {
  await db.tx(async (t) => {
    await t.query('update offcuts set used_at = now() where id = $1 and used_at is null', [id]);
    await audit(t, actor, 'discard', 'offcut', id, null, null);
  });
}

/** Materials whose full sheets are below their alert level. */
export async function lowStock(db: Db) {
  return db.query<{ material_option_id: string; full_sheets: number; low_stock_alert: number }>(
    'select i.material_option_id, i.full_sheets, i.low_stock_alert from inventory i join catalog_options o on o.id = i.material_option_id where o.enabled and i.full_sheets < i.low_stock_alert',
  );
}
