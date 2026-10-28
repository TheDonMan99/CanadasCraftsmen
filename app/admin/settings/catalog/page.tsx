import Link from 'next/link';
import { byCategory } from '@/lib/config/catalog';
import { requirePage } from '@/lib/auth/session';
import { dataSource, loadCatalog } from '@/lib/data';
import { CATEGORIES } from '../groups';
import CatalogEditor from './CatalogEditor';

export const dynamic = 'force-dynamic';

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requirePage('edit_catalog');
  const { category: raw } = await searchParams;
  const category = CATEGORIES.some((c) => c.key === raw) ? raw! : 'product';
  const catalog = await loadCatalog();
  const options = byCategory(catalog, category, false);
  return (
    <div>
      <h1 className="mb-3 text-2xl font-semibold">Catalog</h1>
      <div className="mb-4 flex flex-wrap gap-1">
        {CATEGORIES.map((c) => {
          const all = byCategory(catalog, c.key, false);
          return (
            <Link
              key={c.key}
              href={`/admin/settings/catalog?category=${c.key}`}
              className={`rounded-full border px-3 py-1 text-xs ${c.key === category ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
            >
              {c.label} <span className="opacity-60">{all.filter((o) => o.enabled).length}/{all.length}</span>
            </Link>
          );
        })}
      </div>
      <CatalogEditor key={category} category={category} options={options} canSave={dataSource() === 'database'} />
    </div>
  );
}
