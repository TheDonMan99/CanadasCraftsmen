'use client';

import { useActionState } from 'react';
import { sendLink } from './actions';

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendLink, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-stone-700">
        Email
        <input name="email" type="email" autoComplete="email" required className="input mt-1 py-2 text-base" />
      </label>
      <button className="btn w-full py-3" disabled={pending}>{pending ? 'Sending…' : 'Email me a sign-in link'}</button>
      {state && <p className={`text-sm ${state.error ? 'text-red-700' : 'text-green-800'}`} role="status">{state.message}</p>}
    </form>
  );
}
