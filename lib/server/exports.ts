// CSV exports of orders and payments, for the reports page and the nightly backup email.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { Db } from '@/lib/db/client';
import { reportOrders, reportPayments } from '@/lib/db/reports';
import { centsToDollars, toCsv } from '@/lib/reports/csv';

export async function exportCsv(kind: string, db: Db, settings: Settings, catalog: CatalogOption[], since = '1970-01-01'): Promise<string | null> {
  if (kind === 'orders') {
    const rows = await reportOrders(db, settings, catalog, since);
    return toCsv(rows, [
      { header: 'Order', value: (r) => r.number },
      { header: 'Date', value: (r) => r.date },
      { header: 'Status', value: (r) => r.status },
      { header: 'Customer', value: (r) => r.customer },
      { header: 'Email', value: (r) => r.email },
      { header: 'Phone', value: (r) => r.phone },
      { header: 'Product', value: (r) => r.product },
      { header: 'Text', value: (r) => r.text },
      { header: 'Size', value: (r) => r.size },
      { header: 'Material', value: (r) => r.material },
      { header: 'Finish', value: (r) => r.finish },
      { header: 'Total', value: (r) => centsToDollars(r.total) },
      { header: 'Paid', value: (r) => centsToDollars(r.paid) },
      { header: 'Balance', value: (r) => centsToDollars(r.total - r.paid) },
      { header: 'Material cost', value: (r) => centsToDollars(r.materialCost ?? r.materialEstimate) },
      { header: 'Needed by', value: (r) => r.neededBy },
      { header: 'Source', value: (r) => r.source },
      { header: 'Entered by', value: (r) => r.createdBy },
    ]);
  }
  if (kind === 'payments') {
    const rows = await reportPayments(db, settings, since);
    return toCsv(rows, [
      { header: 'Date', value: (r) => r.date },
      { header: 'Order', value: (r) => r.orderNumber },
      { header: 'Type', value: (r) => r.kind },
      { header: 'Amount', value: (r) => centsToDollars(r.kind === 'refund' ? -r.amount : r.amount) },
      { header: 'Method', value: (r) => r.method },
      { header: 'Reference', value: (r) => r.reference },
      { header: 'Note', value: (r) => r.note },
    ]);
  }
  return null;
}
