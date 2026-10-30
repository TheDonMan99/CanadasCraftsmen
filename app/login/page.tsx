import type { Metadata } from 'next';
import { devLoginAllowed } from '@/lib/auth/session';
import { devLogin } from './actions';
import SiteFooter from '@/app/components/SiteFooter';
import SiteHeader from '@/app/components/SiteHeader';
import { AlertIcon } from '@/app/components/icons';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const q = await searchParams;
  const next = q.next?.startsWith('/admin') ? q.next : '/admin';
  return (
    <>
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-md px-4 py-16 md:py-24">
        <h1 className="cc-display-l">Sign in</h1>
        <p className="cc-body mt-4 text-kerf">For invited people only. We’ll email you a link.</p>
        {q.error === 'link' && <Problem>That sign-in link didn’t work or has expired. Ask for a new one below.</Problem>}
        {q.error === 'not-invited' && <Problem>That email isn’t invited. Ask the owner to invite you in Settings → Users and roles.</Problem>}
        <div className="mt-8">
          <LoginForm next={next} />
        </div>
        {devLoginAllowed() && (
          <form action={devLogin} className="mt-12 rounded-sm border border-dashed border-line-strong p-4">
            <p className="cc-small text-kerf">On this computer only: sign in without an email.</p>
            <input type="hidden" name="next" value={next} />
            <input name="email" type="email" placeholder="invited email" className="cc-field__input mt-3" aria-label="Dev sign-in email" />
            <button className="cc-btn cc-btn--secondary mt-3 w-full">Dev sign-in</button>
          </form>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="cc-field__error mt-4" role="alert">
      <AlertIcon />
      <span>{children}</span>
    </p>
  );
}
