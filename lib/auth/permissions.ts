// Role permissions: each is an on/off switch per role (Settings → Users and roles).
// The owner role always has every permission.

export const PERMISSIONS = {
  view_orders: 'See the orders list, home cards and customers’ orders',
  edit_orders: 'Edit designs, enter orders, change any status, cancel orders',
  view_prices: 'See prices and totals',
  view_payments: 'See payments and balances',
  record_payments: 'Record payments and refunds',
  view_contacts: 'See customer contact details (full name, email, phone, address)',
  view_board: 'Production board, order specs, move orders between In production, Ready and Complete',
  download_files: 'Previews and cut files',
  override_cut_gate: 'Download cut files for unpaid orders (with a reason)',
  manage_nesting: 'Nesting and marking panels as cut',
  manage_inventory: 'Inventory',
  view_reports: 'Reports',
  edit_catalog: 'Catalog',
  edit_settings: 'Settings, emails and reply templates',
  manage_users: 'Users and roles',
} as const;

export type Perm = keyof typeof PERMISSIONS;
export type Perms = Record<Perm, boolean>;

export const OWNER_ROLE = 'owner';

export function permsFor(role: string, stored: Partial<Record<string, boolean>> | null | undefined): Perms {
  const out = {} as Perms;
  for (const p of Object.keys(PERMISSIONS) as Perm[]) out[p] = role === OWNER_ROLE || !!stored?.[p];
  return out;
}
