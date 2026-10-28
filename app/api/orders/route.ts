import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { sendEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';
import { loadFontFile } from '@/lib/server/fonts';
import { clientIp, deviceId } from '@/lib/server/request';
import { uploadFile } from '@/lib/server/storage';
import { submitOrder, type SubmitBody } from '@/lib/server/submit-order';
import { verifyTurnstile } from '@/lib/server/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Validates the design, recalculates the price, runs the engine, saves the order and its files, and sends both emails. */
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return Response.json({ error: 'Orders can’t be saved: the database isn’t connected.' }, { status: 503 });
  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const device = deviceId(req);
  const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
  const res = await submitOrder(body, {
    db,
    catalog,
    settings,
    loadFont: loadFontFile,
    sendEmail,
    upload: uploadFile,
    verifyTurnstile,
    siteUrl: env.siteUrl(),
    notifyEmail: env.notifyEmail(),
    ip: clientIp(req),
    deviceId: device.id,
  });
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (device.setCookie) headers['Set-Cookie'] = device.setCookie;
  return Response.json(res.body, { status: res.status, headers });
}
