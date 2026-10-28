'use server';

import { AuthError, requireUser } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { sendEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';
import { runScheduled } from '@/lib/server/scheduled';

/** Sends a scheduled email now, to try it out. */
export async function sendNow(job: 'daily_digest' | 'weekly_summary' | 'nightly_backup') {
  const db = getDb();
  if (!db) return { ok: false as const, error: 'No database' };
  try {
    await requireUser('view_reports');
    const [settings, catalog] = await Promise.all([loadSettings(), loadCatalog()]);
    const s = job === 'nightly_backup' ? { ...settings, emails: { ...settings.emails, nightly_backup: true } } : settings;
    const [r] = await runScheduled({ db, settings: s, catalog, sendEmail, siteUrl: env.siteUrl(), notifyEmail: env.notifyEmail() }, { force: [job] });
    return { ok: true as const, message: r ? `${job.replace(/_/g, ' ')}: ${r.outcome}` : 'Nothing to send.' };
  } catch (e) {
    return { ok: false as const, error: e instanceof AuthError ? e.message : String(e) };
  }
}
