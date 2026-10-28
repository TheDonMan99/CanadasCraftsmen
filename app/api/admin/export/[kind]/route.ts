import { withUser } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { localToday } from '@/lib/order/rules';
import { exportCsv } from '@/lib/server/exports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** CSV export of orders or payments since a date (all time by default). */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  return withUser('view_reports', async () => {
    const { kind } = await params;
    const db = getDb();
    if (!db) return Response.json({ error: 'No database' }, { status: 503 });
    const since = new URL(req.url).searchParams.get('since') ?? '1970-01-01';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return Response.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 });
    const [settings, catalog] = await Promise.all([loadSettings(), loadCatalog()]);
    const csv = await exportCsv(kind, db, settings, catalog, since);
    if (csv === null) return Response.json({ error: 'Unknown export' }, { status: 404 });
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-${localToday(settings)}.csv"`, 'Cache-Control': 'private, no-store' },
    });
  });
}
