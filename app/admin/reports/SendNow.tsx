'use client';

import { useState, useTransition } from 'react';
import { sendNow } from './actions';

export default function SendNow() {
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const go = (job: 'daily_digest' | 'weekly_summary' | 'nightly_backup') =>
    start(async () => {
      const r = await sendNow(job);
      setMsg(r.ok ? r.message : r.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-stone-600">Email me now:</span>
      <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5" disabled={pending} onClick={() => go('daily_digest')}>Daily digest</button>
      <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5" disabled={pending} onClick={() => go('weekly_summary')}>Weekly summary</button>
      <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5" disabled={pending} onClick={() => go('nightly_backup')}>CSV backup</button>
      {msg && <span role="status">{msg}</span>}
    </div>
  );
}
