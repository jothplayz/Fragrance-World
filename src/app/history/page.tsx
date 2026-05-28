"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { safeImageSrc } from "@/lib/safe-image-src";
import type { HistoryPayload, WearEntry } from "@/app/api/history/route";
import { OCCASION_OPTIONS, type Occasion } from "@/lib/occasion-options";

type FragranceRow = { id: string; name: string; brand: string; imageUrl: string };

function isoToLocalDate(iso: string): string {
  // wornAt from server is UTC; display in local time
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function isoToLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function monthLabel(yyyy: number, mm: number) {
  return new Date(yyyy, mm - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function daysInMonth(yyyy: number, mm: number) {
  return new Date(yyyy, mm, 0).getDate();
}

function firstDayOfWeek(yyyy: number, mm: number) {
  return new Date(yyyy, mm - 1, 1).getDay(); // 0=Sun
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(yyyy: number, mm: number, d: number) {
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function MiniBottle({ src, label }: { src: string; label: string }) {
  const safe = safeImageSrc(src);
  const [failed, setFailed] = useState(false);
  if (!safe || failed) {
    return <div className="h-7 w-5 rounded bg-[var(--surface)] flex items-center justify-center text-[8px] text-[var(--muted)]">?</div>;
  }
  return (
    <div className="relative h-7 w-5 shrink-0">
      <Image src={safe} alt={label} fill sizes="20px" className="object-contain object-bottom" onError={() => setFailed(true)} />
    </div>
  );
}

export default function HistoryPage() {
  const today = todayStr();
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(nowYear);
  const [month, setMonth] = useState(nowMonth);
  const [days, setDays] = useState<Record<string, WearEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  // Log-past-wear state
  const [fragrances, setFragrances] = useState<FragranceRow[]>([]);
  const [logging, setLogging] = useState(false);
  const [logFragId, setLogFragId] = useState("");
  const [logOccasion, setLogOccasion] = useState<Occasion | "">("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const monthStr = `${y}-${String(m).padStart(2, "0")}`;
    const res = await fetch(`/api/history?month=${monthStr}`);
    const data = (await res.json()) as HistoryPayload;
    setDays(data.ok ? data.days : {});
    setLoading(false);
  }, []);

  useEffect(() => { void load(year, month); }, [load, year, month]);

  useEffect(() => {
    void fetch("/api/fragrances")
      .then((r) => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setFragrances(d as FragranceRow[]); });
  }, []);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  async function logPastWear(date: string) {
    if (!logFragId) return;
    setLogging(true);
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragranceId: logFragId, date, occasion: logOccasion }),
    });
    setLogFragId("");
    setLogOccasion("");
    setLogging(false);
    await load(year, month);
  }

  async function deleteEntry(logId: string) {
    setDeleting(logId);
    await fetch(`/api/history?logId=${encodeURIComponent(logId)}`, { method: "DELETE" });
    setDeleting(null);
    await load(year, month);
  }

  const firstDow = firstDayOfWeek(year, month);
  const numDays = daysInMonth(year, month);
  const isCurrentMonth = year === nowYear && month === nowMonth;
  const todayDay = isCurrentMonth ? new Date().getDate() : -1;

  const selectedEntries = selectedDate ? (days[selectedDate] ?? []) : [];
  const selectedIsFuture = selectedDate ? selectedDate > today : false;

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Nav */}
      <nav className="mb-8 flex items-center justify-between border-b border-[var(--border)] pb-6">
        <Link href="/" className="text-sm text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--accent)]">
          ← Home
        </Link>
        <Link href="/wardrobe" className="text-sm text-[var(--muted)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text)]">
          Wardrobe →
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-medium text-[var(--text)]">Wear History</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Every bottle you&apos;ve reached for.</p>
      </header>

      {/* Month navigation */}
      <div className="mb-4 flex items-center gap-4">
        <button onClick={prevMonth} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]">←</button>
        <span className="flex-1 text-center font-[family-name:var(--font-fraunces)] text-lg text-[var(--text)]">{monthLabel(year, month)}</span>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30">→</button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        {/* Day-of-week headers */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted)]">Loading…</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {/* Leading empty cells */}
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}

            {/* Day cells */}
            {Array.from({ length: numDays }, (_, i) => i + 1).map((d) => {
              const dk = dateKey(year, month, d);
              const entries = days[dk] ?? [];
              const isToday = d === todayDay;
              const isSelected = dk === selectedDate;
              const isFuture = dk > today;
              const hasWear = entries.length > 0;

              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(dk === selectedDate ? null : dk)}
                  disabled={isFuture}
                  className={[
                    "relative flex min-h-[56px] flex-col items-center rounded-xl border p-1 pt-1.5 text-[11px] transition-colors",
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : hasWear
                        ? "border-[var(--border)] bg-[var(--bg)]/60 hover:border-[var(--accent-soft)]"
                        : "border-transparent bg-[var(--bg)]/20 hover:border-[var(--border)]",
                    isFuture && "cursor-default opacity-25",
                    isToday && !isSelected && "border-[var(--accent)]/40",
                  ].filter(Boolean).join(" ")}
                >
                  <span className={[
                    "mb-1 font-medium leading-none",
                    isToday ? "text-[var(--accent)]" : "text-[var(--text)]",
                  ].join(" ")}>{d}</span>

                  {/* Bottle thumbnails */}
                  <div className="flex flex-wrap justify-center gap-0.5">
                    {entries.slice(0, 3).map(e => (
                      <MiniBottle key={e.logId} src={e.fragrance.imageUrl} label={e.fragrance.name} />
                    ))}
                    {entries.length > 3 && (
                      <span className="text-[9px] text-[var(--muted)]">+{entries.length - 3}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected date panel */}
      {selectedDate && !selectedIsFuture && (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-lg text-[var(--text)]">
            {isoToLocalDate(selectedDate + "T12:00:00")}
          </h2>

          {/* Logged entries */}
          {selectedEntries.length === 0 ? (
            <p className="mb-4 text-sm text-[var(--muted)]">Nothing logged for this day.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {selectedEntries.map(e => (
                <li key={e.logId} className="flex items-center gap-3 rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/50 p-3">
                  <div className="relative h-12 w-8 shrink-0">
                    {safeImageSrc(e.fragrance.imageUrl) ? (
                      <Image src={safeImageSrc(e.fragrance.imageUrl)} alt={e.fragrance.name} fill sizes="32px" className="object-contain object-bottom" />
                    ) : (
                      <div className="h-full w-full rounded bg-[var(--surface)] flex items-center justify-center text-xs text-[var(--muted)]">?</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/collection/${e.fragrance.id}`} className="block truncate text-sm font-medium text-[var(--text)] hover:text-[var(--accent)]">
                      {e.fragrance.name}
                    </Link>
                    <p className="truncate text-xs text-[var(--muted)]">{e.fragrance.brand}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {e.occasion && (
                        <span className="rounded-full bg-[var(--accent-soft)]/25 px-2 py-0.5 text-[10px] text-[var(--accent)]">{e.occasion}</span>
                      )}
                      <span className="text-[10px] text-[var(--muted)]">{isoToLocalTime(e.wornAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => void deleteEntry(e.logId)}
                    disabled={deleting === e.logId}
                    className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:border-red-500/50 hover:text-red-400 disabled:opacity-40"
                    title="Remove this log entry"
                  >
                    {deleting === e.logId ? "…" : "×"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Log a wear for this day */}
          <div className="border-t border-[var(--border)] pt-4">
            <p className="mb-2 text-xs text-[var(--muted)]">Log a wear for this day</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={logFragId}
                onChange={e => setLogFragId(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">Pick a fragrance…</option>
                {fragrances.map(f => (
                  <option key={f.id} value={f.id}>{f.name} — {f.brand}</option>
                ))}
              </select>
              <select
                value={logOccasion}
                onChange={e => setLogOccasion(e.target.value as Occasion | "")}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">No occasion</option>
                {OCCASION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <button
                onClick={() => void logPastWear(selectedDate)}
                disabled={!logFragId || logging}
                className="rounded-xl border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-40"
              >
                {logging ? "Saving…" : "Log wear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly summary strip */}
      {!loading && Object.keys(days).length > 0 && (
        <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-base text-[var(--text)]">This month</h2>
          <div className="flex flex-wrap gap-3">
            {Object.values(days).flat().reduce<Map<string, { fragrance: WearEntry["fragrance"]; count: number }>>((acc, e) => {
              const existing = acc.get(e.fragrance.id);
              if (existing) existing.count++;
              else acc.set(e.fragrance.id, { fragrance: e.fragrance, count: 1 });
              return acc;
            }, new Map()).entries().toArray().sort((a, b) => b[1].count - a[1].count).map(([, { fragrance, count }]) => (
              <Link key={fragrance.id} href={`/collection/${fragrance.id}`}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)]/70 bg-[var(--bg)]/50 px-3 py-2 hover:border-[var(--accent)]/60 transition-colors">
                <div className="relative h-8 w-6 shrink-0">
                  {safeImageSrc(fragrance.imageUrl) ? (
                    <Image src={safeImageSrc(fragrance.imageUrl)} alt={fragrance.name} fill sizes="24px" className="object-contain object-bottom" />
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--text)]">{fragrance.name}</p>
                  <p className="text-[10px] text-[var(--muted)]">{count}× this month</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
