import { approveProof } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The customer approves an edited proof. The token works once. */
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  if (!db || !/^[A-Za-z0-9]{16,40}$/.test(token)) return Response.json({ error: 'Not found' }, { status: 404 });
  const number = await approveProof(db, token);
  return number ? Response.json({ ok: true, number }) : Response.json({ error: 'This link has been used or has expired.' }, { status: 404 });
}
