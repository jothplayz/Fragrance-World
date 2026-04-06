"use client";

import { useCallback, useEffect, useState } from "react";
import { TAG_OPTIONS, type FragranceTag } from "@/lib/tag-options";

type FragranceRow = {
  id: string;
  name: string;
  brand: string;
  tags: string;
  notes: string;
  fragranticaUrl: string;
};

type FragranticaPreview = {
  name: string;
  brand: string;
  notes: string;
  tags: FragranceTag[];
  fragranticaUrl: string;
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
      suggestions: Array<{
        id: string;
        name: string;
        brand: string;
        tags: FragranceTag[];
        score: number;
      }>;
      collectionCount: number;
    }
  | { ok: false; reason: string; message?: string };

function parseTags(json: string): FragranceTag[] {
  try {
    const a = JSON.parse(json) as unknown;
    if (!Array.isArray(a)) return [];
    return a.filter((t): t is FragranceTag =>
      typeof t === "string" && (TAG_OPTIONS as readonly string[]).includes(t)
    );
  } catch {
    return [];
  }
}

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
  const [adding, setAdding] = useState(false);

  const [addSource, setAddSource] = useState<"manual" | "fragrantica">("manual");
  const [fcMode, setFcMode] = useState<"url" | "search">("url");
  const [fcUrl, setFcUrl] = useState("");
  const [fcQuery, setFcQuery] = useState("");
  const [fcLoading, setFcLoading] = useState(false);
  const [fcError, setFcError] = useState<string | null>(null);
  const [fcResults, setFcResults] = useState<FragranticaPreview[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, sRes, tRes] = await Promise.all([
        fetch("/api/fragrances"),
        fetch("/api/settings"),
        fetch("/api/today"),
      ]);
      const fJson = (await fRes.json()) as FragranceRow[];
      const sJson = (await sRes.json()) as { cityQuery: string; displayName: string };
      const tJson = (await tRes.json()) as TodayPayload;
      setFragrances(Array.isArray(fJson) ? fJson : []);
      setCityQuery(sJson.cityQuery ?? "");
      setSavedCity(sJson.displayName || sJson.cityQuery || "");
      setToday(tJson);
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
      const body = (await res.json()) as { results?: FragranticaPreview[]; error?: string };
      if (!res.ok) {
        setFcError(typeof body.error === "string" ? body.error : "Could not fetch from Apify.");
        return;
      }
      const list = Array.isArray(body.results) ? body.results : [];
      if (list.length === 0) {
        setFcError("No perfume data returned. Check the URL or try search.");
        return;
      }
      applyFragranticaPreview(list[0]!);
    } finally {
      setFcLoading(false);
    }
  }

  async function fetchFragranticaSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!fcQuery.trim()) return;
    setFcLoading(true);
    setFcError(null);
    setFcResults([]);
    try {
      const res = await fetch("/api/fragrances/fragrantica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: fcQuery.trim() }),
      });
      const body = (await res.json()) as { results?: FragranticaPreview[]; error?: string };
      if (!res.ok) {
        setFcError(typeof body.error === "string" ? body.error : "Search failed.");
        return;
      }
      const list = Array.isArray(body.results) ? body.results : [];
      if (list.length === 0) {
        setFcError("No matches. Try another query.");
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
    try {
      await fetch("/api/fragrances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          brand: newBrand.trim(),
          tags: newTags,
          notes: newNotes,
          fragranticaUrl: newFragranticaUrl.trim(),
        }),
      });
      setNewName("");
      setNewBrand("");
      setNewTags([]);
      setNewNotes("");
      setNewFragranticaUrl("");
      await load();
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
    <div className="relative z-10 mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-12 border-b border-[var(--border)] pb-8">
        <p className="text-sm tracking-wide text-[var(--muted)]">Personal scent log</p>
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl font-medium tracking-tight text-[var(--text)] sm:text-5xl">
          Fragrance Wardrobe
        </h1>
        <p className="mt-3 max-w-xl text-[var(--muted)]">
          Add what you own, tag the mood, set your city. Each day we match your collection to the
          forecast—no accounts, just your machine for now.
        </p>
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
        {!loading && today?.ok === true && (
          <div className="mt-4 space-y-4">
            <p className="text-[var(--muted)]">
              <span className="text-[var(--text)]">{today.location.displayName || "Your area"}</span>
              {" · "}
              High {today.weather.tempMaxF}°F ({Math.round(today.weather.tempMaxC)}°C), low{" "}
              {today.weather.tempMinF}°F · rain chance {today.weather.precipProbMax}%
            </p>
            <p className="text-lg text-[var(--text)]">
              For a <em className="not-italic text-[var(--accent)]">{today.vibe.label}</em>, consider:
            </p>
            {today.collectionCount === 0 && (
              <p className="text-[var(--muted)]">Add a fragrance below to get picks.</p>
            )}
            {today.collectionCount > 0 && today.suggestions.length === 0 && (
              <p className="text-[var(--muted)]">Add mood tags to your bottles for better matches.</p>
            )}
            <ul className="space-y-3">
              {today.suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 px-4 py-3"
                >
                  <div>
                    <span className="font-medium text-[var(--text)]">{s.name}</span>
                    <span className="text-[var(--muted)]"> · {s.brand}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[var(--accent-soft)]/30 px-2 py-0.5 text-xs text-[var(--accent)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
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
          Enter a bottle by hand, or pull structured data from Fragrantica using an{" "}
          <a
            href="https://apify.com/lexis-solutions/fragrantica"
            className="underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--accent)]"
          >
            Apify actor
          </a>{" "}
          (<code className="text-xs text-[var(--text)]">APIFY_TOKEN</code> in{" "}
          <code className="text-xs text-[var(--text)]">.env</code>).
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
            Fragrantica (Apify)
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
                Search
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
              <form onSubmit={(e) => void fetchFragranticaSearch(e)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs text-[var(--muted)]">Search Fragrantica</span>
                  <input
                    value={fcQuery}
                    onChange={(e) => setFcQuery(e.target.value)}
                    placeholder="e.g. Sauvage Dior"
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
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm hover:border-[var(--accent)]"
                      >
                        <span className="font-medium text-[var(--text)]">{r.name}</span>
                        <span className="text-[var(--muted)]"> · {r.brand}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <form onSubmit={addFragrance} className="mt-4 space-y-4">
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
            const tags = parseTags(f.tags);
            return (
              <li
                key={f.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)]/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
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
    </div>
  );
}
