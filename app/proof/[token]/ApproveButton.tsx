'use client';

import { useState } from 'react';
import { AlertIcon, CheckIcon } from '@/app/components/icons';

export default function ApproveButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (state === 'done')
    return (
      <p className="cc-body-l cc-success mt-8 flex items-start gap-2" role="status">
        <CheckIcon />
        <span>Proof approved. We’ll make your sign exactly as shown.</span>
      </p>
    );
  return (
    <div className="mt-8">
      <button
        className="cc-btn cc-btn--primary w-full sm:w-auto"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          const res = await fetch(`/api/proof/${encodeURIComponent(token)}/approve`, { method: 'POST' });
          setState(res.ok ? 'done' : 'error');
        }}
      >
        {state === 'busy' ? 'Approving…' : 'Approve proof'}
      </button>
      {state === 'error' && (
        <p className="cc-field__error mt-3" role="alert">
          <AlertIcon />
          <span>That link has already been used or has expired. Reply to our email and we’ll send a new one.</span>
        </p>
      )}
    </div>
  );
}
