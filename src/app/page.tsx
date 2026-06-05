"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BottleThumb } from "@/components/BottleThumb";
import { CollectionTile } from "@/components/CollectionTile";
import { TAG_OPTIONS, type FragranceTag } from "@/lib/tag-options";
import { OCCASION_OPTIONS, type Occasion } from "@/lib/occasion-options";
import { SEASON_OPTIONS, type Season } from "@/lib/season-options";
import type { WeekDayPick, WeeklyPayload } from "@/app/api/weekly/route";

type FragranceRow = {
  id: string;
  name: string;
  brand: string;
  tags: string;
  occasions: string;
  notes: string;
  fragranticaUrl: string;
  imageUrl?: string;
  wearCount: number;
  recentWearCount: number;
  lastWornAt: string | null;
};

type FragranticaPreview = {
  name: string;
  brand: string;
  notes: string;
  tags: FragranceTag[];
  seasons: Season[];
  occasions: Occasion[];
  longevity: string;
  fragranticaUrl: string;
  imageUrl?: string;
};

type PickShape = {
  id: string;
  name: string;
  brand: string;
  tags: FragranceTag[];
  occasions: Occasion[];
  score: number;
  notes?: string;
  imageUrl: string;
  fragranticaUrl: string;
  longevity: string;
  wearStats: { lastWornAt: string | null; wearCount: number };
};

type TodayPayload =
  | {
      ok: true;
      location: { displayName: string; cityQuery: string };
      weather: {
        date: string;
        tempMaxC: number;
        tempMinC: number;
        tempMaxF: number;
        tempMinF: number;
        precipProbMax: number;
      };
      vibe: { label: string };
      selectedOccasion: Occasion | null;
      pick: PickShape | null;
      secondPick: PickShape | null;
      collectionCount: number;
    }
  | { ok: false; reason: string; message?: string };

// ── Pick cache ──────────────────────────────────────────────────────────────
// Keeps today's recommendation stable after wear is logged.
// Keyed by occasion so each occasion gets its own cached pick.
const PICK_CACHE_KEY = "frag-today-picks";
type PickCacheMap = Record<string, { date: string; payload: TodayPayload }>;

