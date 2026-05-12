import type { ReactNode } from "react";
import type { EnrichmentSource } from "@/lib/enrich-fragrance";
import type { ParsedFragranceDescription } from "@/lib/parse-fragrance-notes";
import { seasonHintsFromMoodTags, wearHintsFromMoodTags } from "@/lib/tag-fallback-hints";
import type { FragranceTag } from "@/lib/tag-options";

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-[var(--muted)]">—</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((x) => (
        <li
          key={x}
          className="rounded-full border border-[var(--border)] bg-[var(--bg)]/60 px-3 py-1 text-sm text-[var(--text)]"
        >
          {x}
        </li>
      ))}
    </ul>
  );
}

function InsightCard({
  title,
  children,
  footnote,
}: {
  title: string;
  children: ReactNode;
  footnote?: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-5 shadow-lg shadow-black/15">
      <h2 className="font-[family-name:var(--font-fraunces)] text-lg text-[var(--accent)]">{title}</h2>
      {footnote ? <p className="mt-1 text-xs text-[var(--muted)]">{footnote}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function FragranceInsightPanels({
  parsed,
  enrichmentSources = [],
  brand,
  name,
  moodTags = [],
}: {
  parsed: ParsedFragranceDescription;
  enrichmentSources?: EnrichmentSource[];
  brand: string;
  name: string;
  moodTags?: FragranceTag[];
}) {
  const { pyramid, wear, seasons, overview } = parsed;
  const hasPyramid =
    pyramid.top.items.length + pyramid.middle.items.length + pyramid.base.items.length > 0;
  const hasEnrichment = enrichmentSources.length > 0;

  const tagWear = wearHintsFromMoodTags(moodTags);
  const tagSeasons = seasonHintsFromMoodTags(moodTags);
  const wearFromTags = wear.length === 0 && tagWear.length > 0;
  const seasonsFromTags = seasons.length === 0 && tagSeasons.length > 0;
  const displayWear = wear.length > 0 ? wear : tagWear;
  const displaySeasons = seasons.length > 0 ? seasons : tagSeasons;

  const overviewText =
    overview ||
    `${name} by ${brand}. ${
      hasEnrichment
        ? "Fetched copy is merged below with anything you typed in notes."
        : moodTags.length > 0
          ? "Mood tags drive the wear/season hints until you add notes or a Fragrantica link."
          : "Add mood tags, paste a short description in notes, or link Fragrantica on the home page so we can fill this in from the web."
    }`;

  return (
    <div className="space-y-6">
      <InsightCard
        title="At a glance"
        footnote={
          overview
            ? hasEnrichment
              ? "Ideas from auto-fetched copy plus your notes — still best confirmed on skin."
              : "First ideas pulled from your saved description — not a replacement for wearing and testing."
            : "Summary line until parsed text arrives from Wikipedia, Fragrantica (with Apify), or your own notes."
        }
      >
        <p className="text-[var(--text)] leading-relaxed">{overviewText}</p>
      </InsightCard>

      <div className="grid gap-6 sm:grid-cols-2">
        <InsightCard
          title="When to wear"
          footnote={
            wearFromTags
              ? "Soft guesses from your mood tags — not from review text."
              : hasEnrichment
                ? "Phrases and keywords from your notes and any auto-fetched description."
                : "Phrases and keywords detected in your notes (explicit lines rank above guesses)."
          }
        >
          {displayWear.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No time-of-day cues yet. Add mood tags on the home page, paste a Fragrantica blurb into notes, or open the
              full listing below.
            </p>
          ) : (
            <ul className="space-y-3">
              {displayWear.map((w, i) => (
                <li key={`${w.label}-${i}`} className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/30 p-3">
                  <p className="font-medium text-[var(--text)]">{w.label}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{w.basis}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]/70">
                    {w.kind === "explicit" ? "From wording" : wearFromTags ? "From mood tags" : "Keyword hint"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        <InsightCard
          title="Season & weather"
          footnote={
            seasonsFromTags
              ? "Soft guesses from your mood tags — not from season words in a review."
              : "Only shown when the copy mentions seasons or similar words."
          }
        >
          {displaySeasons.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No season cues in the text yet. Try mood tags (fresh/citrus often read “warm weather”; woody/amber often
              read “cooler”), or check community votes on Fragrantica.
            </p>
          ) : (
            <ul className="space-y-3">
              {displaySeasons.map((s, i) => (
                <li key={`${s.label}-${i}`} className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/30 p-3">
                  <p className="font-medium text-[var(--text)]">{s.label}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{s.basis}</p>
                  {seasonsFromTags ? (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]/70">From mood tags</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </InsightCard>
      </div>

      {hasPyramid ? (
        <InsightCard title="Note pyramid" footnote="Parsed from classic “top / middle / base notes” lines when present.">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Top</h3>
              <div className="mt-2">
                <ChipList items={pyramid.top.items} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Middle / heart</h3>
              <div className="mt-2">
                <ChipList items={pyramid.middle.items} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Base</h3>
              <div className="mt-2">
                <ChipList items={pyramid.base.items} />
              </div>
            </div>
          </div>
        </InsightCard>
      ) : null}

      {hasEnrichment ? (
        <p className="text-center text-xs text-[var(--muted)] sm:text-left">
          Auto-fetched from{" "}
          {enrichmentSources.map((s, i) => (
            <span key={`${s.type}-${s.url ?? s.title ?? i}`}>
              {i > 0 ? " · " : null}
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--accent)]"
                >
                  {s.type === "fragrantica" ? "Fragrantica" : "Wikipedia"}
                  {s.title ? ` (${s.title})` : ""}
                </a>
              ) : (
                <span>{s.type === "fragrantica" ? "Fragrantica" : "Wikipedia"}</span>
              )}
            </span>
          ))}
          . Facts may be incomplete; check the source pages.
        </p>
      ) : null}
    </div>
  );
}
