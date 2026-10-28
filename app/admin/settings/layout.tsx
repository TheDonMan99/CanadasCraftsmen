import Link from 'next/link';
import { dataSource } from '@/lib/data';
import { SETTINGS_PAGES } from './groups';

export const dynamic = 'force-dynamic';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const source = dataSource();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {source !== 'database' && (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Showing the seed files: the database isn’t connected (DATABASE_URL is not set), so changes can’t be saved.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {SETTINGS_PAGES.map((p) => (
            <Link key={p.slug} href={`/admin/settings/${p.slug}`} className="rounded px-2 py-1 text-sm text-stone-700 hover:bg-stone-200">
              {p.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
