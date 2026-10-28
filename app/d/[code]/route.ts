import { NextResponse } from 'next/server';
import { resolveShortLink } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** Short Messenger-friendly links: /d/7KQ2 opens the saved design. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getDb();
  const link = db && /^[A-Za-z0-9]{3,10}$/.test(code) ? await resolveShortLink(db, code) : null;
  if (!link) return NextResponse.redirect(new URL('/design', req.url));
  return NextResponse.redirect(new URL(`/design/${encodeURIComponent(link.target_id)}`, req.url));
}
