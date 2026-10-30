import type { Metadata } from 'next';
import SiteFooter from '@/app/components/SiteFooter';
import SiteHeader from '@/app/components/SiteHeader';
import { loadSettings } from '@/lib/data';

export const metadata: Metadata = { title: 'Privacy' };
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const settings = await loadSettings();
  return (
    <>
      <SiteHeader />
      <main className="cc-body-l mx-auto max-w-2xl px-4 py-16 md:px-12 md:py-24">
        <h1 className="cc-display-l">Privacy</h1>
        <p className="mt-8">{settings.business.privacy_note}</p>
        <p className="mt-4">
          The order form uses Cloudflare Turnstile to keep out spam, and one small cookie that remembers your device so we can limit how many orders one device sends per hour.
        </p>
        <p className="mt-4">To see, change or delete what we hold about you, reply to any email from us.</p>
      </main>
      <SiteFooter />
    </>
  );
}
