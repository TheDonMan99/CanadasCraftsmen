// POST /api/orders, minus the HTTP: validates the design, recalculates the price,
// runs the engine, saves the order and its files, and sends both emails.
// Outside services are passed in, so tests can run it against a real database.

import { createHash } from 'node:crypto';
import type { CatalogOption, Settings } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import type { Db } from '@/lib/db/client';
import { addOrderFile, countActiveOrders, createOrder, logEmail, recordSubmission } from '@/lib/db/orders';
import { fromLine, renderEmail, type TemplateKey, type Vars } from '@/lib/email/templates';
import { runEngine, type EngineResult } from '@/lib/engine';
import type { LoadedFont } from '@/lib/engine/font';
import { cutFileSvg, cutLayerDxf, orderFileName, previewSvg, type ExportSettings } from '@/lib/export';
import { svgToPng } from '@/lib/export/png';
import { checkOrderDesign, designLabels, engineDesign, previewColours, quoteInput, type DesignLabels, type OrderDesign } from '@/lib/order/design';
import { checkContact, earliestReadyDate, formatDate, localToday, paymentInstructions, refundPolicy, type Contact } from '@/lib/order/rules';
import { dollars, quote, type Quote } from '@/lib/pricing';
import type { Attachment, SendEmail } from './email';
import type { Upload } from './storage';
import type { VerifyTurnstile } from './turnstile';

export interface SubmitBody {
  design: OrderDesign;
  contact: Contact;
  proofApproved: boolean;
  turnstileToken?: string;
  /** Honeypot: hidden from people, so only bots fill it in. */
  website?: string;
  /** Anything else the browser sends (a price, a total) is ignored. */
  [k: string]: unknown;
}

export interface SubmitDeps {
  db: Db;
  catalog: CatalogOption[];
  settings: Settings;
  loadFont: (file: string) => LoadedFont;
  sendEmail: SendEmail;
  upload: Upload;
  verifyTurnstile: VerifyTurnstile;
  siteUrl: string;
  notifyEmail: string | null;
  ip: string | null;
  deviceId: string | null;
  now?: Date;
  source?: string;
  createdBy?: string;
}

export type SubmitResult =
  | { status: 201; body: { number: string; token: string; confirmationUrl: string; totalCents: number; amountDueCents: number } }
  | { status: 400 | 403 | 422 | 429 | 503; body: { error: string; errors?: string[] } };

const fail = (status: 400 | 403 | 422 | 429 | 503, error: string, errors?: string[]): SubmitResult => ({ status, body: { error, ...(errors && { errors }) } });

/** The test sender Resend allows before a domain is verified; it only delivers to the account's own address. */
export const RESEND_TEST_SENDER = 'onboarding@resend.dev';

