import { requirePage } from '@/lib/auth/session';
import { loadCatalog } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { listInventory, openOffcuts } from '@/lib/db/nesting';
import Inventory from './Inventory';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const user = await requirePage('manage_inventory', '/admin/inventory');
  const db = getDb();
  if (!db) return <main className="mx-auto max-w-5xl px-4 py-6 text-stone-600">Inventory needs the database.</main>;
  const [catalog, inv, offcuts] = await Promise.all([loadCatalog(), listInventory(db), openOffcuts(db)]);
  const materials = catalog
    .filter((m) => m.category === 'material' && (m.enabled || inv.some((i) => i.material_option_id === m.id && (i.full_sheets || i.cut_panels))))
    .map((m) => {
      const i = inv.find((x) => x.material_option_id === m.id) ?? { full_sheets: 0, cut_panels: 0, low_stock_alert: 2 };
      return {
        id: m.id,
        label: m.label,
        enabled: m.enabled,
        fullSheets: i.full_sheets,
        cutPanels: i.cut_panels,
        lowStockAlert: i.low_stock_alert,
        sheetCostCents: user.perms.view_prices ? (m.values.sheet_cost_cents as number | null) : null,
        offcuts: offcuts.filter((o) => o.material_option_id === m.id).map((o) => ({ id: o.id, w: o.width_in, h: o.height_in, source: o.source_panel, created: String(o.created_at) })),
      };
    });
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="mt-1 text-sm text-stone-600">
        Full 4 × 8 ft sheets, spare panels (an unused Panel B from a ripped sheet) and offcuts worth keeping. Marking a nest job as cut updates these by itself.
      </p>
      <Inventory materials={materials} canSetCost={user.perms.edit_catalog} />
    </main>
  );
}
