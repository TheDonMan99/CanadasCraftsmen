'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { removeTemplate, saveTemplate } from '../orders/actions';

type T = { id: string; title: string; body: string; filled: string };

export default function Replies({ templates, canEdit }: { templates: T[]; canEdit: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState('');
  const [editing, setEditing] = useState<{ id?: string; title: string; body: string } | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setEditing(null);
        setError('');
        router.refresh();
      } else setError(r.error ?? 'Failed');
    });
  return (
    <div className="mt-4 space-y-3">
      {templates.map((t) =>
        editing?.id === t.id ? null : (
          <section key={t.id} className="rounded-lg bg-white p-3 ring-1 ring-stone-200">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{t.title}</h2>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(t.filled).catch(() => {});
                    setCopied(t.id);
                    setTimeout(() => setCopied(''), 2000);
                  }}
                >
                  {copied === t.id ? 'Copied' : 'Copy'}
                </button>
                {canEdit && <button className="rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={() => setEditing({ id: t.id, title: t.title, body: t.body })}>Edit</button>}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{t.filled}</p>
          </section>
        ),
      )}
      {editing && (
        <form
          className="space-y-2 rounded-lg bg-white p-3 ring-2 ring-amber-500"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => saveTemplate(editing));
          }}
        >
          <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title" aria-label="Title" required />
          <textarea className="input" rows={6} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} aria-label="Text" required />
          <div className="flex gap-2">
            <button className="btn" disabled={pending}>Save</button>
            <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={() => setEditing(null)}>Cancel</button>
            {editing.id && (
              <button type="button" className="ml-auto text-sm text-red-700" onClick={() => confirm('Delete this reply?') && act(() => removeTemplate(editing.id!))}>
                Delete
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>
      )}
      {canEdit && !editing && <button className="text-sm text-blue-700 underline" onClick={() => setEditing({ title: '', body: '' })}>+ Add a reply</button>}
    </div>
  );
}
