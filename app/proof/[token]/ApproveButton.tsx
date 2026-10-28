'use client';

import { useState } from 'react';

export default function ApproveButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (state === 'done') return <p className="mt-6 rounded-lg bg-green-50 p-3 text-green-900">Thank you! Your sign is approved and we’ll make it exactly as shown.</p>;
  return (
    <div className="mt-6">
      <button
        className="w-full rounded-lg bg-amber-700 px-4 py-3 font-medium text-white disabled:opacity-50"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          const res = await fetch(`/api/proof/${encodeURIComponent(token)}/approve`, { method: 'POST' });
          setState(res.ok ? 'done' : 'error');
        }}
      >
        {state === 'busy' ? 'Approving…' : 'Approve this design'}
      </button>
      {state === 'error' && <p className="mt-2 text-sm text-red-700">That didn’t work. The link may have been used already.</p>}
    </div>
  );
}
