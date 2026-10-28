// Planning a nest job: run each order through the engine for its real parts,
// pack them onto offcuts, spare panels and new sheets, work out the material
// cost per order, and make one LightBurn file per panel.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import type { Db } from '@/lib/db/client';
import { createJob, getInventory, getJob, markJobCut, nestableOrders, openOffcuts, saveLayout, NestError, type JobSummary, type NestJob } from '@/lib/db/nesting';
import { bounds } from '@/lib/engine/geom';
import { runEngine, type EngineResult, type Part } from '@/lib/engine';
import type { LoadedFont } from '@/lib/engine/font';
import { panelFileName, panelSvg, type ExportSettings } from '@/lib/export';
import { checkLayout, leftovers, nest, type BinLayout, type BinSpec, type NestPart, type NestResult, type NestSettings } from '@/lib/nesting/pack';
import { checkTrueShape, nestTrueShape, turn } from '@/lib/nesting/trueshape';
import { pathData } from '@/lib/export/svg';
import type { Upload } from './storage';

export function nestSettings(settings: Settings, material: CatalogOption | undefined): NestSettings {
  const n = settings.nesting;
  const quarterTurns = (n.rotations ?? []).some((r: number) => r === 90 || r === 270);
  return {
    marginIn: settings.machine.panel_edge_margin_in,
    spacingIn: n.part_spacing_in,
    // plywood grain lock: parts only turn 0° or 180°, so the grain runs the same way
    allowRotate: quarterTurns && !material?.values.grain_lock,
    useOffcutsFirst: n.use_offcuts_first,
    panelW: settings.machine.panel_w_in,
    panelH: settings.machine.panel_h_in,
    minOffcutW: n.min_offcut_w_in,
    minOffcutH: n.min_offcut_h_in,
    timeLimitMs: (n.time_limit_s ?? 10) * 1000,
  };
}

export interface Deps {
  db: Db;
  catalog: CatalogOption[];
  settings: Settings;
  loadFont: (file: string) => LoadedFont;
  upload?: Upload;
}

type OrderRow = Awaited<ReturnType<typeof nestableOrders>>[number];

/** An order's parts, cut with the material's current kerf. */
function orderParts(o: { id: string; number: string; design: any }, deps: Deps): { result: EngineResult; parts: NestPart[]; byKey: Map<string, Part> } {
  const result = runEngine(o.design.engine, buildContext(deps.catalog, deps.settings, deps.loadFont, o.design.materialId));
  const byKey = new Map<string, Part>();
  const parts = result.parts.map((p) => {
    const b = bounds(p.cut);
    const key = `${o.id}:${p.id}`;
    byKey.set(key, p);
    return { key, orderId: o.id, orderNumber: o.number, partId: p.id, partName: p.name, w: b.maxX - b.minX, h: b.maxY - b.minY, area: p.areaIn2, shape: p.cut };
  });
  return { result, parts, byKey };
}

async function availableBins(db: Db, materialId: string, settings: Settings): Promise<BinSpec[]> {
  const [inv, offs] = await Promise.all([getInventory(db, materialId), openOffcuts(db, materialId)]);
  const m = settings.machine;
  const bins: BinSpec[] = offs.map((o) => ({ id: `offcut-${o.id}`, kind: 'offcut', label: `Offcut ${fmt(o.width_in)} × ${fmt(o.height_in)} in`, w: o.width_in, h: o.height_in, offcutId: o.id }));
  for (let i = 1; i <= inv.cut_panels; i++) bins.push({ id: `spare-${i}`, kind: 'spare', label: `Spare panel ${i}`, w: m.panel_w_in, h: m.panel_h_in });
  return bins;
}

const fmt = (n: number) => String(Number(n.toFixed(2)));