function loadPickCache(occasion: string | null): TodayPayload | null {
  try {
    const raw = localStorage.getItem(PICK_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as PickCacheMap;
    const item = map[occasion ?? "any"];
    if (!item) return null;
    const today = new Date().toISOString().slice(0, 10);
    return item.date === today ? item.payload : null;
  } catch { return null; }
}

function savePickCache(payload: TodayPayload, occasion: string | null) {
  try {
    const raw = localStorage.getItem(PICK_CACHE_KEY);
    const map: PickCacheMap = raw ? (JSON.parse(raw) as PickCacheMap) : {};
    const today = new Date().toISOString().slice(0, 10);
    for (const k of Object.keys(map)) { if (map[k].date !== today) delete map[k]; }
    map[occasion ?? "any"] = { date: today, payload };
    localStorage.setItem(PICK_CACHE_KEY, JSON.stringify(map));
  } catch {}
}

function clearPickCache() {
  try { localStorage.removeItem(PICK_CACHE_KEY); } catch {}
}

export default function Home() {
  const [fragrances, setFragrances] = useState<FragranceRow[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [savedCity, setSavedCity] = useState("");
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCity, setSavingCity] = useState(false);
  const [citySaveError, setCitySaveError] = useState<string | null>(null);
  const [todayOccasion, setTodayOccasion] = useState<Occasion | null>(null);

  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newTags, setNewTags] = useState<FragranceTag[]>([]);
  const [newOccasions, setNewOccasions] = useState<Occasion[]>([]);
  const [newSeasons, setNewSeasons] = useState<Season[]>([]);
  const [newLongevity, setNewLongevity] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newFragranticaUrl, setNewFragranticaUrl] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const [fcQuery, setFcQuery] = useState("");
  const [fcLoading, setFcLoading] = useState(false);
  const [fcError, setFcError] = useState<string | null>(null);
  const [fcResults, setFcResults] = useState<FragranticaPreview[]>([]);
  const [fcSearchSource, setFcSearchSource] = useState<"local" | "fragrantica" | null>(null);
  const [fcEnriching, setFcEnriching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [weekDays, setWeekDays] = useState<WeekDayPick[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [pickLogging, setPickLogging] = useState(false);
  const [pickLogged, setPickLogged] = useState(false);

  const catalogAbortRef = useRef<AbortController | null>(null);
  const catalogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadToday = useCallback(async (occasion: Occasion | null, forceNewPick = false) => {
    if (forceNewPick) clearPickCache();
    const cached = !forceNewPick ? loadPickCache(occasion) : null;
    if (cached) { setToday(cached); return; }
    const qs = occasion ? `?occasion=${occasion}` : "";
    const tRes = await fetch(`/api/today${qs}`);
    const tJson = (await tRes.json()) as TodayPayload;
    if (tJson && typeof tJson === "object" && "ok" in tJson) {
      if (tJson.ok && tJson.pick) savePickCache(tJson, occasion);
      setToday(tJson);
    } else {
      setToday({ ok: false, reason: "server_error", message: "Unexpected response from /api/today." });
    }
  }, []);

  const load = useCallback(async (occasion: Occasion | null = null, forceNewPick = false) => {
    setLoading(true);
    setLoadError(null);
    if (forceNewPick) clearPickCache();
    const cachedPick = !forceNewPick ? loadPickCache(occasion) : null;
    try {
      setWeekLoading(true);
      const qs = occasion ? `?occasion=${occasion}` : "";
      // Fire all four requests simultaneously — weather cache deduplicates the
      // Open-Meteo call so today + weekly share one network round-trip.
      const [fRes, sRes, wRes, tRes] = await Promise.all([
        fetch("/api/fragrances"),
        fetch("/api/settings"),
        fetch("/api/weekly"),
        fetch(`/api/today${qs}`),
      ]);
      const [fJson, sJson, wJson, tJson] = await Promise.all([
        fRes.json() as Promise<unknown>,
        sRes.json() as Promise<{ cityQuery?: string; displayName?: string }>,
        wRes.json() as Promise<WeeklyPayload>,
        tRes.json() as Promise<TodayPayload>,
      ]);
      setFragrances(Array.isArray(fJson) ? (fJson as FragranceRow[]) : []);
      setWeekDays(wJson.ok ? wJson.days : []);
      setWeekLoading(false);
      setCityQuery(typeof sJson.cityQuery === "string" ? sJson.cityQuery : "");
      setSavedCity(
        (typeof sJson.displayName === "string" ? sJson.displayName : "") ||
          (typeof sJson.cityQuery === "string" ? sJson.cityQuery : "")
      );
      const pickPayload = cachedPick ?? tJson;
      if (!cachedPick && tJson && typeof tJson === "object" && "ok" in tJson) {
        if (tJson.ok && tJson.pick) savePickCache(tJson, occasion);
      }
      if (pickPayload && typeof pickPayload === "object" && "ok" in pickPayload) {
        setToday(pickPayload);
      } else {
        setToday({ ok: false, reason: "server_error", message: "Unexpected response from /api/today." });
      }
      if (!fRes.ok && !Array.isArray(fJson)) {
        const err = fJson as { error?: string };
        setLoadError(typeof err.error === "string" ? err.error : "Could not load your collection.");
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Network error while loading.");
      setToday({ ok: false, reason: "server_error", message: "Could not reach the server." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    const q = fcQuery.trim();
    if (q.length < 1) {
      catalogAbortRef.current?.abort();
      if (catalogDebounceRef.current) {
        clearTimeout(catalogDebounceRef.current);
        catalogDebounceRef.current = null;
      }
      setFcResults([]);
      setFcLoading(false);
      setFcError(null);
      return;
    }

    if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current);

    catalogDebounceRef.current = setTimeout(() => {
      catalogDebounceRef.current = null;
      catalogAbortRef.current?.abort();
      const ac = new AbortController();
      catalogAbortRef.current = ac;
      setFcLoading(true);
      setFcError(null);
      setFcSearchSource(null);
      void (async () => {
        try {
          const res = await fetch(`/api/fragrances/search?q=${encodeURIComponent(q)}`, {
            signal: ac.signal,
          });
          const body = (await res.json()) as {
            results?: FragranticaPreview[];
            source?: "local" | "fragrantica";
            error?: string;
          };
          if (ac.signal.aborted) return;
          if (!res.ok) {
            setFcError(typeof body.error === "string" ? body.error : "Search failed.");
            setFcResults([]);
            return;
          }
          const list = Array.isArray(body.results) ? body.results : [];
          setFcResults(list);
          setFcSearchSource(body.source ?? null);
          setFcError(null);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") return;
          setFcError("Network error.");
          setFcResults([]);
        } finally {
          if (!ac.signal.aborted) setFcLoading(false);
        }
      })();
    }, 300);

    return () => {
      catalogAbortRef.current?.abort();
      if (catalogDebounceRef.current) {
        clearTimeout(catalogDebounceRef.current);
        catalogDebounceRef.current = null;
      }
    };
  }, [fcQuery]);

  async function saveCity(e: React.FormEvent) {
    e.preventDefault();
    setSavingCity(true);
    setCitySaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityQuery }),
      });
      const body = (await res.json()) as { error?: string; displayName?: string; cityQuery?: string };
      if (!res.ok) {
        setCitySaveError(typeof body.error === "string" ? body.error : "Could not save city.");
        return;
      }
      setSavedCity(body.displayName || body.cityQuery || "");
      const tRes = await fetch("/api/today");
      setToday((await tRes.json()) as TodayPayload);
    } finally {
      setSavingCity(false);
    }
  }

  function applyFragranticaPreview(p: FragranticaPreview) {
    setNewName(p.name);
    setNewBrand(p.brand);
    setNewNotes(p.notes);
    setNewTags(p.tags);
    setNewSeasons(p.seasons ?? []);
    setNewOccasions(p.occasions ?? []);
    setNewLongevity(p.longevity ?? "");
    setNewFragranticaUrl(p.fragranticaUrl);
    setNewImageUrl(p.imageUrl?.trim() ?? "");
    setFcResults([]);
    setFcSearchSource(null);
    setFcError(null);
    setShowModal(true);

    // If this is a sparse search result (no notes/tags yet), fetch full details in background
    if (!p.notes && p.fragranticaUrl) {
      setFcEnriching(true);
      void fetch("/api/fragrances/fragrantica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: p.fragranticaUrl }),
      })
        .then((r) => r.json())
        .then((body: { results?: FragranticaPreview[] }) => {
          const full = body.results?.[0];
          if (full) {
            setNewNotes(full.notes);
            setNewTags(full.tags);
            setNewSeasons(full.seasons ?? []);
            setNewOccasions(full.occasions ?? []);
            setNewLongevity(full.longevity ?? "");
            if (full.imageUrl) setNewImageUrl(full.imageUrl);
          }
        })
        .catch(() => {})
        .finally(() => setFcEnriching(false));
    }
  }

  async function addFragrance(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newBrand.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/fragrances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          brand: newBrand.trim(),
          tags: newTags,
          occasions: newOccasions,
          seasons: newSeasons,
          longevity: newLongevity,
          notes: newNotes,
          fragranticaUrl: newFragranticaUrl.trim(),
          imageUrl: newImageUrl.trim(),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAddError(typeof body.error === "string" ? body.error : "Could not add fragrance.");
        return;
      }
      setNewName("");
      setNewBrand("");
      setNewTags([]);
      setNewOccasions([]);
      setNewSeasons([]);
      setNewLongevity("");
      setNewNotes("");
      setNewFragranticaUrl("");
      setNewImageUrl("");
      setShowModal(false);
      await load(todayOccasion);
    } catch {
      setAddError("Network error. Try again.");
    } finally {
      setAdding(false);
    }
  }

  async function removeFragrance(id: string) {
    await fetch(`/api/fragrances/${id}`, { method: "DELETE" });
    await load(todayOccasion);
  }

  async function logWear(id: string) {
    await fetch(`/api/fragrances/${id}/wear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occasion: todayOccasion ?? "" }),
    });
    // Only refresh the collection list — don't re-rank today's pick,
    // since the worn fragrance would get a recency penalty and flip to something else.
    const fRes = await fetch("/api/fragrances");
    const fJson = (await fRes.json()) as unknown;
    setFragrances(Array.isArray(fJson) ? (fJson as FragranceRow[]) : []);
  }

  async function logPickWear(id: string) {
    setPickLogging(true);
    await logWear(id);
    setPickLogged(true);
    setPickLogging(false);
    setTimeout(() => setPickLogged(false), 3000);
  }

  async function selectOccasion(o: Occasion | null) {
    setTodayOccasion(o);
    setLoading(true);
    try {
      await loadToday(o);
    } finally {
      setLoading(false);
    }
  }

  function toggleNewTag(t: FragranceTag) {
    setNewTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function toggleNewOccasion(o: Occasion) {
    setNewOccasions((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  }

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

  const Spinner = () => (
    <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );

  return (
    <div className="relative z-10 flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">

      {/* ══ LEFT HALF — two equal quarters stacked ══ */}
      <div className="flex flex-col border-b border-[var(--border)] lg:w-1/2 lg:border-b-0 lg:border-r lg:overflow-hidden">

        {/* ── TOP QUARTER: Today ── */}
        <section className="flex flex-1 flex-col overflow-hidden border-b border-[var(--border)] p-5 lg:p-6">
          {/* Section header */}
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
            <div>
              <h1 className="font-[family-name:var(--font-fraunces)] text-lg font-medium text-[var(--text)]">
                Fragrance Wardrobe
              </h1>
              <h2 className="text-xs text-[var(--accent)]">Today&apos;s pick</h2>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/wardrobe"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)]">
                Wardrobe
              </Link>
              <Link href="/history"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)]">
                History
              </Link>
              <button type="button" onClick={() => setShowModal(true)}
                className="rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/20">
                + Add
              </button>
              <button type="button" onClick={() => setShowCityModal(true)}
                title={`City: ${savedCity || "not set"}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)]">
                {savedCity ? `📍 ${savedCity}` : "📍 Set city"}
              </button>
              <button type="button" onClick={() => void load(todayOccasion, true)} disabled={loading}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)] disabled:opacity-50">
                {loading ? "…" : "↻"}
              </button>
            </div>
          </div>

          {loadError ? (
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-950/25 px-3 py-2 text-xs text-amber-100/95" role="alert">
              <span className="truncate">{loadError}</span>
              <button type="button" onClick={() => void load(todayOccasion)} className="shrink-0 rounded-md bg-amber-200/15 px-2 py-0.5 hover:bg-amber-200/25">Retry</button>
            </div>
          ) : null}

          {/* Occasion chips */}
          <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
            {OCCASION_OPTIONS.map((o) => (
              <button key={o} type="button" onClick={() => void selectOccasion(todayOccasion === o ? null : o)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${todayOccasion === o ? "bg-[var(--accent)] text-[var(--bg)]" : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"}`}>
                {o}
              </button>
            ))}
          </div>

          {/* Pick */}
          <div className="min-h-0 flex-1">
            {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
            {!loading && today?.ok === false && (
              <p className="text-sm text-amber-200/90">{today.message ?? "Could not load today."}</p>
            )}
            {!loading && today?.ok === true && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--muted)]">
                  <span className="text-[var(--text)]">{today.location.displayName || "Your area"}</span>
                  {" · "}Hi {today.weather.tempMaxF}°F · rain {today.weather.precipProbMax}%
                </p>
                {today.collectionCount === 0 && <p className="text-xs text-[var(--muted)]">Add a fragrance to get a pick.</p>}
                {today.collectionCount > 0 && !today.pick && <p className="text-xs text-[var(--muted)]">No match — try refreshing.</p>}
                {today.collectionCount > 0 && today.pick && (
                  <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)]/50 p-3">
                    <BottleThumb src={today.pick.imageUrl} label={today.pick.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-[var(--text)]">{today.pick.name}</p>
                      <p className="text-sm text-[var(--muted)]">{today.pick.brand}</p>
                      <p className="mt-1 text-xs text-[var(--accent)]">{today.vibe.label}</p>
                      {today.pick.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {today.pick.tags.slice(0, 4).map((t) => (
                            <span key={t} className="rounded-full bg-[var(--accent-soft)]/30 px-2 py-0.5 text-[10px] text-[var(--accent)]">{t}</span>
                          ))}
                        </div>
                      )}
                      {today.pick.longevity && (
                        <span className="mt-1 inline-block rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                          {today.pick.longevity} longevity
                        </span>
                      )}
                      {today.pick.fragranticaUrl && (
                        <a href={today.pick.fragranticaUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[var(--accent)] underline underline-offset-2">Fragrantica ↗</a>
                      )}
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => void logPickWear(today.pick!.id)}
                          disabled={pickLogging || pickLogged}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                            pickLogged
                              ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)]"
                          }`}
                        >
                          {pickLogging ? "Logging…" : pickLogged ? "✓ Logged" : "Wore this today"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {today.pick && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void load(todayOccasion, true)}
                      disabled={loading}
                      className="mt-1 text-[10px] text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-40 transition-colors"
                    >
                      Not that one →
                    </button>
                  </div>
                )}
                {today.secondPick && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs text-[var(--muted)]">Short longevity — consider also for later:</p>
                    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)]/50 bg-[var(--surface)]/30 p-2.5">
                      <BottleThumb src={today.secondPick.imageUrl} label={today.secondPick.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">{today.secondPick.name}</p>
                        <p className="truncate text-xs text-[var(--muted)]">{today.secondPick.brand}</p>
                        {today.secondPick.fragranticaUrl && (
                          <a href={today.secondPick.fragranticaUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[var(--accent)] underline underline-offset-2">Fragrantica ↗</a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── BOTTOM QUARTER: This Week ── */}
        <section className="flex flex-1 flex-col overflow-hidden p-5 lg:p-6">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h2 className="font-[family-name:var(--font-fraunces)] text-base text-[var(--text)]">This Week</h2>
            <Link href="/weekly" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">See full view →</Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {weekLoading && <p className="text-xs text-[var(--muted)]">Loading…</p>}
            {!weekLoading && weekDays.length === 0 && (
              <p className="text-xs text-[var(--muted)]">Set your city to see weekly picks.</p>
            )}
            {!weekLoading && weekDays.length > 0 && (
              <ul className="space-y-1.5">
                {weekDays.filter((day) => day.date !== new Date().toISOString().slice(0, 10)).map((day) => {
                  const d = new Date(day.date + "T12:00:00");
                  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                  const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <li key={day.date}
                      className="flex items-center gap-2.5 rounded-xl border border-[var(--border)]/60 bg-[var(--bg)]/40 px-2.5 py-2">
                      <div className="w-10 shrink-0 text-center">
                        <p className="text-[11px] font-semibold text-[var(--text)]">{dayName}</p>
                        <p className="text-[10px] text-[var(--muted)]">{dateLabel}</p>
                      </div>
                      <span className="text-lg shrink-0">{weatherEmoji(day.weather.weatherCode, day.weather.precipProbMax)}</span>
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">{day.weather.tempMaxF}°</span>
                      {day.pick ? (
                        <>
                          <BottleThumb src={day.pick.imageUrl} label={day.pick.name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-[var(--text)]">{day.pick.name}</span>
                            <span className="block truncate text-[10px] text-[var(--muted)]">{day.pick.brand}</span>
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">No pick</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ══ RIGHT HALF: Collection ══ */}
      <div className="flex flex-1 flex-col overflow-hidden p-5 lg:w-1/2 lg:p-6">

        {/* ── Favorites lately ── */}
        {(() => {
          const favorites = fragrances
            .filter(f => f.recentWearCount > 4)
            .sort((a, b) => b.recentWearCount - a.recentWearCount)
            .slice(0, 6);
          if (favorites.length === 0) return null;
          return (
            <div className="mb-5 shrink-0">
              <h2 className="mb-2.5 font-[family-name:var(--font-fraunces)] text-base text-[var(--text)]">
                Favorites lately
              </h2>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {favorites.map(f => (
                  <Link key={f.id} href={`/collection/${f.id}`}
                    className="group shrink-0 flex flex-col items-center gap-1 rounded-xl border border-[var(--border)]/60 bg-[var(--surface)]/50 px-2.5 py-2.5 hover:border-[var(--accent)]/60 transition-colors">
                    <BottleThumb src={f.imageUrl ?? ""} label={f.name} size="sm" />
                    <span className="max-w-[64px] truncate text-center text-[10px] text-[var(--muted)] group-hover:text-[var(--text)]">{f.name}</span>
                    <span className="rounded-full bg-[var(--accent-soft)]/25 px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent)]">{f.recentWearCount}×</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        <h2 className="mb-4 shrink-0 font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">
          Collection <span className="text-[var(--muted)]">({fragrances.length})</span>
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {fragrances.length === 0 && (
            <p className="text-[var(--muted)]">Nothing here yet — search on the left to add your first bottle.</p>
          )}
          {fragrances.length > 0 && (
            <div className="grid auto-rows-fr gap-2 pb-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
              {fragrances.map((f) => (
                <CollectionTile key={f.id} id={f.id} imageSrc={f.imageUrl ?? ""}
                  ariaLabel={`Open details: ${f.name} by ${f.brand}`}
                  wearCount={f.wearCount ?? 0} lastWornAt={f.lastWornAt ?? null}
                  onRemove={() => void removeFragrance(f.id)}
                  onWoreToday={() => void logWear(f.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ CITY MODAL ══ */}
      {showCityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCityModal(false); }}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">Your city</h2>
              <button type="button" onClick={() => setShowCityModal(false)} className="rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">
              Used for weather-based picks via{" "}
              <a href="https://open-meteo.com/" className="text-[var(--accent)] underline underline-offset-2">Open-Meteo</a>.
              Currently: <span className="text-[var(--text)]">{savedCity || "not set"}</span>
            </p>
            <form onSubmit={async (e) => { await saveCity(e); if (!citySaveError) setShowCityModal(false); }} className="flex gap-2">
              <input value={cityQuery} onChange={(e) => { setCityQuery(e.target.value); setCitySaveError(null); }}
                placeholder="e.g. Austin, TX or London, UK"
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
              <button type="submit" disabled={savingCity}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50">
                {savingCity ? "…" : "Save"}
              </button>
            </form>
            {citySaveError ? <p className="mt-2 text-xs text-amber-200/90" role="alert">{citySaveError}</p> : null}
          </div>
        </div>
      )}

      {/* ══ ADD FORM MODAL ══ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !fcEnriching) setShowModal(false); }}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">Add to collection</h2>
              <button type="button" onClick={() => setShowModal(false)} disabled={fcEnriching} className="rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40">✕</button>
            </div>

            {/* Search */}
            <div className="mb-4 flex flex-col gap-2">
              <input value={fcQuery} onChange={(e) => setFcQuery(e.target.value)}
                placeholder="Search Fragrantica — e.g. Sauvage, Chanel No.5"
                autoComplete="off"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
              {fcLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Spinner /> Searching…</div>
              )}
              {fcError ? <p className="text-xs text-amber-200/90">{fcError}</p> : null}
              {fcResults.length > 0 && (
                <ul className="space-y-1" role="listbox">
                  {fcResults.map((r, i) => (
                    <li key={`${r.fragranticaUrl}-${i}`}>
                      <button type="button" onClick={() => applyFragranticaPreview(r)}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)]/70 bg-[var(--bg)]/60 px-2.5 py-2 text-left text-sm hover:border-[var(--accent)]/80">
                        <BottleThumb src={r.imageUrl ?? ""} label={r.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[var(--text)]">{r.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">{r.brand}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {newImageUrl.trim() ? (
              <div className="mb-4 flex items-center gap-4 rounded-2xl border border-[var(--border)]/60 p-3">
                <BottleThumb src={newImageUrl} label={newName || "Preview"} size="md" />
                <div>
                  <p className="font-medium text-[var(--text)]">{newName}</p>
                  <p className="text-sm text-[var(--muted)]">{newBrand}</p>
                </div>
              </div>
            ) : null}
            <form onSubmit={addFragrance} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
                <input required value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="Brand / house"
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
              </div>
              {fcEnriching && (
                <div className="flex items-center gap-3 rounded-xl border border-[var(--accent-soft)]/40 bg-[var(--accent-soft)]/10 px-4 py-3 text-sm text-[var(--accent)]">
                  <Spinner />
                  Fetching scent details — tags, seasons &amp; occasions will fill in shortly…
                </div>
              )}
              <div className={fcEnriching ? "pointer-events-none opacity-50" : ""}>
                <p className="mb-2 text-sm text-[var(--muted)]">Scent tags</p>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((t) => { const on = newTags.includes(t); return (
                    <button key={t} type="button" onClick={() => toggleNewTag(t)}
                      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${on ? "bg-[var(--accent)] text-[var(--bg)]" : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"}`}>
                      {t}
                    </button>
                  ); })}
                </div>
              </div>
              <div className={fcEnriching ? "pointer-events-none opacity-50" : ""}>
                <p className="mb-2 text-sm text-[var(--muted)]">Occasions</p>
                <div className="flex flex-wrap gap-2">
                  {OCCASION_OPTIONS.map((o) => { const on = newOccasions.includes(o); return (
                    <button key={o} type="button" onClick={() => toggleNewOccasion(o)}
                      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${on ? "bg-[var(--accent)] text-[var(--bg)]" : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"}`}>
                      {o}
                    </button>
                  ); })}
                </div>
              </div>
              <div className={fcEnriching ? "pointer-events-none opacity-50" : ""}>
                <p className="mb-2 text-sm text-[var(--muted)]">Seasons</p>
                <div className="flex flex-wrap gap-2">
                  {SEASON_OPTIONS.map((s) => { const on = newSeasons.includes(s); return (
                    <button key={s} type="button" onClick={() => setNewSeasons((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${on ? "bg-[var(--accent)] text-[var(--bg)]" : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"}`}>
                      {s}
                    </button>
                  ); })}
                </div>
              </div>
              {newFragranticaUrl ? (
                <p className="text-xs text-[var(--muted)]">Linked: <a href={newFragranticaUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline underline-offset-2">Fragrantica ↗</a></p>
              ) : null}
              {addError ? <p className="text-sm text-amber-200/90" role="alert">{addError}</p> : null}
              <div className="flex gap-3">
                <button type="submit" disabled={adding || fcEnriching}
                  className="flex-1 rounded-xl border border-[var(--good)]/50 bg-[var(--good)]/20 px-5 py-3 font-medium text-[var(--good)] hover:bg-[var(--good)]/30 disabled:opacity-50">
                  {adding ? "Adding…" : fcEnriching ? "Fetching details…" : "Add to collection"}
                </button>
                <button type="button" onClick={() => setShowModal(false)} disabled={adding || fcEnriching}
                  className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
