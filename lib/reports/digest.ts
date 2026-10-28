// The text of the daily digest and the weekly summary (SPEC.md, "Email
// notifications"). Pure, so the content is easy to test.

import { dollars } from '@/lib/pricing';
import { net, type ReportOrder, type ReportPayment } from './index';

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const open = (o: ReportOrder) => !['cancelled', 'complete'].includes(o.status);

/** Unpaid orders with days waiting, orders due this week, and new orders since yesterday. */
export function dailyDigest(orders: ReportOrder[], today: string, lowStock: string[] = []) {
  const unpaid = orders
    .filter((o) => o.status !== 'cancelled' && o.total - o.paid > 0)
    .map((o) => ({ o, waiting: days(o.date, today) }))
    .sort((a, b) => b.waiting - a.waiting);
  const due = orders.filter((o) => open(o) && o.neededBy && o.neededBy >= today && o.neededBy <= addDays(today, 7)).sort((a, b) => a.neededBy!.localeCompare(b.neededBy!));
  const overdue = orders.filter((o) => open(o) && o.neededBy && o.neededBy < today);
  const fresh = orders.filter((o) => o.date >= addDays(today, -1) && o.status !== 'cancelled');
  const lines: string[] = [];
  lines.push(`New orders (${fresh.length})`);
  lines.push(...(fresh.length ? fresh.map((o) => `  ${o.number} · ${o.customer} · ${o.product}, ${o.size} · ${dollars(o.total)}`) : ['  None']));
  lines.push('', `Unpaid (${unpaid.length}, ${dollars(unpaid.reduce((s, x) => s + x.o.total - x.o.paid, 0))} owing)`);
  lines.push(...(unpaid.length ? unpaid.map(({ o, waiting }) => `  ${o.number} · ${o.customer} · ${dollars(o.total - o.paid)} owing · ${waiting} day${waiting === 1 ? '' : 's'}${waiting >= 3 ? ' · send a reminder' : ''}`) : ['  None']));
  lines.push('', `Due this week (${due.length})`);
  lines.push(...(due.length ? due.map((o) => `  ${o.neededBy} · ${o.number} · ${o.customer} · ${o.status.replace(/_/g, ' ')}`) : ['  None']));
  if (overdue.length) lines.push('', `Past their needed-by date (${overdue.length})`, ...overdue.map((o) => `  ${o.neededBy} · ${o.number} · ${o.customer} · ${o.status.replace(/_/g, ' ')}`));
  if (lowStock.length) lines.push('', `Low stock: ${lowStock.join(', ')}`);
  return { text: lines.join('\n'), counts: { new: fresh.length, unpaid: unpaid.length, due: due.length } };
}

export interface CutJobRow {
  cutDate: string;
  material: string;
  newSheets: number;
  offcutsUsed: number;
  materialCost: number;
}

/** The week just ended (Monday to Sunday): money received, orders, unpaid balance, materials used. */
export function weeklySummary(orders: ReportOrder[], payments: ReportPayment[], jobs: CutJobRow[], today: string) {
  const from = addDays(today, -7), to = addDays(today, -1);
  const inWeek = (d: string) => d >= from && d <= to;
  const received = payments.filter((p) => inWeek(p.date)).reduce((s, p) => s + net(p), 0);
  const placed = orders.filter((o) => inWeek(o.date) && o.status !== 'cancelled');
  const owing = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Math.max(0, o.total - o.paid), 0);
  const cut = jobs.filter((j) => inWeek(j.cutDate));
  const sheets = new Map<string, number>();
  for (const j of cut) sheets.set(j.material, (sheets.get(j.material) ?? 0) + j.newSheets);
  const lines = [
    `Week of ${from} to ${to}`,
    '',
    `Money received: ${dollars(received)}`,
    `Orders placed: ${placed.length} (${dollars(placed.reduce((s, o) => s + o.total, 0))})`,
    `Unpaid balance now: ${dollars(owing)}`,
    '',
    `Materials used: ${cut.length ? [...sheets].map(([m, n]) => `${n} sheet${n === 1 ? '' : 's'} of ${m}`).join(', ') : 'nothing cut this week'}`,
    ...(cut.length ? [`Offcuts used: ${cut.reduce((s, j) => s + j.offcutsUsed, 0)} · material cost ${dollars(cut.reduce((s, j) => s + j.materialCost, 0))}`] : []),
  ];
  return { text: lines.join('\n'), received, orders: placed.length, owing };
}
