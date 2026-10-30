import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SiteFooter from '@/app/components/SiteFooter';
import SiteHeader from '@/app/components/SiteHeader';
import { CheckIcon } from '@/app/components/icons';
import { loadCatalog, loadSettings } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { getOrderForCustomer } from '@/lib/db/orders';
import { formatDate, paymentInstructions, refundPolicy } from '@/lib/order/rules';
import { dollars } from '@/lib/pricing';

export const metadata: Metadata = { title: 'Order received', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ConfirmationPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ number }, { t }] = await Promise.all([params, searchParams]);
  const db = getDb();
  if (!db) notFound();
  const order = await getOrderForCustomer(db, decodeURIComponent(number), t ?? '');
  if (!order) notFound();
  const [catalog, settings] = await Promise.all([loadCatalog({ enabledOnly: true }), loadSettings()]);
  const labels = order.design.labels ?? {};
  const delivery = catalog.find((o) => o.id === order.delivery_method);
  const lines: { label: string; cents: number; note?: string; key: string }[] = order.price_breakdown.lines ?? [];
  return (
    <>
    <SiteHeader cta={false} />
    <main className="mx-auto max-w-2xl px-4 py-16 md:px-12">
      <p className="cc-label cc-success flex items-center gap-2">
        <CheckIcon />
        Order received
      </p>
      <h1 className="cc-display-l mt-2">Thank you, {order.customer_name.split(/\s+/)[0]}</h1>
      <p className="cc-body-l mt-6 text-kerf">
        Your order number is <strong className="text-stone-900">{order.number}</strong>.{' '}
        {/* customer emails are held until a sending domain is set up */}
        {settings.emails.from_address ? `A copy is on its way to ${order.customer_email}.` : 'Keep this page: it has everything you need to pay.'}
      </p>

      <section className="mt-8 rounded-sm border border-line bg-white p-6">
        <h2 className="cc-display-s">Amount due: {dollars(order.deposit_required)}</h2>
        <ul className="cc-body mt-4 space-y-2">
          {paymentInstructions(catalog, settings, order.number, order.deposit_required).map((p) => <li key={p}>{p}</li>)}
        </ul>
        <p className="cc-small mt-4 text-kerf">We start on your sign once payment arrives.</p>
      </section>

      <section className="cc-body mt-6 rounded-sm border border-line bg-white p-6">
        <h2 className="cc-title">Your sign</h2>
        <ul className="mt-2 space-y-1">
          {(labels.lines ?? []).map((l: { text: string; font: string }, i: number) => <li key={i}>“{l.text}” in {l.font}</li>)}
          <li>{[labels.product, labels.size, labels.style, labels.material, [labels.finish, ...(labels.colours ?? [])].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</li>
        </ul>
        {settings.pricing.show_breakdown && (
          <table className="mt-3 w-full">
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b border-line">
                  <td className="py-1">{l.label}</td>
                  <td className="py-1 text-right">{dollars(l.cents)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 font-semibold">Total</td>
                <td className="py-1 text-right font-semibold">{dollars(order.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="mt-3 text-stone-600">
          {delivery?.values.needs_address ? `${delivery.label}: we’ll be in touch to arrange delivery.` : settings.business.pickup_note}
          {order.needed_by && ` Needed by ${formatDate(order.needed_by)}.`}
        </p>
      </section>

      <p className="cc-small mt-6 text-kerf">{refundPolicy(settings)}</p>
      <p className="cc-small mt-2 text-kerf">{settings.emails.from_address ? 'Questions? Just reply to the email we sent you.' : 'Questions? Message us where you found us, and quote your order number.'}</p>
    </main>
    <SiteFooter />
    </>
  );
}

