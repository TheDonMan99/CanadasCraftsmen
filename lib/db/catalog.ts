// Catalog reads and edits. Every change is written to the audit log; price
// changes are also recorded in catalog_price_history by a database trigger.

import type { CatalogOption, PriceType } from '@/lib/config/catalog';
import type { Db } from './client';

const COLS = `o.id, o.category, o.label, o.description, o.enabled, o.stock_status, o.sort_order, o.price_type, o.price_value, o.applies_to, o."values", o.internal_notes,
  f.font_file, f.licence_file, f.licence_confirmed, f.allowed_lines, f.auto_thicken_in`;

function toOption(r: any): CatalogOption {
  const values = typeof r.values === 'string' ? JSON.parse(r.values) : { ...r.values };
  // the fonts table is the source of truth for font files and licence fields
  if (r.font_file) Object.assign(values, {
    font_file: r.font_file, licence_file: r.licence_file, licence_confirmed: r.licence_confirmed,
    allowed_lines: r.allowed_lines, auto_thicken_in: Number(r.auto_thicken_in),
  });
  return {
    id: r.id, category: r.category, label: r.label, description: r.description, enabled: r.enabled, stock_status: r.stock_status,
    sort_order: r.sort_order, price_type: r.price_type, price_value: r.price_value, applies_to: r.applies_to, values, internal_notes: r.internal_notes,
  };
}

export async function listCatalog(db: Db, opts: { enabledOnly?: boolean } = {}): Promise<CatalogOption[]> {
  const rows = await db.query(`select ${COLS} from catalog_options o left join fonts f on f.option_id = o.id
    ${opts.enabledOnly ? 'where o.enabled' : ''} order by o.category, o.sort_order, o.id`);
  return rows.map(toOption);
}

export async function getOption(db: Db, id: string): Promise<CatalogOption | null> {
  const rows = await db.query(`select ${COLS} from catalog_options o left join fonts f on f.option_id = o.id where o.id = $1`, [id]);
  return rows[0] ? toOption(rows[0]) : null;
}

export interface OptionPatch {
  label?: string;
  description?: string;
  enabled?: boolean;
  stock_status?: 'in_stock' | 'out_of_stock';
  sort_order?: number;
  price_type?: PriceType;
  price_value?: number;
  applies_to?: string[] | null;
  values?: Record<string, any>;
  internal_notes?: string;
}

const FONT_FIELDS = ['font_file', 'licence_file', 'licence_confirmed', 'allowed_lines', 'auto_thicken_in'] as const;

export class CatalogError extends Error {}

function validate(o: CatalogOption) {
  if (!o.label.trim()) throw new CatalogError('Label is required.');
  if (!Number.isInteger(o.price_value)) throw new CatalogError('Price must be a whole number of cents.');
  if (o.price_type === 'percent' && (o.price_value < -100 || o.price_value > 1000)) throw new CatalogError('Percent must be between -100 and 1000.');
  if (o.category === 'font' && o.enabled && !o.values.licence_confirmed) throw new CatalogError("A font can't be switched on until its commercial licence is confirmed.");
}

export async function updateOption(db: Db, id: string, patch: OptionPatch, actor: string): Promise<CatalogOption> {
  return db.tx(async (t) => {
    const before = await getOption(t, id);
    if (!before) throw new CatalogError(`No option ${id}.`);
    const after: CatalogOption = { ...before, ...patch, values: patch.values ? { ...before.values, ...patch.values } : before.values };
    validate(after);
    // write the font fields first so the licence check sees the new state
    if (after.category === 'font') {
      const v = after.values;
      await t.query(
        `insert into fonts (option_id, font_file, licence_file, licence_confirmed, allowed_lines, auto_thicken_in) values ($1,$2,$3,$4,$5,$6)
         on conflict (option_id) do update set font_file = excluded.font_file, licence_file = excluded.licence_file, licence_confirmed = excluded.licence_confirmed,
         allowed_lines = excluded.allowed_lines, auto_thicken_in = excluded.auto_thicken_in`,
        [id, v.font_file, v.licence_file ?? null, !!v.licence_confirmed, v.allowed_lines ?? ['top', 'main'], v.auto_thicken_in ?? 0],
      );
    }
    const values = { ...after.values };
    if (after.category === 'font') for (const k of FONT_FIELDS) delete values[k];
    await t.query(
      `update catalog_options set label=$2, description=$3, enabled=$4, stock_status=$5, sort_order=$6, price_type=$7, price_value=$8, applies_to=$9, "values"=$10, internal_notes=$11 where id=$1`,
      [id, after.label, after.description, after.enabled, after.stock_status, after.sort_order, after.price_type, after.price_value, after.applies_to, JSON.stringify(values), after.internal_notes],
    );
    await audit(t, actor, 'update', 'catalog_option', id, before, after);
    return (await getOption(t, id))!;
  });
}

