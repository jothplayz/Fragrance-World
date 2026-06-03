"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TAG_OPTIONS, type FragranceTag } from "@/lib/tag-options";
import { SEASON_OPTIONS, type Season } from "@/lib/season-options";
import { OCCASION_OPTIONS, type Occasion } from "@/lib/occasion-options";

type Props = {
  id: string;
  initial: {
    name: string;
    brand: string;
    tags: FragranceTag[];
    seasons: Season[];
    occasions: Occasion[];
    notes: string;
    fragranticaUrl: string;
    imageUrl: string;
  };
  onSaved?: () => void;
};

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--accent)] text-[var(--bg)]"
          : "border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--accent-soft)]"
      }`}
    >
      {children}
    </button>
  );
}

export function EditFragranceModal({ id, initial, onSaved }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand);
  const [tags, setTags] = useState<FragranceTag[]>(initial.tags);
  const [seasons, setSeasons] = useState<Season[]>(initial.seasons);
  const [occasions, setOccasions] = useState<Occasion[]>(initial.occasions);
  const [fragranticaUrl, setFragranticaUrl] = useState(initial.fragranticaUrl);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  function reset() {
    setName(initial.name);
    setBrand(initial.brand);
    setTags(initial.tags);
    setSeasons(initial.seasons);
    setOccasions(initial.occasions);
    setFragranticaUrl(initial.fragranticaUrl);
    setImageUrl(initial.imageUrl);
    setError(null);
  }

  function openModal() {
    reset();
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !brand.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/fragrances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), brand: brand.trim(), tags, seasons, occasions, fragranticaUrl: fragranticaUrl.trim(), imageUrl: imageUrl.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not save.");
        return;
      }
      setOpen(false);
      router.refresh();
      onSaved?.();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent-soft)] hover:text-[var(--text)] transition-colors"
      >
        Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-[var(--text)]">Edit fragrance</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void save(e)} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--muted)]">Name</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--muted)]">Brand / house</label>
                  <input
                    required
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs text-[var(--muted)]">Scent tags</p>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((t) => (
                    <Toggle key={t} active={tags.includes(t)} onClick={() => setTags(toggle(tags, t))}>
                      {t}
                    </Toggle>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs text-[var(--muted)]">Seasons</p>
                <div className="flex flex-wrap gap-2">
                  {SEASON_OPTIONS.map((s) => (
                    <Toggle key={s} active={seasons.includes(s)} onClick={() => setSeasons(toggle(seasons, s))}>
                      {s}
                    </Toggle>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs text-[var(--muted)]">Occasions</p>
                <div className="flex flex-wrap gap-2">
                  {OCCASION_OPTIONS.map((o) => (
                    <Toggle key={o} active={occasions.includes(o)} onClick={() => setOccasions(toggle(occasions, o))}>
                      {o}
                    </Toggle>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--muted)]">Fragrantica URL</label>
                <input
                  type="url"
                  value={fragranticaUrl}
                  onChange={(e) => setFragranticaUrl(e.target.value)}
                  placeholder="https://www.fragrantica.com/perfume/..."
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--muted)]">Image URL</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              {error && (
                <p className="text-xs text-amber-200/90" role="alert">{error}</p>
              )}

              <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
