import { NextResponse } from 'next/server';
import { lookupUser, supabaseServer } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** Where the emailed sign-in link lands: swaps the code for a session, then opens the dashboard. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get('next')?.startsWith('/admin') ? url.searchParams.get('next')! : '/admin';
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?error=link', url.origin));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email;
  const db = getDb();
  if (error || !email || !(await lookupUser(db, email))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/login?error=link', url.origin));
  }
  await db?.query('update users set last_sign_in_at = now() where lower(email) = $1', [email.toLowerCase()]);
  return NextResponse.redirect(new URL(next, url.origin));
}
