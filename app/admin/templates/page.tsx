import { requirePage } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import { listReplyTemplates } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { fillReply, replyVars } from '@/lib/order/replies';
import { env } from '@/lib/server/env';
import Replies from './Replies';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await requirePage('edit_orders', '/admin/templates');
  const db = getDb();
  if (!db) return <main className="mx-auto max-w-4xl px-4 py-6 text-stone-600">Reply templates need the database.</main>;
  const [templates, catalog, settings] = await Promise.all([listReplyTemplates(db), loadCatalog({ enabledOnly: true }), loadSettings()]);
  const vars = replyVars(catalog, settings, env.siteUrl());
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Messenger replies</h1>
      <p className="mt-1 text-sm text-stone-600">
        Tap Copy and paste into Messenger. {'{price_list}'}, {'{design_link}'}, {'{payment_email}'} and {'{pickup_note}'} fill in from your catalog and settings.
      </p>
      <Replies templates={templates.map((t) => ({ ...t, filled: fillReply(t.body, vars) }))} canEdit={user.perms.edit_settings} />
    </main>
  );
}
