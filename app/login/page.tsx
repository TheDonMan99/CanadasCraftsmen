import type { Metadata } from 'next';
import { devLoginAllowed } from '@/lib/auth/session';
import { devLogin } from './actions';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const q = await searchParams;
  const next = q.next?.startsWith('/admin') ? q.next : '/admin';
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-stone-600">For invited users only. We’ll email you a link.</p>
      {q.error === 'link' && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">That sign-in link didn’t work or has expired. Ask for a new one.</p>}
      {q.error === 'not-invited' && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">That email isn’t invited.</p>}
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
      {devLoginAllowed() && (
        <form action={devLogin} className="mt-10 rounded-lg border border-dashed border-stone-300 p-3">
          <p className="text-xs text-stone-500">On this computer only: sign in without an email.</p>
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" placeholder="invited email" className="input mt-2" aria-label="Dev sign-in email" />
          <button className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 text-sm">Dev sign-in</button>
        </form>
      )}
    </main>
  );
}
