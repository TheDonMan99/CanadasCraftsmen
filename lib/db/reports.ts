// The rows behind the reports and CSV exports.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { ReportOrder, ReportPayment } from '@/lib/reports';
import type { Db } from './client';

const json = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);

/** Orders placed on or after `since` (YYYY-MM-DD), with what's been paid and their material cost. */
export async function reportOrders(db: Db, settings: Settings, catalog: CatalogOption[], since = '1970-01-01'): Promise<(ReportOrder & { email: string; phone: string | null; text: string; material: string; createdBy: string | null })[]> {
  const tz = settings.business.timezone || 'America/Edmonton';
  const rows = await db.query(
    `select o.id, o.number, to_char(o.created_at at time zone $2, 'YYYY-MM-DD') as date, o.status, o.total, o.design, o.engine_report, o.source, o.created_by,
            to_char(o.needed_by, 'YYYY-MM-DD') as needed_by, c.name, c.email, c.phone,
            coalesce((select sum(case when p.kind = 'refund' then -p.amount else p.amount end) from payments p where p.order_id = o.id), 0)::int as paid
       from orders o join customers c on c.id = o.customer_id
      where (o.created_at at time zone $2)::date >= $1::text::date
      order by o.created_at`,
    [since, tz],
  );
  // material cost from cut nest jobs, by order
  const costs = new Map<string, number>();
  for (const j of await db.query<{ summary: any }>("select summary from nest_jobs where status = 'cut'")) {
    for (const [id, c] of Object.entries((json(j.summary).costs ?? {}) as Record<string, number>)) costs.set(id, (costs.get(id) ?? 0) + c);
  }
  const sheetArea = settings.machine.sheet_w_in * settings.machine.sheet_h_in;
  const spacing = settings.nesting.part_spacing_in;
  return rows.map((r) => {
    const design = json(r.design) ?? {};
    const report = json(r.engine_report) ?? {};
    const l = design.labels ?? {};
    const sheetCost = catalog.find((m) => m.id === design.materialId)?.values.sheet_cost_cents as number | undefined;
    const w = Number(report.widthIn ?? design.engine?.widthIn ?? 0), h = Number(report.heightIn ?? design.engine?.heightIn ?? 0);
    return {
      id: r.id,
      number: r.number,
      date: r.date,
      status: r.status,
      total: r.total,
      paid: r.paid,
      product: l.product ?? r.product ?? '',
      size: l.size ?? '',
      finish: [l.finish, ...(l.colours ?? [])].filter(Boolean).join(', '),
      source: r.source ?? '',
      customer: r.name,
      email: r.email,
      phone: r.phone,
      neededBy: r.needed_by,
      text: (l.lines ?? []).map((x: any) => x.text).join(' / '),
      material: l.material ?? '',
      createdBy: r.created_by,
      materialCost: costs.has(r.id) ? costs.get(r.id)! : null,
      materialEstimate: sheetCost && w && h ? Math.round(((w + spacing) * (h + spacing) * sheetCost) / sheetArea) : null,
      laserMinutes: Number(report.laserMinutes ?? 0),
    };
  });
}

// received dates are entered as calendar dates (stored as midnight UTC), so read them in UTC;
// payments without one fall back to the day they were recorded, in the business's time zone
const PAID_DATE = `coalesce(to_char(p.received_at at time zone 'UTC', 'YYYY-MM-DD'), to_char(p.recorded_at at time zone $2, 'YYYY-MM-DD'))`;

export async function reportPayments(db: Db, settings: Settings, since = '1970-01-01'): Promise<(ReportPayment & { note: string | null })[]> {
  const tz = settings.business.timezone || 'America/Edmonton';
  const rows = await db.query(
    `select p.order_id, o.number, p.amount, p.kind, p.method, p.reference, p.note,
            ${PAID_DATE} as date
       from payments p join orders o on o.id = p.order_id
      where ${PAID_DATE} >= $1::text
      order by ${PAID_DATE}, p.recorded_at`,
    [since, tz],
  );
  return rows.map((r) => ({ orderId: r.order_id, orderNumber: r.number, amount: r.amount, kind: r.kind, method: r.method, reference: r.reference, note: r.note, date: r.date }));
}
