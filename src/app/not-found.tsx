import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center px-6 py-16 text-[var(--text)]">
      <p className="text-sm text-[var(--muted)]">404</p>
      <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-2xl">Page not found</h1>
      <Link href="/" className="mt-6 text-[var(--accent)] underline underline-offset-2">
        Back to Fragrance Wardrobe
      </Link>
    </div>
  );
}
