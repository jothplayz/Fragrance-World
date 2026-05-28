import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  analyzeWardrobe,
  TAG_LABEL,
  SEASON_LABEL,
  OCCASION_LABEL,
  type WardrobeGap,
} from "@/lib/wardrobe-analysis";
import { TAG_OPTIONS } from "@/lib/tag-options";
import { SEASON_OPTIONS } from "@/lib/season-options";
import { OCCASION_OPTIONS } from "@/lib/occasion-options";

export const dynamic = "force-dynamic";

function PriorityBadge({ priority }: { priority: WardrobeGap["priority"] }) {
  const styles = {
    high: "bg-red-500/20 text-red-300 border-red-500/30",
    medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    low: "bg-[var(--accent-soft)]/20 text-[var(--accent)] border-[var(--accent-soft)]/30",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[priority]}`}>
      {priority}
    </span>
  );
}

function CoverageBar({ count, max, label }: { count: number; max: number; label: string }) {
  const pct = max === 0 ? 0 : Math.min(100, (count / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-[var(--muted)]">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-4 shrink-0 text-right text-xs text-[var(--muted)]">{count}</span>
    </div>
  );
}

export default async function WardrobePage() {
  const fragrances = await prisma.fragrance.findMany({
    select: { tags: true, seasons: true, occasions: true },
  });

  const analysis = analyzeWardrobe(fragrances);
  const maxTagCount = Math.max(1, ...Object.values(analysis.tagCoverage));
  const maxSeasonCount = Math.max(1, ...Object.values(analysis.seasonCoverage));
  const maxOccasionCount = Math.max(1, ...Object.values(analysis.occasionCoverage));

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <nav className="mb-8 flex items-center justify-between border-b border-[var(--border)] pb-6">
        <Link
          href="/"
          className="text-sm text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--accent)]"
        >
          ← Home
        </Link>
        <Link
          href="/layer"
          className="text-sm text-[var(--muted)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text)]"
        >
          Layering →
        </Link>
      </nav>

      <header className="mb-10">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-medium text-[var(--text)]">
          Wardrobe Analysis
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {analysis.totalCount === 0
            ? "Add fragrances to your collection to see analysis."
            : `Based on ${analysis.totalCount} fragrance${analysis.totalCount === 1 ? "" : "s"} in your collection.`}
        </p>
      </header>

      {analysis.totalCount === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Your collection is empty.{" "}
          <Link href="/" className="text-[var(--accent)] underline underline-offset-2">
            Add fragrances
          </Link>{" "}
          to get started.
        </p>
      ) : (
        <div className="space-y-10">

          {/* Strengths */}
          {analysis.strengths.length > 0 && (
            <section>
              <h2 className="mb-3 font-[family-name:var(--font-fraunces)] text-lg text-[var(--text)]">
                Strengths
              </h2>
              <ul className="space-y-2">
                {analysis.strengths.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                    <span className="mt-0.5 shrink-0 text-[var(--accent)]">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Gaps */}
          {analysis.gaps.length > 0 && (
            <section>
              <h2 className="mb-3 font-[family-name:var(--font-fraunces)] text-lg text-[var(--text)]">
                Gaps to Fill
              </h2>
              <ul className="space-y-3">
                {analysis.gaps.map((gap) => (
                  <li
                    key={gap.category}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <PriorityBadge priority={gap.priority} />
                      <span className="text-sm font-medium text-[var(--text)]">{gap.category}</span>
                    </div>
                    <p className="text-xs text-[var(--muted)]">{gap.description}</p>
                    <p className="mt-1.5 text-xs text-[var(--accent)]">{gap.suggestion}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {analysis.gaps.length === 0 && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
              <p className="text-sm text-[var(--muted)]">No major gaps — your collection is well-rounded.</p>
            </section>
          )}

          {/* Tag Coverage */}
          <section>
            <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-lg text-[var(--text)]">
              Scent Tags
            </h2>
            <div className="space-y-2.5">
              {TAG_OPTIONS.map((tag) => (
                <CoverageBar
                  key={tag}
                  label={TAG_LABEL[tag]}
                  count={analysis.tagCoverage[tag]}
                  max={maxTagCount}
                />
              ))}
            </div>
          </section>

          {/* Season Coverage */}
          <section>
            <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-lg text-[var(--text)]">
              Seasons
            </h2>
            <div className="space-y-2.5">
              {SEASON_OPTIONS.map((s) => (
                <CoverageBar
                  key={s}
                  label={SEASON_LABEL[s]}
                  count={analysis.seasonCoverage[s]}
                  max={maxSeasonCount}
                />
              ))}
            </div>
          </section>

          {/* Occasion Coverage */}
          <section>
            <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-lg text-[var(--text)]">
              Occasions
            </h2>
            <div className="space-y-2.5">
              {OCCASION_OPTIONS.map((o) => (
                <CoverageBar
                  key={o}
                  label={OCCASION_LABEL[o]}
                  count={analysis.occasionCoverage[o]}
                  max={maxOccasionCount}
                />
              ))}
            </div>
          </section>

        </div>
      )}
    </main>
  );
}
