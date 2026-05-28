"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { analyzeLayering, type LayeringAnalysis, type LayeringHarmony } from "@/lib/fragrance-layer";

type FragranceRow = {
  id: string;
  name: string;
  brand: string;
  tags: string;
  notes: string;
  longevity?: string;
};

const HARMONY_STYLES: Record<LayeringHarmony, { label: string; color: string; dots: number }> = {
  excellent: { label: "Excellent", color: "text-emerald-400", dots: 4 },
  good: { label: "Good", color: "text-[var(--accent)]", dots: 3 },
  fair: { label: "Fair", color: "text-amber-400", dots: 2 },
  risky: { label: "Risky", color: "text-red-400", dots: 1 },
};

function HarmonyDots({ harmony }: { harmony: LayeringHarmony }) {
  const { dots, color } = HARMONY_STYLES[harmony];
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`inline-block h-2.5 w-2.5 rounded-full border ${i <= dots ? `${color} border-current` : "border-[var(--border)] bg-transparent"}`}
        />
      ))}
    </div>
  );
}

function NoteChip({ note }: { note: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-0.5 text-xs capitalize text-[var(--muted)]">
      {note}
    </span>
  );
}

export default function LayerPage() {
  const [fragrances, setFragrances] = useState<FragranceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");

  useEffect(() => {
    void fetch("/api/fragrances")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setFragrances(data as FragranceRow[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const fragranceA = fragrances.find((f) => f.id === idA) ?? null;
  const fragranceB = fragrances.find((f) => f.id === idB) ?? null;
  const analysis: LayeringAnalysis | null =
    fragranceA && fragranceB ? analyzeLayering(fragranceA, fragranceB) : null;

  const harmonyStyle = analysis ? HARMONY_STYLES[analysis.harmony] : null;

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
          href="/wardrobe"
          className="text-sm text-[var(--muted)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text)]"
        >
          Wardrobe →
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-medium text-[var(--text)]">
          Fragrance Layering
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick two fragrances to see how they work together.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading collection…</p>
      ) : fragrances.length < 2 ? (
        <p className="text-sm text-[var(--muted)]">
          You need at least two fragrances in your collection to use this feature.{" "}
          <Link href="/" className="text-[var(--accent)] underline underline-offset-2">
            Add more
          </Link>
          .
        </p>
      ) : (
        <>
          {/* Picker */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            {[
              { label: "First fragrance", value: idA, onChange: setIdA, excludeId: idB },
              { label: "Second fragrance", value: idB, onChange: setIdB, excludeId: idA },
            ].map(({ label, value, onChange, excludeId }) => (
              <label key={label} className="block">
                <span className="mb-1.5 block text-xs text-[var(--muted)]">{label}</span>
                <select
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">Select a fragrance…</option>
                  {fragrances
                    .filter((f) => f.id !== excludeId)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} — {f.brand}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>

          {/* Analysis */}
          {analysis && harmonyStyle && fragranceA && fragranceB && (
            <div className="space-y-6">

              {/* Harmony */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--muted)]">Harmony</span>
                  <div className="flex items-center gap-2">
                    <HarmonyDots harmony={analysis.harmony} />
                    <span className={`text-sm font-medium ${harmonyStyle.color}`}>
                      {harmonyStyle.label}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-[var(--text)]">{analysis.harmonyReason}</p>
              </div>

              {/* Application tip */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="mb-1.5 text-xs text-[var(--muted)]">How to apply</p>
                <p className="text-sm text-[var(--text)]">{analysis.applicationTip}</p>
              </div>

              {/* Complementary pairs */}
              {analysis.complementaryPairs.length > 0 && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="mb-3 text-xs text-[var(--muted)]">Why they work</p>
                  <ul className="space-y-2">
                    {analysis.complementaryPairs.map((pair, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 shrink-0 text-[var(--accent)]">↔</span>
                        <span>
                          <span className="capitalize text-[var(--text)]">{pair.aTag}</span>
                          {" + "}
                          <span className="capitalize text-[var(--text)]">{pair.bTag}</span>
                          <span className="ml-1.5 text-[var(--muted)]">— {pair.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Notes breakdown */}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: `Both share`, notes: analysis.sharedNotes, accent: true },
                  { label: `${fragranceA.name} adds`, notes: analysis.uniqueToA, accent: false },
                  { label: `${fragranceB.name} adds`, notes: analysis.uniqueToB, accent: false },
                ].map(({ label, notes, accent }) => (
                  <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className={`mb-2.5 text-xs ${accent ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                      {label}
                    </p>
                    {notes.length === 0 ? (
                      <p className="text-xs text-[var(--muted)] italic">None detected</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {notes.map((n) => (
                          <NoteChip key={n} note={n} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
          )}

          {!analysis && idA && idB && (
            <p className="text-sm text-[var(--muted)]">Select two different fragrances to compare.</p>
          )}
        </>
      )}
    </main>
  );
}
