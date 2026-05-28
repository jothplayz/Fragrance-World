"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BottleThumb } from "@/components/BottleThumb";
import type { WeekDayPick, WeeklyPayload } from "@/app/api/weekly/route";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weatherEmoji(code: number, precip: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "⛅";
  if (code <= 3) return "☁️";
  if (code >= 51 && code <= 55) return "🌦️";
  if (code >= 61 && code <= 65) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95) return "⛈️";
  if (precip >= 50) return "🌧️";
  return "🌤️";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDayName(dateStr: string, full = false): string {
  const d = new Date(dateStr + "T12:00:00");
  return full ? FULL_DAY_NAMES[d.getDay()] : DAY_NAMES[d.getDay()];
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

export default function WeeklyPage() {
  const [payload, setPayload] = useState<WeeklyPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/weekly")
      .then((r) => r.json())
      .then((d) => setPayload(d as WeeklyPayload))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 lg:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] text-xl font-medium text-[var(--text)]">
            This Week
          </h1>
          {payload?.ok && payload.location && (
            <p className="text-xs text-[var(--muted)]">📍 {payload.location}</p>
          )}
        </div>
        <Link
          href="/"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)]"
        >
          ← Back
        </Link>
      </div>

      {/* Body */}
      <div className="flex-1 px-5 py-6 lg:px-8">
        {loading && (
          <p className="text-sm text-[var(--muted)]">Loading weekly picks…</p>
        )}

        {!loading && payload?.ok === false && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
            {payload.message}
          </div>
        )}

        {!loading && payload?.ok === true && (
          <>
            {payload.days.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No fragrances in your collection yet.</p>
            )}

            {/* Day cards — horizontal on desktop, vertical stack on mobile */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {payload.days.map((day) => (
                <DayCard key={day.date} day={day} />
              ))}
            </div>

            <p className="mt-6 text-xs text-[var(--muted)]">
              Picks are weather-matched and rotated so you wear different bottles each day.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function DayCard({ day }: { day: WeekDayPick }) {
  const today = isToday(day.date);

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors ${
        today
          ? "border-[var(--accent)]/60 bg-[var(--surface)]"
          : "border-[var(--border)] bg-[var(--surface)]/50"
      }`}
    >
      {/* Day header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-semibold ${today ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
            {getDayName(day.date, true)}
            {today && <span className="ml-1.5 text-[10px] font-normal opacity-70">Today</span>}
          </p>
          <p className="text-[11px] text-[var(--muted)]">{formatDate(day.date)}</p>
        </div>
        <span className="text-2xl" aria-hidden>
          {weatherEmoji(day.weather.weatherCode, day.weather.precipProbMax)}
        </span>
      </div>

      {/* Weather strip */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
        <span>{day.weather.tempMaxF}°F / {day.weather.tempMinF}°F</span>
        {day.weather.precipProbMax > 10 && (
          <span>🌂 {day.weather.precipProbMax}%</span>
        )}
        <span className="text-[var(--accent)]">{day.vibe}</span>
      </div>

      {/* Fragrance pick */}
      {day.pick ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/60 p-2.5">
          <BottleThumb src={day.pick.imageUrl} label={day.pick.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text)]">{day.pick.name}</p>
            <p className="truncate text-xs text-[var(--muted)]">{day.pick.brand}</p>
            {day.pick.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {day.pick.tags.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-full bg-[var(--accent-soft)]/30 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {day.pick.fragranticaUrl && (
              <a
                href={day.pick.fragranticaUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[10px] text-[var(--accent)] underline underline-offset-2"
              >
                Fragrantica ↗
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">No pick available</p>
      )}
    </div>
  );
}
