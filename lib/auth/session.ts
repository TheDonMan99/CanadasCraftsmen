// Who is signed in. Sign-in is by emailed link through Supabase Auth, for invited
// users only (the users table, plus ADMIN_EMAIL as the owner). On your own computer
// there's also a one-click dev sign-in, which is never available on Vercel.

import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb, type Db } from '@/lib/db/client';
import { env } from '@/lib/server/env';
import { OWNER_ROLE, permsFor, type Perm, type Perms } from './permissions';

export interface AdminUser {
  email: string;
  role: string;
  perms: Perms;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export const DEV_COOKIE = 'dev_login';

/** Dev sign-in: only off Vercel, and in production builds only when ALLOW_DEV_LOGIN=1 (for the browser tests). */
export function devLoginAllowed(): boolean {
  if (process.env.VERCEL) return false;
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_LOGIN === '1';
}

const devSecret = () => process.env.DEV_LOGIN_SECRET || `dev:${process.env.DATABASE_URL ?? ''}`;
export const signDev = (email: string) => `${email}|${createHmac('sha256', devSecret()).update(email).digest('hex')}`;
function verifyDev(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf('|');
  if (i < 0) return null;
  const email = value.slice(0, i);
  const want = Buffer.from(signDev(email));
  const got = Buffer.from(value);
  return want.length === got.length && timingSafeEqual(want, got) ? email : null;
}

export const supabaseAuthConfigured = () => !!(env.supabaseUrl() && process.env.SUPABASE_ANON_KEY);

/** A Supabase client that keeps the session in this request's cookies. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl()!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // called from a server component, where cookies are read-only; the session refreshes on the next action
        }
      },
    },
  });
}

/** The invited user with this email, or the owner from ADMIN_EMAIL; null if not invited. */
export async function lookupUser(db: Db | null, email: string): Promise<AdminUser | null> {
  const e = email.trim().toLowerCase();
  const admin = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!db) return admin === e || devLoginAllowed() ? { email: e, role: OWNER_ROLE, perms: permsFor(OWNER_ROLE, null) } : null;
  const [row] = await db.query<{ role: string; permissions: any }>(
    'select u.role, r.permissions from users u join roles r on r.name = u.role where lower(u.email) = $1',
    [e],
  );
  if (row) return { email: e, role: row.role, perms: permsFor(row.role, typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions) };
  if (admin && admin === e) {
    await db.query("insert into users (email, role) values ($1, 'owner') on conflict (email) do nothing", [e]);
    return { email: e, role: OWNER_ROLE, perms: permsFor(OWNER_ROLE, null) };
  }
  return null;
}

async function sessionEmail(): Promise<string | null> {
  if (devLoginAllowed()) {
    const dev = verifyDev((await cookies()).get(DEV_COOKIE)?.value);
    if (dev) return dev;
  }
  if (!supabaseAuthConfigured()) return null;
  try {
    const { data } = await (await supabaseServer()).auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<AdminUser | null> {
  const email = await sessionEmail();
  return email ? lookupUser(getDb(), email) : null;
}

/** For pages: the signed-in user with this permission, or off to sign-in. */
export async function requirePage(perm?: Perm, next = '/admin'): Promise<AdminUser> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (perm && !user.perms[perm]) redirect('/admin?denied=1');
  return user;
}

/** For server actions and API routes: throws AuthError when not allowed. */
export async function requireUser(perm?: Perm): Promise<AdminUser> {
  const user = await currentUser();
  if (!user) throw new AuthError(401, 'Please sign in again.');
  if (perm && !user.perms[perm]) throw new AuthError(403, 'Your role isn’t allowed to do that.');
  return user;
}

/** Runs an API handler for a signed-in user with the permission, answering 401/403 otherwise. */
export async function withUser(perm: Perm | undefined, fn: (user: AdminUser) => Promise<Response>): Promise<Response> {
  try {
    return await fn(await requireUser(perm));
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
