import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 text-sm">
          <span className="font-semibold">Admin</span>
          <Link href="/admin/lab" className="text-stone-700 hover:text-stone-950">Engine lab</Link>
          <Link href="/admin/settings/catalog" className="text-stone-700 hover:text-stone-950">Settings</Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
