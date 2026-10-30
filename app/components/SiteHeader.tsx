import Link from 'next/link';

/** Customer pages: the horizontal logo linking home, and the one main action. */
export default function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-12">
        {/* clear space around the logo is kept by the padding */}
        <Link href="/" className="block py-1" aria-label="Canada’s Craftsmen home">
          <img src="/brand/cc-logo-horizontal.svg" alt="Canada’s Craftsmen" width={203} height={40} className="h-10 w-auto" />
        </Link>
        {cta && (
          <Link href="/design" className="cc-btn cc-btn--primary hidden sm:inline-flex">
            Design your sign
          </Link>
        )}
      </div>
    </header>
  );
}
