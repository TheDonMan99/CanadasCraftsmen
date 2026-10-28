import { requirePage } from '@/lib/auth/session';
import { loadSettings } from '@/lib/data';
import { boardOrders } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import { specLine } from '../ui';
import Board from './Board';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  await requirePage('view_board', '/admin/board');
  const db = getDb();
  if (!db) return <main className="mx-auto max-w-7xl px-4 py-6 text-stone-600">The board needs the database.</main>;
  const settings = await loadSettings();
  // production view only: specs and first names, never prices or contact details
  const cards = (await boardOrders(db, settings)).map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    firstName: o.first_name,
    spec: specLine(o.design),
    neededBy: o.needed_by,
    rush: o.rush,
  }));
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Production board</h1>
      <p className="mt-1 text-sm text-stone-600">Paid orders start in the first column. Drag a card to move it, or use its buttons on a phone.</p>
      <Board cards={cards} completeDays={settings.production.board_complete_days ?? 14} />
    </main>
  );
}
