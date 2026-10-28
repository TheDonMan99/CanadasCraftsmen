// Sends email through Resend's HTTP API. Without RESEND_API_KEY nothing is sent
// and the send is logged as skipped.
import 'server-only';
import { env } from './env';

export interface Attachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  /** Set to show the attachment inside the email body as <img src="cid:..."> */
  contentId?: string;
}

export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
}

export type SendResult = { status: 'sent'; id: string } | { status: 'failed'; error: string } | { status: 'skipped'; error: string };
export type SendEmail = (e: OutgoingEmail) => Promise<SendResult>;

export const sendEmail: SendEmail = async (e) => {
  const key = env.resendKey();
  if (!key) return { status: 'skipped', error: 'RESEND_API_KEY is not set' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: e.from,
        to: [e.to],
        reply_to: e.replyTo,
        subject: e.subject,
        html: e.html,
        text: e.text,
        attachments: e.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString('base64'),
          ...(a.contentType && { content_type: a.contentType }),
          ...(a.contentId && { content_id: a.contentId }),
        })),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { status: 'failed', error: `Resend ${res.status}: ${body?.message ?? res.statusText}` };
    return { status: 'sent', id: body.id };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
};
