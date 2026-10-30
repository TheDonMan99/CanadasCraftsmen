// The scheduled emails: daily digest (7:00 am Mountain), weekly summary (Mondays
// at 7:00 am), review requests (3 days after Complete) and the nightly CSV backup
// (off by default). The cron calls this twice a day, at 13:00 and 14:00 UTC, and
// only the call that lands at 7 am local time does anything, so daylight saving
// never shifts it. Each email goes out at most once a day.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { Db } from '@/lib/db/client';
import { lowStock } from '@/lib/db/nesting';
import { reportOrders, reportPayments } from '@/lib/db/reports';
import type { TemplateKey } from '@/lib/email/templates';
import { dailyDigest, weeklySummary, type CutJobRow } from '@/lib/reports/digest';
import type { SendEmail } from './email';
import { exportCsv } from './exports';
import { sendOrderEmail, storedOrderVars } from './order-emails';
import { getOwnerOrder } from '@/lib/db/admin';
import { businessName } from '@/lib/brand';

export interface ScheduledDeps {
  db: Db;
  settings: Settings;
  catalog: CatalogOption[];
  sendEmail: SendEmail;
  siteUrl: string;
  notifyEmail: string | null;
  now?: Date;
}

/** Local date, hour and weekday in the business's time zone. */
export function localClock(settings: Settings, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: settings.business.timezone || 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday as string };
}

async function sentToday(db: Db, settings: Settings, template: string, orderId: string | null, date: string): Promise<boolean> {
  const [r] = await db.query(
    `select 1 from email_log where template = $1 and order_id is not distinct from $2::uuid
        and status in ('sent', 'held', 'skipped') and to_char(sent_at at time zone $3, 'YYYY-MM-DD') = $4 limit 1`,
    [template, orderId, settings.business.timezone || 'America/Edmonton', date],
  );
  return !!r;
}

export type JobResult = { job: string; outcome: string };

/** Runs whatever is due now. `force` runs the named jobs whatever the hour (from the dashboard, or tests). */
export async function runScheduled(deps: ScheduledDeps, opts: { force?: string[] } = {}): Promise<JobResult[]> {
  const { db, settings } = deps;
  const clock = localClock(settings, deps.now);
  const atHour = clock.hour === (settings.emails.digest_hour ?? 7);
  const due = (job: string, when: boolean) => opts.force?.includes(job) || (!opts.force && when);
  const out: JobResult[] = [];
  const owner = deps.notifyEmail || settings.emails.notify_email;
  const base = { date: clock.date, dashboard_link: `${deps.siteUrl}/admin`, business_name: businessName(settings) };
  const send = async (key: TemplateKey, vars: Record<string, string>, appendKey: string, attachments?: { filename: string; content: string; contentType: string }[]) => {
    const t = settings.emails.templates[key];
    if (!t?.enabled) return 'off';
    if (!opts.force && (await sentToday(db, settings, key, null, clock.date))) return 'already sent today';
    // templates saved before {digest}/{summary} existed still get the content
    const tpl = t.body.includes(`{${appendKey}}`) ? t : { ...t, body: `${t.body}\n\n{${appendKey}}` };
    return sendOrderEmail({ db, settings: { ...settings, emails: { ...settings.emails, templates: { ...settings.emails.templates, [key]: tpl } } }, sendEmail: deps.sendEmail, now: deps.now }, null, key, owner, { ...base, ...vars }, { toCustomer: false, attachments });
  };

  if (due('daily_digest', atHour)) {
    const orders = await reportOrders(db, settings, deps.catalog);
    const low = (await lowStock(db)).map((l) => deps.catalog.find((m) => m.id === l.material_option_id)?.label ?? l.material_option_id);
    const d = dailyDigest(orders, clock.date, low);
    out.push({ job: 'daily_digest', outcome: await send('daily_digest', { digest: d.text }, 'digest') });
  }

  if (due('weekly_summary', atHour && clock.weekday === 'Mon')) {
    const since = new Date(Date.parse(`${clock.date}T12:00:00Z`) - 8 * 86_400_000).toISOString().slice(0, 10);
    const [orders, payments, jobs] = await Promise.all([reportOrders(db, settings, deps.catalog), reportPayments(db, settings, since), cutJobs(db, settings, deps.catalog, since)]);
    const w = weeklySummary(orders, payments, jobs, clock.date);
    out.push({ job: 'weekly_summary', outcome: await send('weekly_summary', { summary: w.text }, 'summary') });
  }

  if (due('review_request', atHour)) out.push({ job: 'review_request', outcome: await reviewRequests(deps, clock.date) });

  if (due('nightly_backup', atHour) && settings.emails.nightly_backup) {
    const [o, p] = await Promise.all([exportCsv('orders', db, settings, deps.catalog), exportCsv('payments', db, settings, deps.catalog)]);
    out.push({
      job: 'nightly_backup',
      outcome: await send('nightly_backup', {}, 'date', [
        { filename: `orders-${clock.date}.csv`, content: o!, contentType: 'text/csv' },
        { filename: `payments-${clock.date}.csv`, content: p!, contentType: 'text/csv' },
      ]),
    });
  }
  return out;
}

async function cutJobs(db: Db, settings: Settings, catalog: CatalogOption[], since: string): Promise<CutJobRow[]> {
  const rows = await db.query<{ material_option_id: string; summary: any; cut_date: string }>(
    "select material_option_id, summary, to_char(cut_at at time zone $2, 'YYYY-MM-DD') as cut_date from nest_jobs where status = 'cut' and cut_at >= $1::text::date",
    [since, settings.business.timezone || 'America/Edmonton'],
  );
  return rows.map((r) => {
    const s = typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary;
    return {
      cutDate: r.cut_date,
      material: catalog.find((m) => m.id === r.material_option_id)?.label ?? r.material_option_id,
      newSheets: s.newSheets ?? 0,
      offcutsUsed: (s.offcutsUsed ?? []).length,
      materialCost: Object.values((s.costs ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0),
    };
  });
}

/** Asks for a review 3 days after an order is completed, once per order. */
async function reviewRequests(deps: ScheduledDeps, today: string): Promise<string> {
  const { db, settings } = deps;
  const t = settings.emails.templates.review_request;
  if (!t?.enabled) return 'off';
  if (!settings.business.review_link) return 'no review link set (Settings → Business)';
  const rows = await db.query<{ id: string }>(
    `select o.id from orders o
      where o.status = 'complete'
        and (select max(h.changed_at) from status_history h where h.order_id = o.id and h.to_status = 'complete') at time zone $2 < ($1::text::date - 2)
        and (select max(h.changed_at) from status_history h where h.order_id = o.id and h.to_status = 'complete') at time zone $2 >= ($1::text::date - 10)
        and not exists (select 1 from email_log e where e.order_id = o.id and e.template = 'review_request')`,
    [today, settings.business.timezone || 'America/Edmonton'],
  );
  let sent = 0;
  for (const r of rows) {
    const o = await getOwnerOrder(db, r.id);
    if (!o) continue;
    const vars = { ...storedOrderVars(o, deps.catalog, settings, deps.siteUrl), review_link: settings.business.review_link };
    await sendOrderEmail({ db, settings, sendEmail: deps.sendEmail, now: deps.now }, r.id, 'review_request', o.customer_email, vars, { toCustomer: true });
    sent++;
  }
  return `${sent} review request${sent === 1 ? '' : 's'}`;
}
