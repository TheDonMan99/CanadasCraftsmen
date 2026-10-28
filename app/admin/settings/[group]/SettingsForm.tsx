'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SettingsGroup } from '@/lib/db/settings';
import { saveSettingsGroup } from '../actions';
import { ValueEditor } from '../ValueEditor';

export default function SettingsForm({ group, value, canSave }: { group: SettingsGroup; value: Record<string, any>; canSave: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <ValueEditor value={v} onChange={setV} />
      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn disabled:opacity-50"
          disabled={!canSave || !dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await saveSettingsGroup(group, v as any);
              setMessage(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button className="text-sm text-stone-600 disabled:opacity-40" disabled={!dirty} onClick={() => setV(value)}>Undo changes</button>
        {message && <span className={message.ok ? 'text-sm text-green-800' : 'text-sm text-red-700'} role="status">{message.text}</span>}
      </div>
    </div>
  );
}
