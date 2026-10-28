import type { Metadata } from 'next';
import { loadCatalog, loadSettings } from '@/lib/data';
import LabClient from './LabClient';

export const metadata: Metadata = { title: 'Engine lab' };
// always read the live catalog, so switching an option off removes it here at once
export const dynamic = 'force-dynamic';

// No sign-in yet: everything under /admin gets the owner sign-in in phase 4.
export default async function LabPage({ searchParams }: { searchParams: Promise<{ font?: string; material?: string }> }) {
  const [catalog, settings, q] = await Promise.all([loadCatalog(), loadSettings(), searchParams]);
  return <LabClient catalog={catalog} settings={settings} initialFont={q.font} initialMaterial={q.material} />;
}
