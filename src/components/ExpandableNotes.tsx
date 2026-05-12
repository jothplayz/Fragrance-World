"use client";

import { useState } from "react";
import { notesHaveExtraBeyondSummary, summarizeNotes } from "@/lib/summarize-notes";

export function ExpandableNotes({ full }: { full: string }) {
  const [showFull, setShowFull] = useState(false);
  const trimmed = full.trim();
  if (!trimmed) return null;

  const summary = summarizeNotes(full);
  const canExpand = notesHaveExtraBeyondSummary(full);

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">Notes</h2>
      <p className="mt-2 text-[var(--text)] leading-relaxed">
        {showFull || !canExpand ? (
          <span className="whitespace-pre-wrap">{full}</span>
        ) : (
          <span>{summary}</span>
        )}
      </p>
      {canExpand ? (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="mt-3 text-sm font-medium text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--accent)]"
        >
          {showFull ? "Show summary" : "Show full notes"}
        </button>
      ) : null}
    </section>
  );
}