export async function setEnabled(db: Db, ids: string[], enabled: boolean, actor: string): Promise<void> {
  for (const id of ids) await updateOption(db, id, { enabled }, actor);
}

/** Save a new order for a category; ids not listed keep their place after the listed ones. */
export async function reorder(db: Db, category: string, ids: string[], actor: string): Promise<void> {
  await db.tx(async (t) => {
    for (let i = 0; i < ids.length; i++)
      await t.query('update catalog_options set sort_order = $1 where id = $2 and category = $3', [(i + 1) * 10, ids[i], category]);
    await audit(t, actor, 'reorder', 'catalog_option', category, null, { ids });
  });
}

export async function createOption(db: Db, o: CatalogOption, actor: string): Promise<CatalogOption> {
  validate(o);
  return db.tx(async (t) => {
    const exists = await t.query('select 1 from catalog_options where id = $1', [o.id]);
    if (exists.length) throw new CatalogError(`An option with id ${o.id} already exists.`);
    const max = await t.query<{ m: number | null }>('select max(sort_order) as m from catalog_options where category = $1', [o.category]);
    const sort = o.sort_order || (Number(max[0]?.m ?? 0) + 10);
    const values = { ...o.values };
    if (o.category === 'font') for (const k of FONT_FIELDS) delete values[k];
    await t.query(
      `insert into catalog_options (id, category, label, description, enabled, stock_status, sort_order, price_type, price_value, applies_to, "values", internal_notes)
       values ($1,$2,$3,$4,false,$5,$6,$7,$8,$9,$10,$11)`,
      [o.id, o.category, o.label, o.description, o.stock_status, sort, o.price_type, o.price_value, o.applies_to, JSON.stringify(values), o.internal_notes],
    );
    if (o.category === 'font')
      await t.query('insert into fonts (option_id, font_file, licence_file, licence_confirmed, allowed_lines, auto_thicken_in) values ($1,$2,$3,$4,$5,$6)',
        [o.id, o.values.font_file, o.values.licence_file ?? null, !!o.values.licence_confirmed, o.values.allowed_lines ?? ['top', 'main'], o.values.auto_thicken_in ?? 0]);
    if (o.category === 'material') await t.query('insert into inventory (material_option_id) values ($1) on conflict do nothing', [o.id]);
    await audit(t, actor, 'create', 'catalog_option', o.id, null, o);
    // switch on afterwards so the usual rules (font licence) apply
    if (o.enabled) await updateOption(t, o.id, { enabled: true }, actor);
    return (await getOption(t, o.id))!;
  });
}

/** Copy an option, switched off, with a fresh id. */
export async function duplicateOption(db: Db, id: string, actor: string): Promise<CatalogOption> {
  const src = await getOption(db, id);
  if (!src) throw new CatalogError(`No option ${id}.`);
  let n = 2;
  while (await getOption(db, `${id}-copy${n === 2 ? '' : n}`)) n++;
  const newId = `${id}-copy${n === 2 ? '' : n}`;
  return createOption(db, { ...src, id: newId, label: `${src.label} (copy)`, enabled: false, sort_order: 0 }, actor);
}

export async function priceHistory(db: Db, id: string) {
  return db.query<{ old_price: number; new_price: number; old_price_type: string; new_price_type: string; changed_at: string }>(
    'select old_price, new_price, old_price_type, new_price_type, changed_at from catalog_price_history where option_id = $1 order by changed_at desc, id desc',
    [id],
  );
}

export async function audit(db: Db, actor: string, action: string, entity: string, entityId: string | null, before: unknown, after: unknown) {
  await db.query('insert into audit_log (actor, action, entity, entity_id, before, after) values ($1,$2,$3,$4,$5,$6)', [
    actor, action, entity, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after),
  ]);
}
