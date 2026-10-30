import SiteFooter from '@/app/components/SiteFooter';
import SiteHeader from '@/app/components/SiteHeader';

export default function Paused({ message }: { message: string }) {
  return (
    <>
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-2xl px-4 py-16 md:px-12 md:py-24">
        <h1 className="cc-display-l">We’re taking a short break</h1>
        <p className="cc-body-l mt-8 text-kerf">{message || 'We’re not taking new orders right now. Please check back soon.'}</p>
      </main>
      <SiteFooter />
    </>
  );
}
