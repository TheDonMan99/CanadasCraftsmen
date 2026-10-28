'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { STATUS_LABEL, type Status } from '@/lib/order/payments';
import { shortDate } from '../ui';
import { changeStatus } from '../orders/actions';

interface CardData {
  id: string;
  number: string;
  status: Status;
  firstName: string;
  spec: string;
  neededBy: string | null;
  rush: boolean;
}

const COLUMNS: { status: Status; label: string }[] = [
  { status: 'paid_in_full', label: 'Paid, ready to start' },
  { status: 'in_production', label: 'In production' },
  { status: 'ready', label: 'Ready' },
  { status: 'complete', label: 'Complete' },
];

export default function Board({ cards, completeDays }: { cards: CardData[]; completeDays: number }) {
  const router = useRouter();
  const [items, setItems] = useState(cards);
  const [error, setError] = useState('');
  const [over, setOver] = useState<Status | null>(null);
  const [, start] = useTransition();

  const move = (id: string, to: Status) => {
    const card = items.find((c) => c.id === id);
    if (!card || card.status === to || to === 'paid_in_full') return;
    const before = items;
    setItems((xs) => xs.map((c) => (c.id === id ? { ...c, status: to } : c)));
    start(async () => {
      const r = await changeStatus(id, to);
      if (!r.ok) {
        setItems(before);
        setError(r.error);
      } else {
        setError('');
        router.refresh();
      }
    });
  };

  return (
    <>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = items.filter((c) => c.status === col.status);
          return (
            <section
              key={col.status}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.status);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData('text/plain'), col.status);
              }}
              className={`min-h-40 rounded-lg p-2 ${over === col.status ? 'bg-amber-100' : 'bg-stone-100'}`}
            >
              <h2 className="px-1 pb-2 text-sm font-medium">
                {col.label} <span className="text-stone-500">({list.length})</span>
                {col.status === 'complete' && <span className="block text-xs font-normal text-stone-500">last {completeDays} days</span>}
              </h2>
              <ul className="space-y-2">
                {list.map((c) => {
                  const i = COLUMNS.findIndex((x) => x.status === c.status);
                  const next = COLUMNS[i + 1];
                  return (
                    <li
                      key={c.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                      className="cursor-grab rounded-md bg-white p-2 text-sm shadow-sm ring-1 ring-stone-200"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/admin/orders/${c.id}`} className="font-medium underline">{c.number}</Link>
                        <span className="text-xs text-stone-500">{c.rush && <strong className="text-red-700">RUSH </strong>}{shortDate(c.neededBy)}</span>
                      </div>
                      <div className="text-xs text-stone-500">{c.firstName}</div>
                      <div className="mt-1 text-xs">{c.spec}</div>
                      {next && (
                        <button className="mt-2 text-xs text-blue-700 underline" onClick={() => move(c.id, next.status)}>
                          → {STATUS_LABEL[next.status]}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
