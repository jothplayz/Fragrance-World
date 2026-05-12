"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BottleThumb } from "@/components/BottleThumb";
import { CollectionTile } from "@/components/CollectionTile";
import { TAG_OPTIONS, type FragranceTag } from "@/lib/tag-options";
import { OCCASION_OPTIONS, type Occasion } from "@/lib/occasion-options";
import { SEASON_OPTIONS, type Season } from "@/lib/season-options";

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
  lastWornAt: string | null;
};

type FragranticaPreview = {
  name: string;
  brand: string;
  notes: string;
  tags: FragranceTag[];
  seasons: Season[];
  fragranticaUrl: string;
  imageUrl?: string;
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
      pick: {
        id: string;
        name: string;
        brand: string;
        tags: FragranceTag[];
        occasions: Occasion[];
        score: number;
        notes?: string;
        imageUrl: string;
        fragranticaUrl: string;
        wearStats: { lastWornAt: string | null; wearCount: number };
      } | null;
      collectionCount: number;
    }
  | { ok: false; reason: string; message?: string };

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
  const [newNotes, setNewNotes] = useState("");
  const [newFragranticaUrl, setNewFragranticaUrl] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const [addSource, setAddSource] = useState<"manual" | "fragrantica">("manual");
  const [fcMode, setFcMode] = useState<"url" | "search">("url");
  const [fcUrl, setFcUrl] = useState("");
  const [fcQuery, setFcQuery] = useState("");
  const [fcLoading, setFcLoading] = useState(false);
  const [fcError, setFcError] = useState<string | null>(null);
  const [fcResults, setFcResults] = useState<FragranticaPreview[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const catalogAbortRef = useRef<AbortController | null>(null);
  const catalogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadToday = useCallback(async (occasion: Occasion | null) => {
    const qs = occasion ? `?occasion=${occasion}` : "";
    const tRes = await fetch(`/api/today${qs}`);
    const tJson = (await tRes.json()) as TodayPayload;
    if (tJson && typeof tJson === "object" && "ok" in tJson) {
      setToday(tJson);
    } else {
      setToday({ ok: false, reason: "server_error", message: "Unexpected response from /api/today." });
    }
  }, []);

  const load = useCallback(async (occasion: Occasion | null = null) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [fRes, sRes] = await Promise.all([
        fetch("/api/fragrances"),
        fetch("/api/settings"),
      ]);
      const fJson = (await fRes.json()) as unknown;
      const sJson = (await sRes.json()) as { cityQuery?: string; displayName?: string };
      setFragrances(Array.isArray(fJson) ? (fJson as FragranceRow[]) : []);
      setCityQuery(typeof sJson.cityQuery === "string" ? sJson.cityQuery : "");
      setSavedCity(
        (typeof sJson.displayName === "string" ? sJson.displayName : "") ||
          (typeof sJson.cityQuery === "string" ? sJson.cityQuery : "")
      );
      await loadToday(occasion);
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
  }, [loadToday]);

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    if (addSource !== "fragrantica" || fcMode !== "search") {
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
      void (async () => {
        try {
          const res = await fetch(`/api/fragrances/catalog?q=${encodeURIComponent(q)}`, {
            signal: ac.signal,
          });
          const body = (await res.json()) as { results?: FragranticaPreview[]; error?: string };
          if (ac.signal.aborted) return;
          if (!res.ok) {
            setFcError(typeof body.error === "string" ? body.error : "Search failed.");
            setFcResults([]);
            return;
          }
          const list = Array.isArray(body.results) ? body.results : [];
          setFcResults(list);
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
  }, [fcQuery, fcMode, addSource]);

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
    setNewFragranticaUrl(p.fragranticaUrl);
    setNewImageUrl(p.imageUrl?.trim() ?? "");
    setFcResults([]);
    setFcError(null);
    setAddSource("manual");
  }

  async function fetchFragranticaFromUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!fcUrl.trim()) return;
    setFcLoading(true);
    setFcError(null);
    setFcResults([]);
    try {
      const res = await fetch("/api/fragrances/fragrantica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fcUrl.trim() }),
      });
      let body: { results?: FragranticaPreview[]; error?: string };
      try {
        body = (await res.json()) as { results?: FragranticaPreview[]; error?: string };
      } catch {
        setFcError(`Bad response (${res.status}). Is the dev server running?`);
        return;
      }
      if (!res.ok) {
        setFcError(typeof body.error === "string" ? body.error : "Could not fetch fragrance data.");
        return;
      }
      const list = Array.isArray(body.results) ? body.results : [];
      if (list.length === 0) {
        setFcError("No perfume data returned. Make sure it's a full perfume URL like …/perfume/Brand/Name-12345.html");
        return;
      }
      applyFragranticaPreview(list[0]!);
    } catch {
      setFcError("Network error while contacting the server.");
    } finally {
      setFcLoading(false);
    }
  }

  async function fetchCatalogSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = fcQuery.trim();
    if (!q) return;
    if (catalogDebounceRef.current) {
      clearTimeout(catalogDebounceRef.current);
      catalogDebounceRef.current = null;
    }
    catalogAbortRef.current?.abort();
    const ac = new AbortController();
    catalogAbortRef.current = ac;
    setFcLoading(true);
    setFcError(null);
    try {
      const res = await fetch(`/api/fragrances/catalog?q=${encodeURIComponent(q)}`, { signal: ac.signal });
      const body = (await res.json()) as { results?: FragranticaPreview[]; error?: string };
      if (ac.signal.aborted) return;
      if (!res.ok) {
        setFcError(typeof body.error === "string" ? body.error : "Search failed.");
        setFcResults([]);
        return;
      }
      const list = Array.isArray(body.results) ? body.results : [];
      setFcResults(list);
      setFcError(null);
      if (list.length === 0) {
        setFcError(
          "No matches in the local catalog. Run npm run db:seed (or add rows to data/catalog.seed.json and seed again)."
        );
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setFcError("Network error.");
      setFcResults([]);
    } finally {
      if (!ac.signal.aborted) setFcLoading(false);
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
      setNewNotes("");
      setNewFragranticaUrl("");
      setNewImageUrl("");
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
    // Refresh fragrances list + today pick
    const fRes = await fetch("/api/fragrances");
    const fJson = (await fRes.json()) as unknown;
    setFragrances(Array.isArray(fJson) ? (fJson as FragranceRow[]) : []);
    await loadToday(todayOccasion);
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

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {loadError ? (
        <div
          className="mb-8 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/95 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load(todayOccasion)}
            className="shrink-0 rounded-lg bg-amber-200/15 px-3 py-1.5 font-medium text-amber-100 hover:bg-amber-200/25"
          >
            Retry
          </button>
        </div>
      ) : null}
      <header className="mb-12 flex flex-col gap-4 border-b border-[var(--border)] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
        <p className="text-sm tracking-wide text-[var(--muted)]">
          Personal scent log ·{" "}
          <a
            href="#collection"
            className="text-[var(--accent)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--accent)]"
          >
            Collection
          </a>
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-fraunces)] text-4xl font-medium tracking-tight text-[var(--text)] sm:text-5xl">
          Fragrance Wardrobe
        </h1>
        <p className="mt-3 max-w-xl text-[var(--muted)]">
          Add what you own, tag the mood, set your city. Each day we pick one bottle from your collection that
          fits the forecast—no accounts, just your machine for now.
        </p>
        </div>
        <button
          type="button"
          onClick={() => void load(todayOccasion)}
          disabled={loading}
          className="self-start rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)] disabled:opacity-50 sm:self-auto"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--accent)]">Today</h2>
        </div>

        {/* Occasion picker */}
        <div className="mt-3 flex flex-wrap gap-2">
          {OCCASION_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => void selectOccasion(todayOccasion === o ? null : o)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                todayOccasion === o
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {loading && <p className="mt-4 text-[var(--muted)]">Loading…</p>}
        {!loading && today?.ok === false && today.reason === "no_location" && (
          <p className="mt-4 text-[var(--muted)]">{today.message}</p>
        )}
        {!loading && today?.ok === false && today.reason === "weather_error" && (
          <p className="mt-4 text-amber-200/90">{today.message}</p>
        )}
        {!loading && today?.ok === false && today.reason === "server_error" && (
          <p className="mt-4 text-amber-200/90" role="alert">
            {today.message ?? "Could not load today."}
          </p>
        )}
        {!loading && today?.ok === true && (
          <div className="mt-4 space-y-4">
            <p className="text-[var(--muted)]">
              <span className="text-[var(--text)]">{today.location.displayName || "Your area"}</span>
              {" · "}
              High {today.weather.tempMaxF}°F ({Math.round(today.weather.tempMaxC)}°C), low{" "}
              {today.weather.tempMinF}°F · rain chance {today.weather.precipProbMax}%
            </p>
            <p className="text-lg text-[var(--text)]">
              On a <em className="not-italic text-[var(--accent)]">{today.vibe.label}</em>, your best fit is:
            </p>
            {today.collectionCount === 0 && (
              <p className="text-[var(--muted)]">Add a fragrance below to get a daily pick.</p>
            )}
            {today.collectionCount > 0 && !today.pick && (
              <p className="text-[var(--muted)]">Could not pick a bottle—try refreshing or re-saving your city.</p>
            )}
            {today.collectionCount > 0 && today.pick && (
              <div className="flex flex-col items-center gap-5 rounded-2xl border border-[var(--border)]/70 bg-transparent p-5 sm:flex-row sm:items-center sm:gap-8">
                <BottleThumb src={today.pick.imageUrl} label={today.pick.name} size="lg" />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-xl font-medium text-[var(--text)]">
                    {today.pick.name}
                    <span className="font-normal text-[var(--muted)]"> · {today.pick.brand}</span>
                  </p>
                  {today.pick.tags.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Add mood tags to this bottle for sharper matching next time.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {today.pick.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-[var(--accent-soft)]/30 px-2 py-0.5 text-xs text-[var(--accent)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {today.pick.fragranticaUrl ? (
                    <a
                      href={today.pick.fragranticaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-2"
                    >
                      Open on Fragrantica
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">
          Your city
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We use{" "}
          <a
            href="https://open-meteo.com/"
            className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--accent)]"
          >
            Open-Meteo
          </a>{" "}
          (free, no API key). Saved as: {savedCity || "—"}
        </p>
        <form onSubmit={saveCity} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="sr-only">City</span>
            <input
              value={cityQuery}
              onChange={(e) => {
                setCityQuery(e.target.value);
                setCitySaveError(null);
              }}
              placeholder="e.g. Austin, TX or London, UK"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </label>
          <button
            type="submit"
            disabled={savingCity}
            className="rounded-xl bg-[var(--accent)] px-5 py-3 font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
          >
            {savingCity ? "Saving…" : "Save"}
          </button>
        </form>
        {citySaveError ? (
          <p className="mt-3 text-sm text-amber-200/90" role="alert">
            {citySaveError}
          </p>
        ) : null}
      </section>

      <section className="mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">
          Add a fragrance
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Paste a Fragrantica perfume URL to auto-fill details — uses a local browser, no API key needed.
          Or enter manually below.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setAddSource("manual");
              setFcError(null);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              addSource === "manual"
                ? "bg-[var(--accent)] text-[var(--bg)]"
                : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"
            }`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => {
              setAddSource("fragrantica");
              setFcError(null);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              addSource === "fragrantica"
                ? "bg-[var(--accent)] text-[var(--bg)]"
                : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"
            }`}
          >
            {"Catalog & Fragrantica"}
          </button>
        </div>

        {addSource === "fragrantica" && (
          <div className="mt-6 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setFcMode("url");
                  setFcError(null);
                  setFcResults([]);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  fcMode === "url"
                    ? "bg-[var(--accent-soft)]/40 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Perfume URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setFcMode("search");
                  setFcError(null);
                  setFcResults([]);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  fcMode === "search"
                    ? "bg-[var(--accent-soft)]/40 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Local search
              </button>
            </div>

            {fcMode === "url" ? (
              <form onSubmit={(e) => void fetchFragranticaFromUrl(e)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs text-[var(--muted)]">Fragrantica perfume page</span>
                  <input
                    value={fcUrl}
                    onChange={(e) => setFcUrl(e.target.value)}
                    placeholder="https://www.fragrantica.com/perfume/…"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={fcLoading}
                  className="rounded-xl bg-[var(--accent)] px-5 py-3 font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
                >
                  {fcLoading ? "Fetching…" : "Fetch & fill form"}
                </button>
              </form>
            ) : (
              <form onSubmit={(e) => void fetchCatalogSearch(e)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs text-[var(--muted)]">
                    Search local catalog — results update as you type
                  </span>
                  <input
                    value={fcQuery}
                    onChange={(e) => setFcQuery(e.target.value)}
                    placeholder="e.g. Sauvage, Chanel, Hermès"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-controls="catalog-search-results"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={fcLoading || !fcQuery.trim()}
                  className="rounded-xl bg-[var(--accent)] px-5 py-3 font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
                >
                  {fcLoading ? "Searching…" : "Search"}
                </button>
              </form>
            )}

            {fcError ? (
              <p className="text-sm text-amber-200/90" role="alert">
                {fcError}
              </p>
            ) : null}

            {fcMode === "search" && fcQuery.trim().length > 0 && !fcLoading && fcResults.length === 0 && !fcError ? (
              <p className="text-sm text-[var(--muted)]">No matches for that search.</p>
            ) : null}

            {fcResults.length > 0 && (
              <div id="catalog-search-results">
                <p className="mb-2 text-sm text-[var(--muted)]">Pick a result to fill the form:</p>
                <ul className="max-h-60 space-y-2 overflow-y-auto" role="listbox">
                  {fcResults.map((r, i) => (
                    <li key={`${r.fragranticaUrl}-${i}`}>
                      <button
                        type="button"
                        onClick={() => applyFragranticaPreview(r)}
                        className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/40 px-3 py-2.5 text-left text-sm backdrop-blur-[2px] hover:border-[var(--accent)]/80"
                      >
                        <BottleThumb src={r.imageUrl ?? ""} label={r.name} size="sm" />
                        <span>
                          <span className="font-medium text-[var(--text)]">{r.name}</span>
                          <span className="text-[var(--muted)]"> · {r.brand}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <form onSubmit={addFragrance} className="mt-4 space-y-4">
          {newImageUrl.trim() ? (
            <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)]/60 bg-transparent p-3">
              <BottleThumb src={newImageUrl} label={newName || "Preview"} size="md" />
              <p className="text-xs text-[var(--muted)]">Saved with the bottle.</p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <input
              required
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              placeholder="Brand / house"
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Scent tags</p>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((t) => {
                const on = newTags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleNewTag(t)}
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                      on
                        ? "bg-[var(--accent)] text-[var(--bg)]"
                        : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Occasions</p>
            <div className="flex flex-wrap gap-2">
              {OCCASION_OPTIONS.map((o) => {
                const on = newOccasions.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggleNewOccasion(o)}
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                      on
                        ? "bg-[var(--accent)] text-[var(--bg)]"
                        : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Seasons</p>
            <div className="flex flex-wrap gap-2">
              {SEASON_OPTIONS.map((s) => {
                const on = newSeasons.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setNewSeasons((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                      on
                        ? "bg-[var(--accent)] text-[var(--bg)]"
                        : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <textarea
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notes (batch code, pyramid text from Fragrantica, …)"
            rows={3}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          {newFragranticaUrl ? (
            <p className="text-xs text-[var(--muted)]">
              Linked:{" "}
              <a
                href={newFragranticaUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline underline-offset-2"
              >
                Fragrantica
              </a>
            </p>
          ) : null}
          {addError ? (
            <p className="text-sm text-amber-200/90" role="alert">
              {addError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={adding}
            className="rounded-xl border border-[var(--good)]/50 bg-[var(--good)]/20 px-5 py-3 font-medium text-[var(--good)] hover:bg-[var(--good)]/30 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to collection"}
          </button>
        </form>
      </section>

      <section
        id="collection"
        className="scroll-mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">
          Collection ({fragrances.length})
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Bottles only — click a tile for details and Fragrantica. Use × to remove.
        </p>
        {fragrances.length === 0 && (
          <p className="mt-4 text-[var(--muted)]">Nothing here yet—add your first bottle above.</p>
        )}
        {fragrances.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
            {fragrances.map((f) => (
              <CollectionTile
                key={f.id}
                id={f.id}
                imageSrc={f.imageUrl ?? ""}
                ariaLabel={`Open details: ${f.name} by ${f.brand}`}
                wearCount={f.wearCount ?? 0}
                lastWornAt={f.lastWornAt ?? null}
                onRemove={() => void removeFragrance(f.id)}
                onWoreToday={() => void logWear(f.id)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
