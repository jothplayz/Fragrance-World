import { NextResponse } from "next/server";
import { normalizeFragranticaUrl, type FragranticaPreview } from "@/lib/apify-fragrantica";
import { scrapeFragranticaUrl } from "@/lib/scrape-fragrantica-local";
import { readJsonBody } from "@/lib/request-json";
import { prisma } from "@/lib/db";
import { parseTagsFromJson } from "@/lib/tag-options";
import { parseSeasonsFromJson } from "@/lib/season-options";
import { parseOccasionsFromJson } from "@/lib/occasion-options";
import { inferOccasions } from "@/lib/infer-occasions";
import { inferTagsFromNotes } from "@/lib/infer-tags";
import { imageUrlFromFragranticaPerfumeUrl } from "@/lib/apify-fragrantica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function catalogToPreview(row: {
  name: string;
  brand: string;
  notes: string;
  tags: string;
  seasons: string;
  fragranticaUrl: string;
  imageUrl: string;
}): FragranticaPreview {
  const imageUrl = row.imageUrl?.trim() || imageUrlFromFragranticaPerfumeUrl(row.fragranticaUrl);
  const stored = parseTagsFromJson(row.tags);
  // Backfill tags for cache entries saved before tag inference was added
  const tags = stored.length > 0 ? stored : inferTagsFromNotes(row.notes);
  const seasons = parseSeasonsFromJson(row.seasons);
  return {
    name: row.name,
    brand: row.brand,
    notes: row.notes,
    tags,
    seasons,
    occasions: inferOccasions(tags, seasons, row.notes),
    fragranticaUrl: row.fragranticaUrl,
    imageUrl,
  };
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<{ url?: string }>(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const urlRaw = typeof parsed.data.url === "string" ? parsed.data.url.trim() : "";
  if (!urlRaw) {
    return NextResponse.json({ error: "Provide a Fragrantica perfume URL." }, { status: 400 });
  }

  let canonical: string;
  try {
    canonical = normalizeFragranticaUrl(urlRaw);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "NOT_FRAGRANTICA") {
      return NextResponse.json(
        { error: "URL must be a Fragrantica perfume page (fragrantica.com)." },
        { status: 400 }
      );
    }
    if (code === "NOT_PERFUME_URL") {
      return NextResponse.json(
        { error: "Use a perfume page URL like …/perfume/Brand/Name-12345.html" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  // Check catalog cache before hitting Playwright
  const cached = await prisma.fragranceCatalog.findUnique({
    where: { fragranticaUrl: canonical },
  }).catch(() => null);

  if (cached) {
    const preview = catalogToPreview(cached);
    // Backfill tags in DB if the cached entry pre-dates tag inference
    if (parseTagsFromJson(cached.tags).length === 0 && preview.tags.length > 0) {
      prisma.fragranceCatalog.update({
        where: { fragranticaUrl: canonical },
        data: { tags: JSON.stringify(preview.tags) },
      }).catch(() => {});
    }
    return NextResponse.json({ results: [preview], cached: true });
  }

  try {
    const preview = await scrapeFragranticaUrl(canonical);

    // Save to catalog for future lookups
    await prisma.fragranceCatalog.upsert({
      where: { fragranticaUrl: canonical },
      create: {
        name: preview.name,
        brand: preview.brand,
        notes: preview.notes,
        tags: JSON.stringify(preview.tags),
        seasons: JSON.stringify(preview.seasons),
        fragranticaUrl: canonical,
        imageUrl: preview.imageUrl,
      },
      update: {
        name: preview.name,
        brand: preview.brand,
        notes: preview.notes,
        tags: JSON.stringify(preview.tags),
        seasons: JSON.stringify(preview.seasons),
        imageUrl: preview.imageUrl,
      },
    }).catch(() => { /* non-fatal */ });

    return NextResponse.json({ results: [preview] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";

    if (msg.startsWith("CLOUDFLARE_BLOCKED")) {
      return NextResponse.json(
        { error: msg.replace("CLOUDFLARE_BLOCKED: ", "") },
        { status: 503 }
      );
    }
    if (msg.startsWith("PLAYWRIGHT_NOT_INSTALLED")) {
      return NextResponse.json(
        { error: "Browser not installed. Run: npx playwright install chromium" },
        { status: 503 }
      );
    }
    if (msg === "SCRAPE_FAILED_MISSING_NAME_OR_BRAND") {
      return NextResponse.json(
        { error: "Could not read fragrance name/brand from the page. Make sure it's a valid perfume URL." },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
