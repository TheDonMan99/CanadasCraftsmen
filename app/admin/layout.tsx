import Link from 'next/link';
import type { Perm } from '@/lib/auth/permissions';
import { requirePage } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const NAV: { href: string; label: string; perm: Perm | Perm[] }[] = [
  { href: '/admin', label: 'Home', perm: ['view_orders', 'view_board'] },
  { href: '/admin/orders', label: 'Orders', perm: 'view_orders' },
  { href: '/admin/board', label: 'Board', perm: 'view_board' },
  { href: '/admin/nesting', label: 'Nesting', perm: 'manage_nesting' },
  { href: '/admin/inventory', label: 'Inventory', perm: 'manage_inventory' },
  { href: '/admin/customers', label: 'Customers', perm: 'view_contacts' },
  { href: '/admin/reports', label: 'Reports', perm: 'view_reports' },
  { href: '/admin/quote', label: 'Quick quote', perm: 'edit_orders' },
  { href: '/admin/templates', label: 'Replies', perm: 'edit_orders' },
  { href: '/admin/lab', label: 'Lab', perm: 'download_files' },
  { href: '/admin/settings/catalog', label: 'Settings', perm: ['edit_catalog', 'edit_settings', 'manage_users'] },
];

// Everything under /admin needs a signed-in, invited user; each page also checks its own permission.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  const can = (p: Perm | Perm[]) => (Array.isArray(p) ? p : [p]).some((x) => user.perms[x]);
  return (
    <div className="min-h-screen">
      <nav className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-x-4 gap-y-1 overflow-x-auto px-4 py-2 text-sm">
          <span className="font-semibold">Admin</span>
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-stone-700 hover:text-stone-950">{n.label}</Link>
          ))}
          <span className="ml-auto whitespace-nowrap text-xs text-stone-500">{user.email} · {user.role}</span>
          <form action="/logout" method="post">
            <button className="whitespace-nowrap text-xs text-stone-600 underline">Sign out</button>
          </form>
        </div>
      </nav>
      {children}
    </div>
  );
}
