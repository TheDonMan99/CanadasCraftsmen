// Private file storage in Supabase Storage, over its HTTP API with the service key.
import 'server-only';
import { env } from './env';

export const ORDER_BUCKET = 'order-files';

export type Upload = (path: string, body: Buffer | string, contentType: string) => Promise<{ ok: true } | { ok: false; error: string }>;

const headers = () => ({ Authorization: `Bearer ${env.serviceKey()}`, apikey: env.serviceKey()! });

export const uploadFile: Upload = async (path, body, contentType) => {
  const base = env.supabaseUrl();
  if (!base || !env.serviceKey()) return { ok: false, error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set' };
  try {
    const res = await fetch(`${base}/storage/v1/object/${ORDER_BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': contentType, 'x-upsert': 'true' },
      body: typeof body === 'string' ? body : new Uint8Array(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `Storage ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** A link to a private file that stops working after expiresIn seconds. */
export async function signedUrl(path: string, expiresIn = 600): Promise<string | null> {
  const base = env.supabaseUrl();
  if (!base || !env.serviceKey()) return null;
  const res = await fetch(`${base}/storage/v1/object/sign/${ORDER_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return signedURL ? `${base}/storage/v1${signedURL}` : null;
}
