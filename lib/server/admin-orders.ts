// Dashboard operations that reach outside the database: status and payment
// emails, regenerating an order's files, and building files for download.

import 'server-only';
import type { CatalogOption, Settings } from '@/lib/config/catalog';
import { buildContext } from '@/lib/config/context';
import { getOwnerOrder, orderFiles, type OwnerOrder } from '@/lib/db/admin';
import type { Db } from '@/lib/db/client';
import type { TemplateKey } from '@/lib/email/templates';
import { runEngine, type Design } from '@/lib/engine';
import type { OrderDesign } from '@/lib/order/design';
import { sendEmail } from './email';
import { env } from './env';
import { loadFontFile } from './fonts';
import { buildOrderFiles, lastNameOf, storeOrderFiles, type FileKind, type OrderFile } from './order-files';
import { sendOrderEmail, storedOrderVars, type EmailOutcome } from './order-emails';
import { uploadFile } from './storage';

const CUSTOMER_TEMPLATES: TemplateKey[] = ['order_received', 'payment_reminder', 'payment_received', 'edited_proof', 'in_production', 'ready', 'review_request'];

/** Sends one of an order's emails; customer emails go to the customer, the rest to you. */
export async function emailOrder(db: Db, settings: Settings, catalog: CatalogOption[], orderId: string, key: TemplateKey, opts: { proofLink?: string } = {}): Promise<EmailOutcome> {
  const o = await getOwnerOrder(db, orderId);
  if (!o) return 'off';
  const toCustomer = CUSTOMER_TEMPLATES.includes(key);
  const to = toCustomer ? o.customer_email : env.notifyEmail() || settings.emails.notify_email;
  const vars = storedOrderVars(o, catalog, settings, env.siteUrl(), opts.proofLink);
  // the edited proof shows the new design; other status emails are text only
  let attachments;
  if (key === 'edited_proof') {
    const png = (await orderFilesFor(o, catalog, settings, ['png']))[0];
    if (png) attachments = [{ filename: png.name, content: png.body, contentType: png.type, contentId: 'sign-preview' }];
  }
  return sendOrderEmail({ db, settings, sendEmail }, orderId, key, to, vars, { toCustomer, attachments });
}

/** Builds an order's files from its saved design, with today's material settings (kerf and so on). */
export async function orderFilesFor(o: Pick<OwnerOrder, 'number' | 'design' | 'customer_name'> | { number: string; design: any; first_name: string }, catalog: CatalogOption[], settings: Settings, kinds: FileKind[]): Promise<OrderFile[]> {
  const design = o.design as OrderDesign & { engine: Design };
  const ctx = buildContext(catalog, settings, loadFontFile, design.materialId);
  const result = runEngine(design.engine, ctx);
  const sizeIn = design.engine.layout === 'vertical' ? design.engine.heightIn ?? 0 : design.engine.widthIn ?? 0;
  const name = 'customer_name' in o ? o.customer_name : o.first_name;
  return buildOrderFiles(result, { number: o.number, lastName: lastNameOf(name), sizeIn, design, material: ctx.material }, catalog, settings, kinds);
}

/** Makes a fresh version of every file and stores it. */
export async function regenerateFiles(db: Db, settings: Settings, catalog: CatalogOption[], orderId: string): Promise<{ version: number; failed: string[] }> {
  const o = await getOwnerOrder(db, orderId);
  if (!o) throw new Error('Order not found.');
  const files = await orderFilesFor(o, catalog, settings, ['svg', 'png', 'dxf']);
  const version = Math.max(0, ...(await orderFiles(db, orderId)).map((f) => f.version)) + 1;
  const failed = await storeOrderFiles(db, uploadFile, orderId, o.number, version, files);
  return { version, failed };
}
