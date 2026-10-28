import { loadCatalog, loadSettings } from '@/lib/data';
import { quote, type QuoteInput } from '@/lib/pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recalculate the price of a design from the live catalog. Any price sent in is ignored. */
export async function POST(req: Request) {
  let body: { input?: QuoteInput };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const input = body?.input;
  if (!input || typeof input !== 'object' || typeof input.productId !== 'string') return Response.json({ error: 'Expected { input }' }, { status: 400 });
  const [catalog, settings] = await Promise.all([loadCatalog(), loadSettings()]);
  return Response.json(quote(input, catalog, settings), { headers: { 'Cache-Control': 'no-store' } });
}
