export default function Paused({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">We’re taking a short break</h1>
      <p className="mt-3 text-stone-600">{message || 'We’re not taking new orders right now. Please check back soon.'}</p>
    </main>
  );
}
