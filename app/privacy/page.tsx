import type { Metadata } from 'next';
import { loadSettings } from '@/lib/data';

export const metadata: Metadata = { title: 'Privacy' };
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const settings = await loadSettings();
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Privacy</h1>
      <p className="mt-4 text-stone-700">{settings.business.privacy_note}</p>
      <p className="mt-4 text-stone-700">
        The order form uses Cloudflare Turnstile to keep out spam, and one small cookie that remembers your device so we can limit how many orders one device sends per hour.
      </p>
      <p className="mt-4 text-stone-700">To see, change or delete what we hold about you, reply to any email from us.</p>
    </main>
  );
}
