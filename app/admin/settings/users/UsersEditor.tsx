'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { invite, uninvite, updateRole } from '../../orders/actions';

type User = { email: string; role: string; invited_at: string; last_sign_in_at: string | null };
type Role = { name: string; permissions: Record<string, boolean> };

export default function UsersEditor({ me, users, roles, permissions }: { me: string; users: User[]; roles: Role[]; permissions: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roles.find((r) => r.name !== 'owner')?.name ?? 'production');
  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>(Object.fromEntries(roles.map((r) => [r.name, r.permissions])));
  const [newRole, setNewRole] = useState('');

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? 'Failed' });
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-medium">People</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr><th className="py-1">Email</th><th>Role</th><th>Last sign-in</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-t border-stone-100">
                <td className="py-1.5">{u.email}</td>
                <td>{u.role}</td>
                <td className="text-stone-500">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('en-CA') : 'Never'}</td>
                <td className="text-right">
                  {u.email !== me && (
                    <button className="text-xs text-red-700" disabled={pending} onClick={() => confirm(`Remove ${u.email}?`) && act(() => uninvite(u.email), `${u.email} removed.`)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => invite(email, role), `${email} invited as ${role}. They can sign in at /login.`);
            setEmail('');
          }}
        >
          <input className="input max-w-xs" type="email" placeholder="email to invite" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email to invite" />
          <select className="input w-40" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            {roles.map((r) => <option key={r.name}>{r.name}</option>)}
          </select>
          <button className="btn" disabled={pending}>Invite</button>
        </form>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-medium">Roles</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="py-1">Permission</th>
                {roles.map((r) => <th key={r.name} className="px-2 text-center">{r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(permissions).map(([key, label]) => (
                <tr key={key} className="border-t border-stone-100">
                  <td className="py-1.5 pr-2">{label}</td>
                  {roles.map((r) => (
                    <td key={r.name} className="px-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${r.name}: ${label}`}
                        checked={r.name === 'owner' || !!perms[r.name]?.[key]}
                        disabled={r.name === 'owner'}
                        onChange={(e) => setPerms((p) => ({ ...p, [r.name]: { ...p[r.name], [key]: e.target.checked } }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.filter((r) => r.name !== 'owner').map((r) => (
            <button key={r.name} className="btn" disabled={pending} onClick={() => act(() => updateRole(r.name, perms[r.name] ?? {}), `${r.name} saved.`)}>
              Save {r.name}
            </button>
          ))}
          <input className="input w-40" placeholder="new role name" value={newRole} onChange={(e) => setNewRole(e.target.value)} aria-label="New role name" />
          <button className="rounded-md border border-stone-300 px-3 py-2 text-sm" disabled={pending || !newRole} onClick={() => act(() => updateRole(newRole.trim().toLowerCase(), {}), `Role ${newRole} added.`)}>
            Add role
          </button>
        </div>
      </section>
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{msg.text}</p>}
    </div>
  );
}
