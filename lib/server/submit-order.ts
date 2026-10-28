// POST /api/orders, minus the HTTP: validates the design, recalculates the price,
// runs the engine, saves the order and its files, and sends both emails.
// Outside services are passed in, so tests can run it against a real database.

import { createHash } from 'node:crypto';
import type { CatalogOption, Settings } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import type { Db } from '@/lib/db/client';
import { countActiveOrders, createOrder, recordSubmission } from '@/lib/db/orders';
import { runEngine, type EngineResult } from '@/lib/engine';
import type { LoadedFont } from '@/lib/engine/font';
import { checkOrderDesign, designLabels, engineDesign, quoteInput, type OrderDesign } from '@/lib/order/design';
import { checkContact, earliestReadyDate, localToday, type Contact } from '@/lib/order/rules';
import { quote } from '@/lib/pricing';
import type { Attachment, SendEmail } from './email';
import { buildOrderFiles, lastNameOf, storeOrderFiles } from './order-files';
import { orderEmailVars, sendOrderEmail } from './order-emails';
import type { Upload } from './storage';
import type { VerifyTurnstile } from './turnstile';

export { RESEND_TEST_SENDER, orderEmailVars } from './order-emails';

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
  /** Orders you enter yourself: no honeypot, Turnstile or hourly limit. */
  skipSpamChecks?: boolean;
  /** Orders you enter yourself may have any needed-by date. */
  skipLeadTime?: boolean;
  /** Set false to not email the customer (orders you enter yourself). */
  sendCustomerEmail?: boolean;
}

export type SubmitResult =
  | { status: 201; body: { number: string; token: string; confirmationUrl: string; totalCents: number; amountDueCents: number } }
  | { status: 400 | 403 | 422 | 429 | 503; body: { error: string; errors?: string[] } };

const fail = (status: 400 | 403 | 422 | 429 | 503, error: string, errors?: string[]): SubmitResult => ({ status, body: { error, ...(errors && { errors }) } });


export async function submitOrder(body: SubmitBody, deps: SubmitDeps): Promise<SubmitResult> {
  const { db, catalog, settings } = deps;
  const now = deps.now ?? new Date();
  if (settings.production.paused) return fail(503, settings.production.pause_message || 'We’re not taking new orders right now.');
  if (!body || typeof body !== 'object' || !body.design || typeof body.design !== 'object' || !body.contact || typeof body.contact !== 'object')
    return fail(400, 'Expected { design, contact, proofApproved }');

  // spam protection: honeypot, Turnstile, then the hourly limit per device
  if (!deps.skipSpamChecks) {
    if (settings.spam.honeypot && typeof body.website === 'string' && body.website.trim()) return fail(400, 'Your order could not be sent.');
    if (settings.spam.turnstile) {
      const v = await deps.verifyTurnstile(body.turnstileToken, deps.ip);
      if (!v.ok) return fail(403, 'The spam check failed. Reload the page and try again.');
    }
    const key = createHash('sha256').update(`${deps.ip ?? ''}|${deps.deviceId ?? ''}`).digest('hex');
    const recent = await recordSubmission(db, key, now);
    if (recent > settings.spam.max_submissions_per_hour) return fail(429, 'Too many orders from this device in the last hour. Please try again later, or message us.');
  }

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
  const contactErrors = checkContact(contact, { needsAddress: !!delivery?.values.needs_address, earliest: deps.skipLeadTime ? '0000-00-00' : earliest, rush: rushAddon });
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
  const lastName = lastNameOf(contact.name);
  const sizeIn = ed.layout === 'vertical' ? ed.heightIn ?? 0 : ed.widthIn ?? 0;
  const files = buildOrderFiles(result, { number: saved.number, lastName, sizeIn, design, material: ctx.material }, catalog, settings);
  await storeOrderFiles(db, deps.upload, saved.id, saved.number, 1, files);

  // emails: the alert to you always tries; customer emails wait for your own sending domain
  const vars = orderEmailVars({ number: saved.number, contact, labels, quote: q, settings, catalog, earliest, siteUrl: deps.siteUrl, orderId: saved.id, sizeIn, vertical: ed.layout === 'vertical', delivery });
  const png = files.find((f) => f.kind === 'png')!;
  const svg = files.find((f) => f.kind === 'svg')!;
  const preview: Attachment = { filename: png.name, content: png.body, contentType: png.type, contentId: 'sign-preview' };
  const ownerTo = deps.notifyEmail || settings.emails.notify_email;
  await sendOrderEmail(deps, saved.id, 'new_order_alert', ownerTo, vars, { quote: q, attachments: [preview, { filename: svg.name, content: svg.body, contentType: svg.type }], toCustomer: false });
  if (deps.sendCustomerEmail !== false) await sendOrderEmail(deps, saved.id, 'order_received', contact.email, vars, { quote: q, attachments: [preview], toCustomer: true });

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
