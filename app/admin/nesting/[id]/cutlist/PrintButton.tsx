'use client';

export default function PrintButton() {
  return <button className="btn print:hidden" onClick={() => window.print()}>Print</button>;
}
