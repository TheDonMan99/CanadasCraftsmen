import { timingSafeEqual } from 'node:crypto';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { sendEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';
import { runScheduled } from '@/lib/server/scheduled';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called by Vercel Cron (vercel.json) at 13:00 and 14:00 UTC. Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'Set CRON_SECRET to turn on scheduled emails.' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  if (!db) return Response.json({ error: 'No database' }, { status: 503 });
  const [settings, catalog] = await Promise.all([loadSettings(), loadCatalog()]);
  const ran = await runScheduled({ db, settings, catalog, sendEmail, siteUrl: env.siteUrl(), notifyEmail: env.notifyEmail() });
  return Response.json({ ran });
}
