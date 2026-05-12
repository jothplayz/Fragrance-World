import Link from "next/link";

export default function CollectionNotFound() {
  return (
    <main className="relative z-10 mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="font-[family-name:var(--font-fraunces)] text-2xl text-[var(--text)]">Bottle not found</h1>
      <p className="mt-3 text-[var(--muted)]">It may have been removed from your collection.</p>
      <Link
        href="/#collection"
        className="mt-8 inline-block text-[var(--accent)] underline underline-offset-4"
      >
        Back to collection
      </Link>
    </main>
  );
}
