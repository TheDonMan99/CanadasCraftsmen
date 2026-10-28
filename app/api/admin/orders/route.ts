import { withUser } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { sendEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';
import { loadFontFile } from '@/lib/server/fonts';
import { uploadFile } from '@/lib/server/storage';
import { submitOrder, type SubmitBody } from '@/lib/server/submit-order';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Orders you enter yourself: same checks and price, no spam checks, marked with a source. */
export async function POST(req: Request) {
  return withUser('edit_orders', async (user) => {
    const db = getDb();
    if (!db) return Response.json({ error: 'No database' }, { status: 503 });
    const body = (await req.json().catch(() => null)) as (SubmitBody & { source?: string; sendCustomerEmail?: boolean }) | null;
    if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
    const res = await submitOrder(body, {
      db,
      catalog,
      settings: { ...settings, production: { ...settings.production, paused: false } },
      loadFont: loadFontFile,
      sendEmail,
      upload: uploadFile,
      verifyTurnstile: async () => ({ ok: true }),
      siteUrl: env.siteUrl(),
      notifyEmail: env.notifyEmail(),
      ip: null,
      deviceId: null,
      source: String(body.source || 'Facebook Marketplace').slice(0, 40),
      createdBy: user.email,
      skipSpamChecks: true,
      skipLeadTime: true,
      sendCustomerEmail: body.sendCustomerEmail !== false,
    });
    if (res.status !== 201) return Response.json(res.body, { status: res.status });
    const [o] = await db.query<{ id: string }>('select id from orders where number = $1', [res.body.number]);
    return Response.json({ number: res.body.number, url: `/admin/orders/${o.id}` }, { status: 201 });
  });
}
