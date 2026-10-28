import { loadCatalog } from '@/lib/data';
import { publicCatalog } from '@/lib/server/public-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enabled options only, for the designer. */
export async function GET() {
  return Response.json({ options: publicCatalog(await loadCatalog({ enabledOnly: true })) }, { headers: { 'Cache-Control': 'no-store' } });
}
