import { PERMISSIONS } from '@/lib/auth/permissions';
import { requirePage } from '@/lib/auth/session';
import { listRoles, listUsers } from '@/lib/db/admin';
import { getDb } from '@/lib/db/client';
import UsersEditor from './UsersEditor';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await requirePage('manage_users', '/admin/settings/users');
  const db = getDb();
  if (!db) return <p className="text-stone-600">Users need the database.</p>;
  const [users, roles] = await Promise.all([listUsers(db), listRoles(db)]);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Users and roles</h1>
      <p className="mb-4 text-sm text-stone-600">
        Only people listed here can sign in, by a link emailed to them. The owner role always has every permission. Production never receives prices, payments or customer contact details.
      </p>
      <UsersEditor
        me={me.email}
        users={users.map((u) => ({ ...u, invited_at: String(u.invited_at), last_sign_in_at: u.last_sign_in_at ? String(u.last_sign_in_at) : null }))}
        roles={roles}
        permissions={PERMISSIONS}
      />
    </div>
  );
}
