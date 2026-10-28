'use server';

// Server actions behind the order pages, the board and the payment panel. Each
// checks the signed-in user's permission, writes through lib/db/admin (append-only
// payments and history, audit log), and sends the matching customer email.

import { revalidatePath } from 'next/cache';
import type { Perm } from '@/lib/auth/permissions';
import { AuthError, requireUser, type AdminUser } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import {
  AdminError,
  cancelOrder,
  createShortLink,
  deleteReplyTemplate,
  getOwnerOrder,
  inviteUser,
  markReviewed,
  overrideCutGate,
  recordPayment,
  removeUser,
  saveReplyTemplate,
  saveRole,
  setInternalNotes,
  setStatus,
} from '@/lib/db/admin';
import { getDb, type Db } from '@/lib/db/client';
import { localToday } from '@/lib/order/rules';
import { PRODUCTION_STATUSES, STATUSES, type Status } from '@/lib/order/payments';
import { emailOrder, regenerateFiles } from '@/lib/server/admin-orders';

export type Result<T = null> = { ok: true; data: T; message?: string } | { ok: false; error: string };

async function run<T>(perm: Perm, fn: (db: Db, user: AdminUser) => Promise<T | { data: T; message: string }>): Promise<Result<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'The database isn’t connected.' };
  try {
    const user = await requireUser(perm);
    const out = await fn(db, user);
    revalidatePath('/admin', 'layout');
    if (out && typeof out === 'object' && 'message' in (out as any) && 'data' in (out as any)) return { ok: true, ...(out as { data: T; message: string }) };
    return { ok: true, data: out as T };
  } catch (e) {
    if (e instanceof AuthError || e instanceof AdminError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const context = async () => {
  const [settings, catalog] = await Promise.all([loadSettings(), loadCatalog()]);
  return { settings, catalog };
};

const emailNote = (outcome: string, what: string) =>
  outcome === 'sent' ? `${what} emailed.` : outcome === 'held' ? `${what} email held until your sending domain is set up.` : outcome === 'off' ? '' : `${what} email ${outcome}.`;

export async function reviewOrder(id: string) {
  return run('view_orders', async (db, u) => markReviewed(db, id, u.email));
}

export async function addPayment(id: string, p: { amount: string; kind: 'payment' | 'refund'; method: string; receivedAt: string; reference?: string; note?: string }) {
  return run('record_payments', async (db, u) => {
    const { settings, catalog } = await context();
    const amountCents = Math.round(Number(p.amount.replace(/[$,\s]/g, '')) * 100);
    const r = await recordPayment(db, id, { amountCents, kind: p.kind === 'refund' ? 'refund' : 'payment', method: p.method, receivedAt: p.receivedAt, reference: p.reference, note: p.note }, u.email, settings);
    let message = p.kind === 'refund' ? 'Refund recorded.' : 'Payment recorded.';
    if (p.kind !== 'refund') {
      message += ' ' + emailNote(await emailOrder(db, settings, catalog, id, 'payment_received'), 'Receipt');
      await emailOrder(db, settings, catalog, id, 'payment_logged');
    }
    return { data: r, message: message.trim() };
  });
}

/** One tap: records the full balance as paid by the default method, today. */
export async function markPaid(id: string) {
  return run('record_payments', async (db, u) => {
    const { settings, catalog } = await context();
    const o = await getOwnerOrder(db, id);
    if (!o) throw new AdminError('Order not found.');
    const balance = o.total - o.paid;
    if (balance <= 0) throw new AdminError('Nothing is owing.');
    const method = catalog.find((m) => m.id === settings.payments.default_method)?.label ?? 'Interac e-Transfer';
    const r = await recordPayment(db, id, { amountCents: balance, kind: 'payment', method, receivedAt: localToday(settings), note: 'Marked as paid' }, u.email, settings);
    const sent = await emailOrder(db, settings, catalog, id, 'payment_received');
    await emailOrder(db, settings, catalog, id, 'payment_logged');
    return { data: r, message: `Marked as paid. ${emailNote(sent, 'Receipt')}`.trim() };
  });
}

export async function sendReminder(id: string) {
  return run('record_payments', async (db) => {
    const { settings, catalog } = await context();
    const out = await emailOrder(db, settings, catalog, id, 'payment_reminder');
    if (out === 'off') throw new AdminError('The payment reminder email is switched off in Settings → Emails.');
    return { data: null, message: emailNote(out, 'Reminder') };
  });
}

export async function changeStatus(id: string, to: string, note?: string) {
  if (!STATUSES.includes(to as Status)) return { ok: false as const, error: 'Unknown status.' };
  const status = to as Status;
  // production can move orders along the board; anything else needs edit rights
  const perm: Perm = PRODUCTION_STATUSES.includes(status) ? 'view_board' : 'edit_orders';
  return run(perm, async (db, u) => {
    await setStatus(db, id, status, note?.trim() || null, u.email, { productionOnly: !u.perms.edit_orders });
    const { settings, catalog } = await context();
    let message = '';
    if (status === 'in_production' || status === 'ready') message = emailNote(await emailOrder(db, settings, catalog, id, status), 'Customer');
    return { data: null, message };
  });
}

export async function cancel(id: string, by: 'customer' | 'owner', reason: string) {
  return run('edit_orders', async (db, u) => {
    const { settings } = await context();
    const r = await cancelOrder(db, id, { by: by === 'customer' ? 'customer' : 'owner', reason }, u.email, settings);
    return { data: r, message: r.refundCents ? `Cancelled. Refund owed: $${(r.refundCents / 100).toFixed(2)}, recorded as a refund entry.` : 'Cancelled. No refund owed.' };
  });
}

export async function overrideCut(id: string, reason: string) {
  return run('override_cut_gate', async (db, u) => overrideCutGate(db, id, reason, u.email));
}

export async function saveNotes(id: string, notes: string) {
  return run('edit_orders', async (db, u) => setInternalNotes(db, id, notes.slice(0, 5000), u.email));
}

export async function regenerate(id: string) {
  return run('download_files', async (db) => {
    const { settings, catalog } = await context();
    const r = await regenerateFiles(db, settings, catalog, id);
    return { data: r, message: r.failed.length ? `Version ${r.version} made, but not stored: ${r.failed.join('; ')}` : `Files regenerated (version ${r.version}).` };
  });
}

export async function bulkStatus(ids: string[], to: string) {
  const results = await Promise.all(ids.slice(0, 100).map((id) => changeStatus(id, to)));
  const failed = results.filter((r) => !r.ok).length;
  return failed ? { ok: false as const, error: `${ids.length - failed} changed, ${failed} couldn’t be: ${(results.find((r) => !r.ok) as any).error}` } : { ok: true as const, data: null, message: `${ids.length} orders changed.` };
}

export async function bulkRegenerate(ids: string[]) {
  const results = [];
  for (const id of ids.slice(0, 50)) results.push(await regenerate(id));
  const failed = results.filter((r) => !r.ok).length;
  return failed ? { ok: false as const, error: `${failed} of ${ids.length} couldn’t be regenerated.` } : { ok: true as const, data: null, message: `Files regenerated for ${ids.length} orders.` };
}

// ---------- users, roles, replies, short links ----------

export async function invite(email: string, role: string) {
  return run('manage_users', async (db, u) => inviteUser(db, email, role, u.email));
}
export async function uninvite(email: string) {
  return run('manage_users', async (db, u) => removeUser(db, email, u.email));
}
export async function updateRole(name: string, permissions: Record<string, boolean>) {
  return run('manage_users', async (db, u) => saveRole(db, name, permissions, u.email));
}
export async function saveTemplate(t: { id?: string; title: string; body: string }) {
  return run('edit_settings', async (db, u) => saveReplyTemplate(db, t, u.email));
}
export async function removeTemplate(id: string) {
  return run('edit_settings', async (db, u) => deleteReplyTemplate(db, id, u.email));
}
export async function shortLinkFor(shareId: string) {
  return run('edit_orders', async (db) => createShortLink(db, 'design', shareId));
}
