// Sends an order's emails from the templates in Settings → Emails and records
// each send in email_log. Customer emails wait for your own sending domain.

import type { CatalogOption, Settings } from '@/lib/config/catalog';
import type { Db } from '@/lib/db/client';
import { logEmail } from '@/lib/db/orders';
import { fromLine, renderEmail, type TemplateKey, type Vars } from '@/lib/email/templates';
import type { DesignLabels } from '@/lib/order/design';
import { formatDate, paymentInstructions, refundPolicy, type Contact } from '@/lib/order/rules';
import { dollars, type Quote } from '@/lib/pricing';
import type { Attachment, SendEmail } from './email';

/** The test sender Resend allows before a domain is verified; it only delivers to the account's own address. */
export const RESEND_TEST_SENDER = 'onboarding@resend.dev';

export interface EmailDeps {
  db: Db;
  settings: Settings;
  sendEmail: SendEmail;
}

export type EmailOutcome = 'sent' | 'failed' | 'held' | 'skipped' | 'off';

export async function sendOrderEmail(
  deps: EmailDeps,
  orderId: string,
  key: TemplateKey,
  to: string,
  vars: Vars,
  opt: { quote?: Pick<Quote, 'lines' | 'totalCents'>; attachments?: Attachment[]; toCustomer: boolean },
): Promise<EmailOutcome> {
  const em = deps.settings.emails;
  const t = em.templates[key];
  if (!t?.enabled || !to) return 'off';
  const hasPreview = opt.attachments?.some((a) => a.contentId === 'sign-preview');
  const { subject, text, html } = renderEmail(t, vars, {
    previewCid: hasPreview ? 'sign-preview' : undefined,
    lines: opt.quote?.lines,
    totalCents: opt.quote?.totalCents,
    showBreakdown: !!opt.quote && deps.settings.pricing.show_breakdown,
  });
  if (opt.toCustomer && !em.from_address) {
    await logEmail(deps.db, { orderId, template: key, recipient: to, subject, status: 'held', error: 'Waiting for a verified sending domain (Settings → Emails → from address)' });
    return 'held';
  }
  const res = await deps.sendEmail({ from: fromLine(em.from_name, em.from_address || RESEND_TEST_SENDER), to, replyTo: em.reply_to || undefined, subject, text, html, attachments: opt.attachments });
  await logEmail(deps.db, {
    orderId,
    template: key,
    recipient: to,
    subject,
    status: res.status,
    providerMessageId: res.status === 'sent' ? res.id : null,
    error: res.status === 'sent' ? null : res.error,
  });
  if (res.status === 'failed') console.warn(`[orders] ${key} email to ${to} failed: ${res.error}`);
  return res.status;
}

export function orderEmailVars(o: {
  number: string;
  contact: Contact;
  labels: DesignLabels;
  quote: Pick<Quote, 'totalCents' | 'amountDueCents'>;
  settings: Settings;
  catalog: CatalogOption[];
  earliest: string;
  siteUrl: string;
  orderId: string;
  sizeIn: number;
  vertical: boolean;
  delivery?: CatalogOption;
  paidCents?: number;
  proofLink?: string;
}): Vars {
  const { contact, labels, quote: q, settings } = o;
  const parts = contact.name.trim().split(/\s+/);
  const needsAddress = !!o.delivery?.values.needs_address;
  const finish = [labels.finish, ...labels.colours.filter(Boolean)].join(', ');
  const paid = o.paidCents ?? 0;
  const balance = Math.max(0, q.totalCents - paid);
  return {
    order_number: o.number,
    customer_name: contact.name,
    first_name: parts[0] ?? contact.name,
    last_name: parts.at(-1) ?? contact.name,
    customer_email: contact.email,
    customer_phone: contact.phone,
    product: labels.product,
    text_lines: labels.lines.map((l) => `“${l.text}” in ${l.font}`).join('\n'),
    font: [...new Set(labels.lines.map((l) => l.font))].join(', '),
    size: labels.size,
    size_short: `${Number(o.sizeIn.toFixed(1))} in${o.vertical ? ' tall' : ''}`,
    style: labels.backer ? `${labels.style} (${labels.backer})` : labels.style,
    material: labels.material,
    finish: labels.topcoat && labels.topcoat !== 'None' ? `${finish}, ${labels.topcoat}` : finish,
    placement: labels.placement,
    addons: labels.addons.join(', ') || 'None',
    delivery: contact.address && needsAddress ? `${labels.delivery}: ${contact.address}` : labels.delivery,
    delivery_note: needsAddress ? `We'll be in touch to arrange delivery in ${settings.business.delivery_area}.` : settings.business.pickup_note,
    total: dollars(q.totalCents),
    deposit: dollars(q.amountDueCents),
    amount_due: dollars(Math.max(0, q.amountDueCents - paid)),
    paid: dollars(paid),
    balance: dollars(balance),
    paid_status: balance <= 0 ? 'PAID' : paid > 0 ? 'PART PAID' : 'UNPAID',
    payment_instructions: paymentInstructions(o.catalog, settings, o.number, balance || q.amountDueCents).join('\n'),
    refund_policy: refundPolicy(settings),
    needed_by: contact.neededBy ? formatDate(contact.neededBy) : `No date given (earliest ${formatDate(o.earliest)})`,
    heard_from: contact.heardFrom || '—',
    notes: contact.notes || '—',
    dashboard_link: `${o.siteUrl}/admin/orders/${o.orderId}`,
    proof_link: o.proofLink ?? '',
    business_name: settings.business.name.startsWith('[') ? '' : settings.business.name,
  };
}

/** Email variables for an order already saved, from its snapshot and payments. */
export function storedOrderVars(
  o: {
    id: string;
    number: string;
    design: any;
    total: number;
    deposit_required: number;
    paid: number;
    needed_by: string | null;
    delivery_method: string | null;
    delivery_address: string | null;
    notes_customer: string | null;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
  },
  catalog: CatalogOption[],
  settings: Settings,
  siteUrl: string,
  proofLink?: string,
): Vars {
  const ed = o.design?.engine ?? {};
  return orderEmailVars({
    number: o.number,
    contact: { name: o.customer_name, email: o.customer_email, phone: o.customer_phone ?? '', address: o.delivery_address ?? '', neededBy: o.needed_by ?? undefined, heardFrom: o.design?.heardFrom, notes: o.notes_customer ?? '' },
    labels: o.design?.labels ?? { product: '', lines: [], size: '', style: '', backer: '', material: '', finish: '', colours: [], topcoat: '', placement: '', addons: [], delivery: '' },
    quote: { totalCents: o.total, amountDueCents: o.deposit_required },
    settings,
    catalog,
    earliest: o.design?.earliestReady ?? o.needed_by ?? '',
    siteUrl,
    orderId: o.id,
    sizeIn: (ed.layout === 'vertical' ? ed.heightIn : ed.widthIn) ?? 0,
    vertical: ed.layout === 'vertical',
    delivery: catalog.find((x) => x.id === o.delivery_method),
    paidCents: o.paid,
    proofLink,
  });
}
