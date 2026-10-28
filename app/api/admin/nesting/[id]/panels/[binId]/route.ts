import { withUser } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { getJob } from '@/lib/db/nesting';
import { loadFontFile } from '@/lib/server/fonts';
import { panelFile } from '@/lib/server/nesting';
import { downloadFile } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** One panel's LightBurn SVG: the stored file when there is one, otherwise rebuilt from the saved layout. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; binId: string }> }) {
  return withUser('manage_nesting', async () => {
    const { id, binId } = await params;
    const db = getDb();
    const job = db ? await getJob(db, id) : null;
    if (!db || !job) return Response.json({ error: 'Not found' }, { status: 404 });
    const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
    const stored = job.summary.files?.[binId];
    const bytes = stored ? await downloadFile(stored) : null;
    let name = stored?.split('/').at(-1);
    let body: string | null = bytes ? bytes.toString('utf8') : null;
    if (!body) {
      const f = await panelFile({ db, catalog, settings, loadFont: loadFontFile }, job, decodeURIComponent(binId));
      if (!f) return Response.json({ error: 'Not found' }, { status: 404 });
      body = f.svg;
      name = f.name;
    }
    return new Response(body, { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' } });
  });
}
