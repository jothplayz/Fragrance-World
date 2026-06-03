import Link from "next/link";
import { notFound } from "next/navigation";
import { BottleThumb } from "@/components/BottleThumb";
import { ExpandableNotes } from "@/components/ExpandableNotes";
import { FragranceInsightPanels } from "@/components/FragranceInsightPanels";
import { EditFragranceModal } from "@/components/EditFragranceModal";
import { imageUrlFromFragranticaPerfumeUrl } from "@/lib/apify-fragrantica";
import {
  buildTextForFragranceParsing,
  enrichFragranceRecord,
  hasEnoughCopyForParsing,
  parseEnrichmentJson,
} from "@/lib/enrich-fragrance";
import { parseFragranceDescription } from "@/lib/parse-fragrance-notes";
import { prisma } from "@/lib/db";
import { parseTagsFromJson } from "@/lib/tag-options";
import { parseSeasonsFromJson } from "@/lib/season-options";
import { parseOccasionsFromJson } from "@/lib/occasion-options";
import { findSimilarFragrances } from "@/lib/fragrance-similarity";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const f = await prisma.fragrance.findUnique({
    where: { id },
    select: { name: true, brand: true },
  });
  if (!f) return { title: "Not found · Fragrance Wardrobe" };
  return {
    title: `${f.name} · ${f.brand}`,
    description: `Wear hints, notes, and Fragrantica link for ${f.name} by ${f.brand}.`,
  };
}

export default async function CollectionDetailPage({ params }: Props) {
  const { id } = await params;
  let f = await prisma.fragrance.findUnique({ where: { id } });
  if (!f) notFound();

  if (!hasEnoughCopyForParsing(f.notes, f.enrichmentJson)) {
    try {
      await enrichFragranceRecord(id, { wikipediaOnly: true });
    } catch {
      /* offline / rate limit */
    }
    const again = await prisma.fragrance.findUnique({ where: { id } });
    if (again) f = again;
  }

  const imageUrl = f.imageUrl?.trim() || imageUrlFromFragranticaPerfumeUrl(f.fragranticaUrl);
  const tags = parseTagsFromJson(f.tags);
  const seasons = parseSeasonsFromJson(f.seasons);
  const occasions = parseOccasionsFromJson(f.occasions);
  const enrichment = parseEnrichmentJson(f.enrichmentJson);
  const parseInput = buildTextForFragranceParsing(f.notes, f.enrichmentJson);
  const parsed = parseFragranceDescription(parseInput);
  const notesForDisplay = f.notes.trim() || enrichment.bodyText.trim();

  const allFragrances = await prisma.fragrance.findMany({
    select: { id: true, name: true, brand: true, tags: true, notes: true, seasons: true, imageUrl: true, fragranticaUrl: true },
  });
  const similar = findSimilarFragrances(f, allFragrances);

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-6">
        <Link
          href="/#collection"
          className="text-sm text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--accent)]"
        >
          ← Collection
        </Link>
        <div className="flex items-center gap-3">
          <EditFragranceModal
            id={f.id}
            initial={{
              name: f.name,
              brand: f.brand,
              tags,
              seasons,
              occasions,
              notes: f.notes,
              fragranticaUrl: f.fragranticaUrl,
              imageUrl: f.imageUrl ?? "",
            }}
          />
          <Link
            href="/"
            className="text-sm text-[var(--muted)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text)]"
          >
            Home
          </Link>
        </div>
      </nav>

      <header className="mb-10 flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:gap-10">
        <BottleThumb src={imageUrl} label={f.name} size="lg" />
        <div className="min-w-0 flex-1 text-center sm:pt-2 sm:text-left">
          <p className="text-sm text-[var(--muted)]">{f.brand}</p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl font-medium tracking-tight text-[var(--text)] sm:text-4xl">
            {f.name}
          </h1>
          {tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[var(--accent-soft)]/30 px-3 py-1 text-xs font-medium text-[var(--accent)]"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No mood tags saved — add some on the home page for better daily picks.
            </p>
          )}
        </div>
      </header>

      <FragranceInsightPanels
        parsed={parsed}
        enrichmentSources={enrichment.sources}
        brand={f.brand}
        name={f.name}
        moodTags={tags}
      />

      <div className="mt-10">
        <ExpandableNotes full={notesForDisplay} />
      </div>

      {similar.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">
            Similar in your collection
          </h2>
          <ul className="space-y-2">
            {similar.map(({ fragrance: s, sharedTags, sharedNotes }) => {
              const sImg = s.imageUrl?.trim() || imageUrlFromFragranticaPerfumeUrl(s.fragranticaUrl ?? "");
              return (
                <li key={s.id}>
                  <Link
                    href={`/collection/${s.id}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/50 p-3 hover:border-[var(--accent)]/60 transition-colors"
                  >
                    <BottleThumb src={sImg} label={s.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text)]">{s.name}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{s.brand}</p>
                      {sharedTags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sharedTags.map((t) => (
                            <span key={t} className="rounded-full bg-[var(--accent-soft)]/20 px-2 py-0.5 text-[10px] text-[var(--accent)]">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {sharedNotes.length > 0 && (
                        <p className="mt-1 text-[10px] text-[var(--muted)]">
                          Shares: {sharedNotes.slice(0, 4).join(", ")}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {f.fragranticaUrl ? (
        <div className="mt-12 flex flex-col items-center gap-4 border-t border-[var(--border)] pt-10 sm:items-start">
          <a
            href={f.fragranticaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-medium text-[var(--bg)] hover:opacity-90"
          >
            Open full page on Fragrantica
            <span aria-hidden>↗</span>
          </a>
          <p className="max-w-md text-center text-xs text-[var(--muted)] sm:text-left">
            Official listing for pyramids, longevity/sillage votes, similar scents, and reviews.
          </p>
        </div>
      ) : (
        <p className="mt-12 text-sm text-[var(--muted)]">No Fragrantica link saved for this bottle.</p>
      )}
    </main>
  );
}
