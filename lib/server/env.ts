// Environment settings for outside services, read in one place.
import 'server-only';

/** The project's base address, whether or not SUPABASE_URL was pasted with /rest/v1/ on the end. */
export function supabaseBase(url = process.env.SUPABASE_URL): string | null {
  if (!url) return null;
  return url.trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1$/, '');
}

/** A key as pasted into Vercel, without stray spaces, line breaks or quote marks around it. */
export const cleanKey = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, '').trim() || null;

export const env = {
  supabaseUrl: () => supabaseBase(),
  serviceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  resendKey: () => cleanKey(process.env.RESEND_API_KEY),
  turnstileSiteKey: () => cleanKey(process.env.TURNSTILE_SITE_KEY) ?? cleanKey(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  turnstileSecret: () => cleanKey(process.env.TURNSTILE_SECRET_KEY),
  /** The public address of the site, for links in emails. */
  siteUrl: () => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/+$/, ''),
  notifyEmail: () => process.env.NOTIFY_EMAIL || null,
};
