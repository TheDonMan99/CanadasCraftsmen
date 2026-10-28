// Cloudflare Turnstile: checks the token the widget gave the browser.
import 'server-only';
import { env } from './env';

export type VerifyTurnstile = (token: string | undefined, ip: string | null) => Promise<{ ok: boolean; error?: string }>;

export const verifyTurnstile: VerifyTurnstile = async (token, ip) => {
  const secret = env.turnstileSecret();
  if (!secret) return { ok: true, error: 'TURNSTILE_SECRET_KEY is not set; check skipped' };
  if (!token) return { ok: false, error: 'missing token' };
  try {
    const form = new URLSearchParams({ secret, response: token, ...(ip && { remoteip: ip }) });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
    const body = await res.json();
    return body.success ? { ok: true } : { ok: false, error: (body['error-codes'] ?? []).join(', ') || 'rejected' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
