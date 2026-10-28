import { withUser } from '@/lib/auth/session';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getOwnerOrder, getProductionOrder, orderFiles } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { cutFileGate } from '@/lib/order/payments';
import { orderFilesFor } from '@/lib/server/admin-orders';
import { FILE_TYPES, type FileKind } from '@/lib/server/order-files';
import { downloadFile } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** An order's latest SVG, PNG or DXF. Cut files (SVG, DXF) go through the cut-file gate. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  return withUser('download_files', async (user) => {
    const { id, kind } = await params;
    if (!(kind in FILE_TYPES)) return Response.json({ error: 'Unknown file kind' }, { status: 404 });
    const db = getDb();
    if (!db) return Response.json({ error: 'No database' }, { status: 503 });
    const [settings, catalog] = await Promise.all([loadSettings(), loadCatalog()]);
    // production gets the order without prices or contact details; the gate still needs to know if it's paid
    const owner = user.perms.view_payments ? await getOwnerOrder(db, id) : null;
    const prod = owner ? null : await getProductionOrder(db, id);
    const o = owner ?? prod;
    if (!o) return Response.json({ error: 'Order not found' }, { status: 404 });
    if (kind !== 'png') {
      const gate = cutFileGate(
        { status: o.status, total: owner ? owner.total : 1, paid: owner ? owner.paid : prod!.paid_up ? 1 : 0, cut_override_reason: o.cut_override_reason },
        settings,
      );
      if (!gate.allowed) return Response.json({ error: `${gate.warning} ${user.perms.override_cut_gate ? 'Use the override on the order page.' : 'Ask the owner.'}` }, { status: 403 });
    }
    const stored = (await orderFiles(db, id)).find((f) => f.kind === kind);
    let body: Buffer | string | null = stored ? await downloadFile(stored.storage_path) : null;
    let name = stored?.storage_path.split('/').at(-1);
    if (!body) {
      const built = owner ? await orderFilesFor(owner, catalog, settings, [kind as FileKind]) : await orderFilesFor({ number: prod!.number, design: prod!.design, first_name: prod!.first_name }, catalog, settings, [kind as FileKind]);
      if (!built[0]) return Response.json({ error: 'That file is switched off in Settings → Export.' }, { status: 404 });
      body = built[0].body;
      name = built[0].name;
    }
    return new Response(typeof body === 'string' ? body : new Uint8Array(body), {
      headers: { 'Content-Type': FILE_TYPES[kind as FileKind], 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' },
    });
  });
}
