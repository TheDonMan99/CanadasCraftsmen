import Link from 'next/link';

// Placeholder landing page; the full landing page and designer arrive in phase 3.
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold">Welcome Sign Generator</h1>
      <p className="mt-4 text-stone-600">
        The public order page arrives in phase 3. The engine test bench is ready now.
      </p>
      <Link href="/admin/lab" className="mt-6 inline-block rounded-md bg-stone-900 px-4 py-2 text-white">
        Open the engine lab
      </Link>
    </main>
  );
}
