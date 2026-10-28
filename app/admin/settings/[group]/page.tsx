import { notFound } from 'next/navigation';
import { largestSign } from '@/lib/config/catalog';
import { dataSource, loadSettings } from '@/lib/data';
import type { SettingsGroup } from '@/lib/db/settings';
import { SETTINGS_PAGES } from '../groups';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

const NOTES: Record<string, string> = {
  machine: 'Changing the cut area, panel size or margin recalculates the largest sign and which size presets fit.',
  engine: 'Per-font and per-material values (auto-thicken, kerf, minimum feature width) are set on each font and material in the catalog and override these.',
  pricing: 'Amounts are in cents: 3000 = $30.00. The hourly rate is optional; until it is set, margin shows materials only.',
  payments: 'The amount due at ordering is a percent of the total: 100 means full payment upfront.',
  tax: 'GST is off by default. The reports page warns when rolling four-quarter sales reach the warning amount (in cents).',
  business: 'No pickup address is shown anywhere; the pickup note is all customers see.',
};

export default async function SettingsGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const page = SETTINGS_PAGES.find((p) => p.slug === group);
  if (!page) notFound();
  if (!page.group)
    return (
      <div>
        <h1 className="mb-3 text-2xl font-semibold">{page.label}</h1>
        <p className="text-stone-600">{page.note}</p>
      </div>
    );
  const settings = await loadSettings();
  const key = page.group as SettingsGroup;
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">{page.label}</h1>
      {NOTES[group] && <p className="mb-3 text-sm text-stone-600">{NOTES[group]}</p>}
      {group === 'machine' && <p className="mb-3 text-sm">Largest sign with these settings: <strong>{largestSign(settings)} in</strong>.</p>}
      <SettingsForm key={JSON.stringify(settings[key])} group={key} value={settings[key] as Record<string, any>} canSave={dataSource() === 'database'} />
    </div>
  );
}
