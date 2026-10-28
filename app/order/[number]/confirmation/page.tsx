import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-sm font-medium text-green-800">Order received</p>
      <h1 className="mt-1 text-3xl font-semibold">Thank you, {order.customer_name.split(/\s+/)[0]}!</h1>
      <p className="mt-2 text-stone-600">
        Your order number is <strong className="text-stone-900">{order.number}</strong>.{' '}
        {/* customer emails are held until a sending domain is set up */}
        {settings.emails.from_address ? `A copy is on its way to ${order.customer_email}.` : 'Keep this page: it has everything you need to pay.'}
      </p>

      <section className="mt-6 rounded-lg bg-white p-4 ring-1 ring-stone-200">
        <h2 className="font-medium">Amount due: {dollars(order.deposit_required)}</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {paymentInstructions(catalog, settings, order.number, order.deposit_required).map((p) => <li key={p}>{p}</li>)}
        </ul>
        <p className="mt-3 text-sm text-stone-600">We start on your sign once payment arrives.</p>
      </section>

      <section className="mt-4 rounded-lg bg-white p-4 text-sm ring-1 ring-stone-200">
        <h2 className="font-medium">Your sign</h2>
        <ul className="mt-2 space-y-1">
          {(labels.lines ?? []).map((l: { text: string; font: string }, i: number) => <li key={i}>“{l.text}” in {l.font}</li>)}
          <li>{[labels.product, labels.size, labels.style, labels.material, [labels.finish, ...(labels.colours ?? [])].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</li>
        </ul>
        {settings.pricing.show_breakdown && (
          <table className="mt-3 w-full">
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b border-stone-100">
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

      <p className="mt-4 text-sm text-stone-600">{refundPolicy(settings)}</p>
      <p className="mt-2 text-sm text-stone-600">{settings.emails.from_address ? 'Questions? Just reply to the email we sent you.' : 'Questions? Message us where you found us, and quote your order number.'}</p>
    </main>
  );
}