/** Material cost per order: sheet cost ÷ sheet area × the area its parts take up, spacing included. */
export function materialCosts(bins: BinLayout[], material: CatalogOption | undefined, settings: Settings, spacing: number): Record<string, number> {
  const cost = material?.values.sheet_cost_cents;
  if (!cost) return {};
  const perIn2 = cost / (settings.machine.sheet_w_in * settings.machine.sheet_h_in);
  const out: Record<string, number> = {};
  for (const b of bins) for (const p of b.placements) out[p.orderId] = (out[p.orderId] ?? 0) + (p.w + spacing) * (p.h + spacing) * perIn2;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

export async function planJob(deps: Deps, materialId: string, orderIds: string[], actor: string): Promise<string> {
  const { db, catalog, settings } = deps;
  const material = catalog.find((o) => o.id === materialId && o.category === 'material');
  if (!material) throw new NestError('Pick a material.');
  const pool = await nestableOrders(db, materialId);
  const chosen = orderIds.map((id) => pool.find((o) => o.id === id)).filter((o): o is OrderRow => !!o);
  if (!chosen.length) throw new NestError('Pick at least one paid order on this material.');
  const s = nestSettings(settings, material);
  const unplaced: JobSummary['unplaced'] = [];
  const groups: { orderId: string; parts: NestPart[] }[] = [];
  for (const o of chosen) {
    try {
      groups.push({ orderId: o.id, parts: orderParts(o, deps).parts });
    } catch (e) {
      unplaced.push({ orderNumber: o.number, partName: 'whole sign', reason: `the engine couldn’t make it: ${(e as Error).message}` });
    }
  }
  const { r, method } = pack(groups, await availableBins(db, materialId, settings), s, settings.nesting.method);
  const inv = await getInventory(db, materialId);
  const summary: JobSummary = {
    orderIds: chosen.map((o) => o.id),
    orderNumbers: chosen.map((o) => o.number),
    newSheets: r.newSheets,
    sparePanelsUsed: r.sparePanelsUsed,
    sparePanelsLeft: r.sparePanelsLeft,
    offcutsUsed: r.offcutsUsed,
    unplaced: [...unplaced, ...r.unplaced],
    costs: materialCosts(r.bins, material, settings, s.spacingIn),
    marginIn: s.marginIn,
    spacingIn: s.spacingIn,
    method,
    ...(r.newSheets > inv.full_sheets && { inventoryWarning: `This plan needs ${r.newSheets} new sheet${r.newSheets === 1 ? '' : 's'}; inventory shows ${inv.full_sheets}.` }),
  };
  const id = await createJob(db, { materialId, bins: r.bins, utilization: round4(r.utilization), summary }, actor);
  await storePanelFiles(deps, id);
  return id;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Packs with the method from Settings → Nesting: rectangle, true_shape, or best
 * (both, keeping whichever needs fewer new sheets, then fewer panels; rectangle on a tie).
 */
export function pack(groups: { orderId: string; parts: NestPart[] }[], bins: BinSpec[], s: NestSettings, method: string): { r: NestResult; method: 'rectangle' | 'true_shape' } {
  if (method === 'true_shape') return { r: nestTrueShape(groups, bins, s), method: 'true_shape' };
  const rect = nest(groups, bins, s);
  if (method !== 'best') return { r: rect, method: 'rectangle' };
  const shaped = nestTrueShape(groups, bins, s);
  const score = (x: NestResult) => x.unplaced.length * 1e6 + x.newSheets * 1e3 + x.bins.length;
  return score(shaped) < score(rect) ? { r: shaped, method: 'true_shape' } : { r: rect, method: 'rectangle' };
}

/**
 * "Plan next batch": paid orders by needed-by date (rush first), adding orders
 * while the plan still fits on one new sheet beyond the offcuts and spare panels.
 */
export async function nextBatch(deps: Deps, materialId: string): Promise<string[]> {
  const { db, catalog, settings } = deps;
  const material = catalog.find((o) => o.id === materialId);
  const s = { ...nestSettings(settings, material), timeLimitMs: 500 };
  const bins = await availableBins(db, materialId, settings);
  const picked: { orderId: string; parts: NestPart[] }[] = [];
  for (const o of await nestableOrders(db, materialId)) {
    let parts: NestPart[];
    try {
      parts = orderParts(o, deps).parts;
    } catch {
      continue;
    }
    const trial = nest([...picked, { orderId: o.id, parts }], bins, s);
    if (trial.newSheets > 1 || trial.unplaced.length) break;
    picked.push({ orderId: o.id, parts });
  }
  return picked.map((p) => p.orderId);
}

/** The LightBurn SVG for one panel of a job, rebuilt from its orders' saved designs. */
export async function panelFile(deps: Deps, job: NestJob, binId: string): Promise<{ name: string; svg: string } | null> {
  const bin = job.panels.find((b) => b.id === binId);
  if (!bin) return null;
  const material = deps.catalog.find((o) => o.id === job.material_option_id);
  const orderIds = [...new Set(bin.placements.map((p) => p.orderId))];
  const rows = orderIds.length
    ? await deps.db.query<{ id: string; number: string; design: any }>('select id, number, design from orders where id = any($1::uuid[])', [orderIds])
    : [];
  const engines = new Map(rows.map((o) => [o.id, orderParts({ ...o, design: typeof o.design === 'string' ? JSON.parse(o.design) : o.design }, deps)]));
  const items = bin.placements.flatMap((placed) => {
    const e = engines.get(placed.orderId);
    const part = e?.byKey.get(placed.key);
    return e && part ? [{ placed, part, result: e.result }] : [];
  });
  const date = new Date(job.created_at).toISOString().slice(0, 10);
  const tag = material?.values.file_tag ?? job.material_option_id;
  const name =
    bin.kind === 'panel'
      ? panelFileName(date, tag, bin.sheet!, bin.half!)
      : `${date}_${String(tag).replace(/[^A-Za-z0-9-]+/g, '')}_${bin.kind === 'spare' ? `Spare${bin.id.replace(/\D/g, '')}` : `Offcut-${fmt(bin.w)}x${fmt(bin.h)}`}.svg`;
  const svg = panelSvg(bin, items, { export: deps.settings.export as ExportSettings, materialName: material?.values.lightburn_name ?? material?.label ?? '', title: `${bin.label} · ${job.summary.orderNumbers.join(', ')}` });
  return { name, svg };
}

/** Stores each panel's file (best effort), so the layout can be re-downloaded exactly as cut. */
export async function storePanelFiles(deps: Deps, jobId: string) {
  if (!deps.upload) return;
  const job = await getJob(deps.db, jobId);
  if (!job) return;
  const files: Record<string, string> = {};
  for (const b of job.panels) {
    const f = await panelFile(deps, job, b.id);
    if (!f) continue;
    const path = `nesting/${jobId}/${f.name}`;
    const up = await deps.upload(path, f.svg, 'image/svg+xml');
    if (up.ok) files[b.id] = path;
  }
  if (Object.keys(files).length) await deps.db.query("update nest_jobs set summary = summary || jsonb_build_object('files', $2::jsonb) where id = $1", [jobId, JSON.stringify(files)]);
}

/** Saves a hand-adjusted layout after checking every part is inside its panel and clear of the others. */
export async function adjustLayout(deps: Deps, jobId: string, bins: BinLayout[], actor: string): Promise<void> {
  const job = await getJob(deps.db, jobId);
  if (!job) throw new NestError('Job not found.');
  const s = { marginIn: job.summary.marginIn, spacingIn: job.summary.spacingIn };
  // only positions can change: same bins, same parts, same sizes and turns
  const next: BinLayout[] = job.panels.map((b) => ({ ...b, placements: [] }));
  for (const nb of bins)
    for (const p of nb.placements) {
      const orig = job.panels.flatMap((b) => b.placements).find((q) => q.key === p.key);
      const target = next.find((b) => b.id === nb.id);
      if (!orig || !target) throw new NestError('That layout doesn’t match this job.');
      target.placements.push({ ...orig, x: Number(p.x), y: Number(p.y) });
    }
  if (next.reduce((n, b) => n + b.placements.length, 0) !== job.panels.reduce((n, b) => n + b.placements.length, 0)) throw new NestError('A part is missing from the layout.');
  let errors: string[];
  if (job.summary.method === 'true_shape') {
    // exact check on the real outlines
    const shapes = new Map<string, import('@/lib/engine/types').Shape>();
    const ids = [...new Set(next.flatMap((b) => b.placements.map((p) => p.orderId)))];
    const rows = await deps.db.query<{ id: string; number: string; design: any }>('select id, number, design from orders where id = any($1::uuid[])', [ids]);
    for (const o of rows) for (const [k, part] of orderParts({ ...o, design: typeof o.design === 'string' ? JSON.parse(o.design) : o.design }, deps).byKey) shapes.set(k, part.cut);
    errors = next.flatMap((b) => checkTrueShape(b, shapes, s));
  } else errors = next.flatMap((b) => checkLayout(b, s));
  if (errors.length) throw new NestError(errors[0]);
  const material = deps.catalog.find((o) => o.id === job.material_option_id);
  const used = next.filter((b) => b.placements.length);
  const area = used.reduce((t, b) => t + b.w * b.h, 0);
  const util = area ? used.reduce((t, b) => t + b.placements.reduce((u, p) => u + p.area, 0), 0) / area : 0;
  const summary = { ...job.summary, costs: materialCosts(next, material, deps.settings, s.spacingIn) };
  delete summary.files;
  await saveLayout(deps.db, jobId, next, summary, round4(util), actor);
  await storePanelFiles(deps, jobId);
}

/** Marks a job as cut, saving each panel's usable leftovers as offcuts. */
export async function cutJob(deps: Deps, jobId: string, actor: string) {
  const job = await getJob(deps.db, jobId);
  if (!job) throw new NestError('Job not found.');
  const material = deps.catalog.find((o) => o.id === job.material_option_id);
  const s = nestSettings(deps.settings, material);
  const left: Record<string, ReturnType<typeof leftovers>> = {};
  for (const b of job.panels) if (b.placements.length) left[b.id] = leftovers(b, s);
  return markJobCut(deps.db, jobId, left, actor);
}

/** Each placed part's real outline, turned and with its top-left corner at 0,0, as SVG path data (for drawing the layout). */
export async function jobOutlines(deps: Deps, job: NestJob): Promise<Record<string, string>> {
  const ids = [...new Set(job.panels.flatMap((b) => b.placements.map((p) => p.orderId)))];
  if (!ids.length) return {};
  const rows = await deps.db.query<{ id: string; number: string; design: any }>('select id, number, design from orders where id = any($1::uuid[])', [ids]);
  const parts = new Map<string, Part>();
  for (const o of rows) {
    try {
      for (const [k, p] of orderParts({ ...o, design: typeof o.design === 'string' ? JSON.parse(o.design) : o.design }, deps).byKey) parts.set(k, p);
    } catch {}
  }
  const out: Record<string, string> = {};
  for (const b of job.panels)
    for (const p of b.placements) {
      const part = parts.get(p.key);
      if (part) out[p.key] = pathData(turn(part.cut, p.rotation), 2);
    }
  return out;
}