export async function submitOrder(body: SubmitBody, deps: SubmitDeps): Promise<SubmitResult> {
  const { db, catalog, settings } = deps;
  const now = deps.now ?? new Date();
  if (settings.production.paused) return fail(503, settings.production.pause_message || 'We’re not taking new orders right now.');
  if (!body || typeof body !== 'object' || !body.design || typeof body.design !== 'object' || !body.contact || typeof body.contact !== 'object')
    return fail(400, 'Expected { design, contact, proofApproved }');

  // spam protection: honeypot, Turnstile, then the hourly limit per device
  if (settings.spam.honeypot && typeof body.website === 'string' && body.website.trim()) return fail(400, 'Your order could not be sent.');
  if (settings.spam.turnstile) {
    const v = await deps.verifyTurnstile(body.turnstileToken, deps.ip);
    if (!v.ok) return fail(403, 'The spam check failed. Reload the page and try again.');
  }
  const key = createHash('sha256').update(`${deps.ip ?? ''}|${deps.deviceId ?? ''}`).digest('hex');
  const recent = await recordSubmission(db, key, now);
  if (recent > settings.spam.max_submissions_per_hour) return fail(429, 'Too many orders from this device in the last hour. Please try again later, or message us.');

  // the design: the product's rules, the price (always recalculated here), then the engine
  const design = body.design;
  const designErrors = checkOrderDesign(design, catalog);
  if (designErrors.length) return fail(422, designErrors[0], designErrors);
  if (!body.proofApproved) return fail(422, 'Please check the proof and tick the box to approve it.');

  const ctx = buildContext(catalog, settings, deps.loadFont, design.materialId);
  const ed = engineDesign(design, catalog, settings);
  let result: EngineResult;
  try {
    result = runEngine(ed, ctx);
  } catch (err) {
    return fail(422, 'This design couldn’t be made. Try another font or size.', [String(err)]);
  }
  if (!result.ok) return fail(422, result.failures[0]?.message ?? 'This design can’t be cut as it is.', result.failures.map((f) => f.message));

  const q = quote(quoteInput(design, result.widthIn), catalog, settings);
  if (!q.ok) return fail(422, q.errors[0], q.errors);

  // contact details and dates
  const rushAddon = design.addonIds.some((id) => catalog.find((o) => o.id === id)?.values.rush);
  const active = await countActiveOrders(db);
  const earliest = earliestReadyDate(settings, localToday(settings, now), rushAddon, active);
  const delivery = catalog.find((o) => o.id === design.deliveryId);
  const contact: Contact = {
    name: String(body.contact.name ?? '').trim(),
    email: String(body.contact.email ?? '').trim(),
    phone: String(body.contact.phone ?? '').trim(),
    address: String(body.contact.address ?? '').trim(),
    neededBy: body.contact.neededBy ? String(body.contact.neededBy) : undefined,
    heardFrom: String(body.contact.heardFrom ?? '').trim().slice(0, 60),
    notes: String(body.contact.notes ?? '').trim(),
  };
  const contactErrors = checkContact(contact, { needsAddress: !!delivery?.values.needs_address, earliest, rush: rushAddon });
  if (contactErrors.length) return fail(422, contactErrors[0], contactErrors);

  // save the order with a full snapshot of what was picked and what it cost
  const labels = designLabels(design, catalog);
  const saved = await createOrder(db, {
    customer: { name: contact.name, email: contact.email, phone: contact.phone, source: deps.source ?? contact.heardFrom ?? null },
    product: design.productId,
    design: { ...design, engine: ed, labels, heardFrom: contact.heardFrom, earliestReady: earliest },
    widthIn: round3(result.widthIn),
    heightIn: round3(result.heightIn),
    priceBreakdown: q,
    totalCents: q.totalCents,
    depositRequiredCents: q.amountDueCents,
    placement: design.placementId,
    deliveryMethod: design.deliveryId,
    deliveryAddress: delivery?.values.needs_address ? contact.address || null : null,
    neededBy: contact.neededBy ?? null,
    rush: !!rushAddon,
    source: deps.source ?? (contact.heardFrom || null),
    createdBy: deps.createdBy ?? 'customer',
    proofApprovedAt: now,
    engineReport: result.report,
    notesCustomer: contact.notes || null,
  });

  // files: LightBurn SVG, preview PNG and (when on) DXF, kept in private storage
  const ex = settings.export as ExportSettings;
  const m = settings.machine;
  const lastName = contact.name.split(/\s+/).at(-1) ?? 'Customer';
  const sizeIn = ed.layout === 'vertical' ? ed.heightIn ?? 0 : ed.widthIn ?? 0;
  const name = (ext: string) => orderFileName(saved.number, lastName, sizeIn, ctx.material.fileTag, ext);
  const svg = cutFileSvg(result, {
    export: ex,
    materialName: ctx.material.lightburnName,
    label: `${saved.number} ${lastName}`,
    maxRowWidthIn: m.panel_w_in - 2 * m.panel_edge_margin_in,
    spacingIn: settings.nesting.part_spacing_in,
    marginIn: 0.25,
  });
  const png = svgToPng(previewSvg(result, { colours: previewColours(design, catalog), background: 'plain', showDimensions: true, showThin: false }), 1200);
  const files: { kind: 'svg' | 'png' | 'dxf'; name: string; body: Buffer | string; type: string }[] = [
    { kind: 'svg', name: name('svg'), body: svg, type: 'image/svg+xml' },
    { kind: 'png', name: name('png'), body: png, type: 'image/png' },
  ];
  if (settings.export.dxf_enabled) files.push({ kind: 'dxf', name: name('dxf'), body: cutLayerDxf(result.parts.flatMap((p) => p.cut)), type: 'application/dxf' });
  for (const f of files) {
    const path = `orders/${saved.number}/v1/${f.name}`;
    const up = await deps.upload(path, f.body, f.type);
    if (up.ok) await addOrderFile(db, saved.id, f.kind, path);
    else console.warn(`[orders] ${saved.number}: ${f.kind} not stored: ${up.error}`);
  }

  // emails: the alert to you always tries; customer emails wait for your own sending domain
  const vars = orderEmailVars({ number: saved.number, contact, labels, quote: q, settings, catalog, earliest, siteUrl: deps.siteUrl, orderId: saved.id, sizeIn, vertical: ed.layout === 'vertical', delivery });
  const preview: Attachment = { filename: name('png'), content: png, contentType: 'image/png', contentId: 'sign-preview' };
  const ownerTo = deps.notifyEmail || settings.emails.notify_email;
  await sendTemplate(deps, saved.id, 'new_order_alert', ownerTo, vars, q, [preview, { filename: name('svg'), content: svg, contentType: 'image/svg+xml' }], false);
  await sendTemplate(deps, saved.id, 'order_received', contact.email, vars, q, [preview], true);

  return {
    status: 201,
    body: {
      number: saved.number,
      token: saved.public_token,
      confirmationUrl: `/order/${saved.number}/confirmation?t=${saved.public_token}`,
      totalCents: q.totalCents,
      amountDueCents: q.amountDueCents,
    },
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

async function sendTemplate(deps: SubmitDeps, orderId: string, key: TemplateKey, to: string, vars: Vars, q: Quote, attachments: Attachment[], toCustomer: boolean) {
  const em = deps.settings.emails;
  const t = em.templates[key];
  if (!t?.enabled || !to) return;
  const { subject, text, html } = renderEmail(t, vars, { previewCid: 'sign-preview', lines: q.lines, totalCents: q.totalCents, showBreakdown: deps.settings.pricing.show_breakdown });
  if (toCustomer && !em.from_address) {
    await logEmail(deps.db, { orderId, template: key, recipient: to, subject, status: 'held', error: 'Waiting for a verified sending domain (Settings → Emails → from address)' });
    return;
  }
  const res = await deps.sendEmail({ from: fromLine(em.from_name, em.from_address || RESEND_TEST_SENDER), to, replyTo: em.reply_to || undefined, subject, text, html, attachments });
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
}

export function orderEmailVars(o: {
  number: string;
  contact: Contact;
  labels: DesignLabels;
  quote: Quote;
  settings: Settings;
  catalog: CatalogOption[];
  earliest: string;
  siteUrl: string;
  orderId: string;
  sizeIn: number;
  vertical: boolean;
  delivery?: CatalogOption;
}): Vars {
  const { contact, labels, quote: q, settings } = o;
  const parts = contact.name.split(/\s+/);
  const needsAddress = !!o.delivery?.values.needs_address;
  const finish = [labels.finish, ...labels.colours.filter(Boolean)].join(', ');
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
    delivery_note: needsAddress
      ? `We'll be in touch to arrange delivery in ${settings.business.delivery_area}.`
      : settings.business.pickup_note,
    total: dollars(q.totalCents),
    deposit: dollars(q.amountDueCents),
    amount_due: dollars(q.amountDueCents),
    balance: dollars(q.totalCents),
    paid_status: 'UNPAID',
    payment_instructions: paymentInstructions(o.catalog, settings, o.number, q.amountDueCents).join('\n'),
    refund_policy: refundPolicy(settings),
    needed_by: contact.neededBy ? formatDate(contact.neededBy) : `No date given (earliest ${formatDate(o.earliest)})`,
    heard_from: contact.heardFrom || '—',
    notes: contact.notes || '—',
    dashboard_link: `${o.siteUrl}/admin/orders/${o.orderId}`,
    proof_link: '',
    business_name: settings.business.name.startsWith('[') ? '' : settings.business.name,
  };
}
