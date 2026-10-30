'use client';

import { useActionState } from 'react';
import { AlertIcon, CheckIcon } from '@/app/components/icons';
import { sendLink } from './actions';

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendLink, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="cc-field">
        <span className="cc-field__label">Email</span>
        <input name="email" type="email" autoComplete="email" required className="cc-field__input" />
      </label>
      <button className="cc-btn cc-btn--primary w-full" disabled={pending}>{pending ? 'Sending…' : 'Email me a sign-in link'}</button>
      {state && (
        <p className={`flex items-start gap-2 ${state.error ? 'cc-field__error' : 'cc-small cc-success'}`} role="status">
          {state.error ? <AlertIcon /> : <CheckIcon />}
          <span>{state.message}</span>
        </p>
      )}
    </form>
  );
}
