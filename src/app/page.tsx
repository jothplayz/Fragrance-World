"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { safeImageSrc } from "@/lib/safe-image-src";
import { parseTagsFromJson, TAG_OPTIONS, type FragranceTag } from "@/lib/tag-options";

/** Portrait 3:4 slots like Fragrantica product cards: transparent fill, contain-fit bottle, soft inset hairline. */
function BottleThumb({
  src,
  label,
  size = "md",
}: {
  src: string;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const widthClass =
    size === "sm" ? "w-11 sm:w-12" : size === "lg" ? "w-[9rem] sm:w-44" : "w-[4.5rem] sm:w-[5.25rem]";
  const sizesAttr = size === "sm" ? "48px" : size === "lg" ? "(max-width:640px) 144px, 176px" : "84px";
  const safeSrc = safeImageSrc(src);

  useEffect(() => {
    setImgFailed(false);
  }, [safeSrc]);

  if (!safeSrc || imgFailed) {
    return (
      <div
        className={`relative flex aspect-[3/4] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-transparent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--text)_9%,transparent)] ${widthClass}`}
        aria-hidden
      >
        <span className="text-sm font-medium text-[var(--muted)]/75 sm:text-base">
          {label.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-[3/4] shrink-0 overflow-hidden rounded-2xl bg-transparent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--text)_9%,transparent)] ${widthClass}`}
    >
      <div className="absolute inset-2 sm:inset-2.5">
        <div className="relative h-full w-full">
          <Image
            src={safeSrc}
            alt={`${label} bottle`}
            fill
            sizes={sizesAttr}
            className="object-contain object-center [filter:drop-shadow(0_10px_22px_rgb(0_0_0/0.42))]"
            priority={size === "lg"}
            onError={() => setImgFailed(true)}
          />
        </div>
      </div>
    </div>
  );
}

type FragranceRow = {
  id: string;
  name: string;
  brand: string;
  tags: string;
  notes: string;
  fragranticaUrl: string;
  imageUrl?: string;
};

type FragranticaPreview = {
  name: string;
  brand: string;
  notes: string;
  tags: FragranceTag[];
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
      pick: {
        id: string;
        name: string;
        brand: string;
        tags: FragranceTag[];
        score: number;
        notes?: string;
        imageUrl: string;
        fragranticaUrl: string;
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

  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newTags, setNewTags] = useState<FragranceTag[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [fRes, sRes, tRes] = await Promise.all([
        fetch("/api/fragrances"),
        fetch("/api/settings"),
        fetch("/api/today"),
      ]);
      const fJson = (await fRes.json()) as unknown;
      const sJson = (await sRes.json()) as { cityQuery?: string; displayName?: string };
      const tJson = (await tRes.json()) as TodayPayload;
      setFragrances(Array.isArray(fJson) ? (fJson as FragranceRow[]) : []);
      setCityQuery(typeof sJson.cityQuery === "string" ? sJson.cityQuery : "");
      setSavedCity(
        (typeof sJson.displayName === "string" ? sJson.displayName : "") ||
          (typeof sJson.cityQuery === "string" ? sJson.cityQuery : "")
      );
      if (tJson && typeof tJson === "object" && "ok" in tJson) {
        setToday(tJson);
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
    void load();
  }, [load]);

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
        const hint =
          res.status === 503
            ? " Set APIFY_TOKEN in .env in the project folder and restart npm run dev."
            : res.status === 502
              ? " Apify run failed—check your token/credits. URL import retries once with Apify proxy by default; you can also set APIFY_USE_PROXY=true."
              : "";
        setFcError((typeof body.error === "string" ? body.error : "Could not fetch from Apify.") + hint);
        return;
      }
      const list = Array.isArray(body.results) ? body.results : [];
      if (list.length === 0) {
        setFcError(
          "No perfume data returned. Use a full perfume URL (…/perfume/Brand/Name-12345.html), check APIFY_TOKEN, or try local catalog search."
        );
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
    if (!fcQuery.trim()) return;
    setFcLoading(true);
    setFcError(null);
    setFcResults([]);
    try {
      const q = encodeURIComponent(fcQuery.trim());
      const res = await fetch(`/api/fragrances/catalog?q=${q}`);
      const body = (await res.json()) as { results?: FragranticaPreview[]; error?: string };
      if (!res.ok) {
        setFcError(typeof body.error === "string" ? body.error : "Search failed.");
        return;
      }
      const list = Array.isArray(body.results) ? body.results : [];
      if (list.length === 0) {
        setFcError(
          "No matches in the local catalog. Run npm run db:seed (or add rows to data/catalog.seed.json and seed again)."
        );
        return;
      }
      setFcResults(list);
    } finally {
      setFcLoading(false);
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
      setNewNotes("");
      setNewFragranticaUrl("");
      setNewImageUrl("");
      await load();
    } catch {
      setAddError("Network error. Try again.");
    } finally {
      setAdding(false);
    }
  }

  async function removeFragrance(id: string) {
    await fetch(`/api/fragrances/${id}`, { method: "DELETE" });
    await load();
  }

  function toggleNewTag(t: FragranceTag) {
    setNewTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
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
            onClick={() => void load()}
            className="shrink-0 rounded-lg bg-amber-200/15 px-3 py-1.5 font-medium text-amber-100 hover:bg-amber-200/25"
          >
            Retry
          </button>
        </div>
      ) : null}
      <header className="mb-12 flex flex-col gap-4 border-b border-[var(--border)] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
        <p className="text-sm tracking-wide text-[var(--muted)]">Personal scent log</p>
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl font-medium tracking-tight text-[var(--text)] sm:text-5xl">
          Fragrance Wardrobe
        </h1>
        <p className="mt-3 max-w-xl text-[var(--muted)]">
          Add what you own, tag the mood, set your city. Each day we pick one bottle from your collection that
          fits the forecast—no accounts, just your machine for now.
        </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="self-start rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)] disabled:opacity-50 sm:self-auto"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg shadow-black/20">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--accent)]">
          Today
        </h2>
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
          Search uses a <strong className="font-medium text-[var(--text)]">local catalog</strong> in your
          SQLite database (seeded from <code className="text-xs">data/catalog.seed.json</code> via{" "}
          <code className="text-xs">npm run db:seed</code>). Paste a Fragrantica perfume URL to fetch live
          details with Apify if <code className="text-xs">APIFY_TOKEN</code> is set.
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
                  <span className="mb-1 block text-xs text-[var(--muted)]">Search local catalog</span>
                  <input
                    value={fcQuery}
                    onChange={(e) => setFcQuery(e.target.value)}
                    placeholder="e.g. Sauvage, Chanel, Hermès"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={fcLoading}
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

            {fcResults.length > 0 && (
              <div>
                <p className="mb-2 text-sm text-[var(--muted)]">Pick a result to fill the form:</p>
                <ul className="max-h-60 space-y-2 overflow-y-auto">
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
            <p className="mb-2 text-sm text-[var(--muted)]">Mood tags</p>
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

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">
          Collection ({fragrances.length})
        </h2>
        {fragrances.length === 0 && (
          <p className="mt-4 text-[var(--muted)]">Nothing here yet—add your first bottle above.</p>
        )}
        <ul className="mt-4 space-y-3">
          {fragrances.map((f) => {
            const tags = parseTagsFromJson(f.tags);
            return (
              <li
                key={f.id}
                className="flex flex-col gap-3 rounded-xl border border-[var(--border)]/70 bg-transparent px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <BottleThumb src={f.imageUrl ?? ""} label={f.name} size="md" />
                  <div className="min-w-0">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-[var(--muted)]"> · {f.brand}</span>
                  {tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {f.notes ? <p className="mt-1 text-sm text-[var(--muted)]">{f.notes}</p> : null}
                  {f.fragranticaUrl ? (
                    <a
                      href={f.fragranticaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-[var(--accent)] underline underline-offset-2"
                    >
                      View on Fragrantica
                    </a>
                  ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeFragrance(f.id)}
                  className="self-start rounded-lg px-3 py-1.5 text-sm text-red-300/90 hover:bg-red-950/40 sm:self-center"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
