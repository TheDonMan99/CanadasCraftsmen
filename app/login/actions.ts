'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_COOKIE, devLoginAllowed, lookupUser, signDev, supabaseAuthConfigured, supabaseServer } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { env } from '@/lib/server/env';

const safeNext = (next: string) => (next.startsWith('/admin') ? next : '/admin');

/** Emails a sign-in link to invited users. Says the same thing either way, so nobody can test which emails are invited. */
export async function sendLink(_: unknown, form: FormData): Promise<{ message: string; error?: boolean }> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const next = safeNext(String(form.get('next') ?? '/admin'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: 'Type your email address.', error: true };
  if (!supabaseAuthConfigured()) return { message: 'Sign-in by email needs SUPABASE_URL and SUPABASE_ANON_KEY.', error: true };
  const user = await lookupUser(getDb(), email);
  if (user) {
    const { error } = await (await supabaseServer()).auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${env.siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      console.warn(`[login] ${email}: ${error.message}`);
      return { message: `The sign-in email couldn’t be sent: ${error.message}`, error: true };
    }
  }
  return { message: `If ${email} is invited, a sign-in link is on its way. Open it on this device.` };
}

/** One-click sign-in on your own computer only. */
export async function devLogin(form: FormData) {
  if (!devLoginAllowed()) throw new Error('Dev sign-in is off.');
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!(await lookupUser(getDb(), email))) redirect('/login?error=not-invited');
  (await cookies()).set(DEV_COOKIE, signDev(email), { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect(safeNext(String(form.get('next') ?? '/admin')));
}
