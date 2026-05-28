"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { safeImageSrc } from "@/lib/safe-image-src";

function lastWornLabel(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

export function CollectionTile({
  id,
  imageSrc,
  ariaLabel,
  wearCount = 0,
  lastWornAt = null,
  onRemove,
  onWoreToday,
}: {
  id: string;
  imageSrc: string;
  ariaLabel: string;
  wearCount?: number;
  lastWornAt?: string | null;
  onRemove?: () => void;
  onWoreToday?: () => void | Promise<void>;
}) {
  const [failed, setFailed] = useState(false);
  const [logging, setLogging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const safe = safeImageSrc(imageSrc);

  useEffect(() => {
    setFailed(false);
  }, [safe]);

  async function handleWoreToday(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (logging) return;
    setLogging(true);
    try {
      await onWoreToday?.();
    } finally {
      setLogging(false);
    }
  }

  const wornLabel = lastWornLabel(lastWornAt);

  return (
    <div className="relative aspect-[3/4]">
      <Link
        href={`/collection/${id}`}
        aria-label={ariaLabel}
        className="group absolute inset-0 block overflow-hidden rounded-2xl bg-transparent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--text)_9%,transparent)] outline-none ring-[var(--accent)] transition-[box-shadow,transform] hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_35%,transparent),0_12px_40px_rgb(0_0_0/0.35)] focus-visible:ring-2 active:scale-[0.98]"
      >
        <div className="absolute inset-2 sm:inset-2.5">
          <div className="relative h-full w-full">
            {!safe || failed ? (
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-[var(--bg)]/50">
                <span className="text-2xl font-medium text-[var(--muted)]/40" aria-hidden>
                  ?
                </span>
              </div>
            ) : (
              <Image
                src={safe}
                alt=""
                fill
                sizes="(max-width:640px) 45vw, (max-width:1024px) 28vw, 120px"
                className="object-contain object-center [filter:drop-shadow(0_10px_22px_rgb(0_0_0/0.42))] transition-transform group-hover:scale-[1.02]"
                onError={() => setFailed(true)}
              />
            )}
          </div>
        </div>

        {/* Wear badge */}
        {(wearCount > 0 || wornLabel) && (
          <div className="absolute bottom-1.5 left-1.5 z-10 rounded-md bg-[var(--surface)]/90 px-1.5 py-0.5 text-[10px] text-[var(--muted)] backdrop-blur-sm">
            {wornLabel || `${wearCount}×`}
          </div>
        )}
      </Link>

      {/* Remove button — two-step confirm */}
      {onRemove ? (
        confirmRemove ? (
          <div className="absolute right-1 top-1 z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
              className="flex h-7 items-center rounded-lg border border-red-500/60 bg-red-950/80 px-2 text-xs font-medium text-red-300 shadow-md backdrop-blur-sm hover:bg-red-900/80"
              aria-label="Confirm remove"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmRemove(false); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 text-xs text-[var(--muted)] shadow-md backdrop-blur-sm hover:text-[var(--text)]"
              aria-label="Cancel remove"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmRemove(true); }}
            className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 text-sm text-red-300/95 shadow-md backdrop-blur-sm hover:bg-red-950/50"
            aria-label="Remove from collection"
          >
            ×
          </button>
        )
      ) : null}

      {/* Wore today button */}
      {onWoreToday ? (
        <button
          type="button"
          onClick={(e) => void handleWoreToday(e)}
          disabled={logging}
          className="absolute bottom-1 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 text-xs text-[var(--accent)] shadow-md backdrop-blur-sm hover:bg-[var(--accent)]/15 disabled:opacity-50"
          aria-label="Log wear for today"
          title="Wore this today"
        >
          {logging ? "…" : "✓"}
        </button>
      ) : null}
    </div>
  );
}
