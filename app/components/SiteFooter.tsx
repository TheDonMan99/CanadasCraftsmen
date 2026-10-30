import Link from 'next/link';

/** Customer pages: a char band with the stacked reversed logo and the privacy link. */
export default function SiteFooter() {
  return (
    <footer className="cc-band">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 md:flex-row md:items-end md:justify-between md:px-12">
        <img src="/brand/cc-logo-stacked-reversed.svg" alt="Canada’s Craftsmen, Sherwood Park, Alberta" width={200} height={133} className="h-auto w-[200px]" />
        <nav className="cc-small flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <Link href="/design" className="underline underline-offset-4">Design your sign</Link>
          <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
