// Environment settings for outside services, read in one place.
import 'server-only';

/** The project's base address, whether or not SUPABASE_URL was pasted with /rest/v1/ on the end. */
export function supabaseBase(url = process.env.SUPABASE_URL): string | null {
  if (!url) return null;
  return url.trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage)\/v1$/, '');
}

export const env = {
  supabaseUrl: () => supabaseBase(),
  serviceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  resendKey: () => process.env.RESEND_API_KEY || null,
  turnstileSiteKey: () => process.env.TURNSTILE_SITE_KEY || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
  turnstileSecret: () => process.env.TURNSTILE_SECRET_KEY || null,
  /** The public address of the site, for links in emails. */
  siteUrl: () => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/+$/, ''),
  notifyEmail: () => process.env.NOTIFY_EMAIL || null,
};
