import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEV_COOKIE, supabaseAuthConfigured, supabaseServer } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  (await cookies()).delete(DEV_COOKIE);
  if (supabaseAuthConfigured()) await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}
