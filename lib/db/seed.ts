// Seed the database from config/catalog.seed.json and config/settings.seed.json.
// Only missing rows are added, so re-running never overwrites your edits.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { Db } from './client';

export const DEFAULT_ROLES: Record<string, Record<string, boolean>> = {
  owner: {
    view_orders: true, edit_orders: true, view_prices: true, view_payments: true, record_payments: true,
    view_contacts: true, view_board: true, download_files: true, manage_nesting: true, manage_inventory: true,
    view_reports: true, edit_catalog: true, edit_settings: true, manage_users: true,
  },
  production: {
    view_orders: false, edit_orders: false, view_prices: false, view_payments: false, record_payments: false,
    view_contacts: false, view_board: true, download_files: true, manage_nesting: true, manage_inventory: true,
    view_reports: false, edit_catalog: false, edit_settings: false, manage_users: false,
  },
};

export async function seedDatabase(db: Db, catalog: CatalogOption[], settings: Settings): Promise<{ options: number; settings: boolean }> {
  return db.tx(async (t) => {
    const s = await t.query('insert into settings (id, data) values (1, $1) on conflict (id) do nothing returning id', [JSON.stringify(settings)]);
    let added = 0;
    for (const o of catalog) {
      const r = await t.query(
        `insert into catalog_options (id, category, label, description, enabled, stock_status, sort_order, price_type, price_value, applies_to, "values", internal_notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict (id) do nothing returning id`,
        [o.id, o.category, o.label, o.description, o.enabled, o.stock_status, o.sort_order, o.price_type, o.price_value, o.applies_to, JSON.stringify(o.values), o.internal_notes],
      );
      if (!r.length) continue;
      added++;
      if (o.category === 'font')
        await t.query(
          `insert into fonts (option_id, font_file, licence_file, licence_confirmed, allowed_lines, auto_thicken_in) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
          [o.id, o.values.font_file, o.values.licence_file, !!o.values.licence_confirmed, o.values.allowed_lines, o.values.auto_thicken_in ?? 0],
        );
      if (o.category === 'material')
        await t.query('insert into inventory (material_option_id) values ($1) on conflict do nothing', [o.id]);
    }
    for (const [name, perms] of Object.entries(DEFAULT_ROLES))
      await t.query('insert into roles (name, permissions) values ($1, $2) on conflict do nothing', [name, JSON.stringify(perms)]);
    return { options: added, settings: s.length > 0 };
  });
}
