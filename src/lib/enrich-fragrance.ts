import type { FragranticaPreview } from "@/lib/apify-fragrantica";
import { normalizeFragranticaUrl } from "@/lib/apify-fragrantica";
import { fetchFragranticaPreviewForUrl } from "@/lib/apify-fragrantica-run";
import { prisma } from "@/lib/db";
import { fetchWikipediaSnippetForFragrance } from "@/lib/wikipedia-perfume";

export type EnrichmentSource = {
  type: "fragrantica" | "wikipedia";
  url?: string;
  title?: string;
};

export type EnrichmentPayload = {
  updatedAt: string;
  sources: EnrichmentSource[];
  bodyText: string;
};

const EMPTY: EnrichmentPayload = {
  updatedAt: "",
  sources: [],
  bodyText: "",
};

export function parseEnrichmentJson(raw: string | null | undefined): EnrichmentPayload {
  if (!raw?.trim()) return { ...EMPTY };
  try {
    const o = JSON.parse(raw) as Partial<EnrichmentPayload>;
    if (typeof o !== "object" || o === null) return { ...EMPTY };
    const bodyText = typeof o.bodyText === "string" ? o.bodyText : "";
    const sources = Array.isArray(o.sources)
      ? o.sources.filter(
          (s): s is EnrichmentSource =>
            Boolean(s) &&
            typeof s === "object" &&
            (s.type === "fragrantica" || s.type === "wikipedia")
        )
      : [];
    const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : "";
    return { bodyText, sources, updatedAt };
  } catch {
    return { ...EMPTY };
  }
}

/** Text passed to `parseFragranceDescription`: enrichment first, then user notes. */
export function buildTextForFragranceParsing(notes: string, enrichmentJson: string): string {
  const e = parseEnrichmentJson(enrichmentJson);
  const parts = [e.bodyText.trim(), notes.trim()].filter(Boolean);
  return parts.join("\n\n");
}

/** Enough combined text for panels to parse meaningfully. */
export function hasEnoughCopyForParsing(notes: string, enrichmentJson: string, minLen = 80): boolean {
  return buildTextForFragranceParsing(notes, enrichmentJson).trim().length >= minLen;
}

function substantialEnrichment(p: EnrichmentPayload): boolean {
  return p.bodyText.trim().length >= 120;
}

function hasFragranticaSource(p: EnrichmentPayload): boolean {
  return p.sources.some((s) => s.type === "fragrantica");
}

function hasWikipediaSource(p: EnrichmentPayload): boolean {
  return p.sources.some((s) => s.type === "wikipedia");
}

export type EnrichOptions = {
  force?: boolean;
  /**
   * Skip Apify / Fragrantica (can take minutes). Use for fast paths: SSR detail page, POST response.
   */
  wikipediaOnly?: boolean;
};

/**
 * Fetches Fragrantica (Apify, when `APIFY_TOKEN` + URL) and/or Wikipedia into `enrichmentJson`.
 * Does not overwrite user `notes`; merge at read time via `buildTextForFragranceParsing`.
 */
export async function enrichFragranceRecord(id: string, options: EnrichOptions = {}): Promise<void> {
  const { force = false, wikipediaOnly = false } = options;

  const row = await prisma.fragrance.findUnique({ where: { id } });
  if (!row) return;

  const existing = parseEnrichmentJson(row.enrichmentJson);
  const url = row.fragranticaUrl?.trim();

  if (wikipediaOnly) {
    if (!force && hasEnoughCopyForParsing(row.notes, row.enrichmentJson)) {
      return;
    }
    if (!force && hasWikipediaSource(existing)) {
      return;
    }

    let wikiExtract: string | null = null;
    let wikiMeta: { title: string; url: string } | null = null;
    try {
      const wiki = await fetchWikipediaSnippetForFragrance(row.brand, row.name);
      if (wiki?.extract) {
        wikiExtract = wiki.extract;
        wikiMeta = { title: wiki.title, url: wiki.url };
      }
    } catch {
      /* network */
    }

    if (!wikiExtract) {
      return;
    }

    const bodyChunks = [existing.bodyText.trim(), wikiExtract.trim()].filter(Boolean);
    const sources: EnrichmentSource[] = [...existing.sources];
    if (wikiMeta && !sources.some((s) => s.type === "wikipedia")) {
      sources.push({ type: "wikipedia", url: wikiMeta.url, title: wikiMeta.title });
    }

    const payload: EnrichmentPayload = {
      updatedAt: new Date().toISOString(),
      sources,
      bodyText: bodyChunks.join("\n\n").trim(),
    };

    await prisma.fragrance.update({
      where: { id },
      data: { enrichmentJson: JSON.stringify(payload) },
    });
    return;
  }

  if (
    !force &&
    substantialEnrichment(existing) &&
    (!url || hasFragranticaSource(existing))
  ) {
    return;
  }

  const sources: EnrichmentSource[] = [];
  const bodyChunks: string[] = [];
  let fragranticaPreview: FragranticaPreview | null = null;

  if (url) {
    try {
      const canonical = normalizeFragranticaUrl(url);
      fragranticaPreview = await fetchFragranticaPreviewForUrl(canonical);
      if (fragranticaPreview?.notes?.trim()) {
        bodyChunks.push(fragranticaPreview.notes.trim());
        if (fragranticaPreview.fragranticaUrl) {
          sources.push({
            type: "fragrantica",
            url: fragranticaPreview.fragranticaUrl,
            title: `${fragranticaPreview.brand} ${fragranticaPreview.name}`,
          });
        }
      }
    } catch {
      /* Missing token, blocked run, or invalid URL */
    }
  }

  try {
    if (!hasWikipediaSource({ ...EMPTY, sources })) {
      const wiki = await fetchWikipediaSnippetForFragrance(row.brand, row.name);
      if (wiki?.extract) {
        bodyChunks.push(wiki.extract);
        sources.push({ type: "wikipedia", url: wiki.url, title: wiki.title });
      }
    }
  } catch {
    /* Network or rate limit */
  }

  const bodyText = bodyChunks.join("\n\n").trim();
  const keepPrevious = force && !bodyText && existing.bodyText.trim().length > 0;
  const payload: EnrichmentPayload = {
    updatedAt: new Date().toISOString(),
    sources: keepPrevious ? existing.sources : sources,
    bodyText: keepPrevious ? existing.bodyText : bodyText,
  };

  const updateData: { enrichmentJson: string; imageUrl?: string } = {
    enrichmentJson: JSON.stringify(payload),
  };

  if (!row.imageUrl?.trim() && fragranticaPreview?.imageUrl?.trim()) {
    updateData.imageUrl = fragranticaPreview.imageUrl.trim();
  }

  await prisma.fragrance.update({
    where: { id },
    data: updateData,
  });
}
