// Who sent a request: the client's IP (as Vercel reports it) and a device id cookie.
import 'server-only';
import { randomId } from '@/lib/db/orders';

export const DEVICE_COOKIE = 'sd';

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

/** The device id from its cookie, or a new one (with the Set-Cookie header to store it). */
export function deviceId(req: Request): { id: string; setCookie?: string } {
  const m = req.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([A-Za-z0-9]{8,40})`));
  if (m) return { id: m[1] };
  const id = randomId(20);
  return { id, setCookie: `${DEVICE_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` };
}
