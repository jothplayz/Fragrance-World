import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseTagsFromJson } from "@/lib/tag-options";
import { parseSeasonsFromJson } from "@/lib/season-options";
import { inferOccasions } from "@/lib/infer-occasions";
import { inferTagsFromNotes } from "@/lib/infer-tags";
import { imageUrlFromFragranticaPerfumeUrl, normalizeFragranticaUrl, type FragranticaPreview } from "@/lib/apify-fragrantica";

type CatalogRow = {
  name: string;
  brand: string;
  notes: string;
  tags: string;
  seasons: string;
  longevity: string;
  fragranticaUrl: string;
  imageUrl: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SearchResult = {
  name: string;
  brand: string;
  url: string;
  img: string;
};

async function searchFragranticaByName(query: string): Promise<SearchResult[]> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("PLAYWRIGHT_NOT_INSTALLED");
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const searchUrl = `https://www.fragrantica.com/search/?query=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(5000);

    const results = await page.evaluate((): SearchResult[] => {
      const cards = document.querySelectorAll(".prefumeHbox");
      return Array.from(cards).slice(0, 12).map((card) => {
        const img = card.querySelector("img");
        const link = card.closest("a") ?? card.querySelector("a");
        return {
          name: img?.alt?.replace(/^perfume\s*/i, "").trim() ?? "",
          brand: "",
          url: (link as HTMLAnchorElement | null)?.href ?? "",
          img: img?.src ?? "",
        };
      }).filter((r) => r.name && r.url);
    });

    // Fill brand from URL path e.g. /perfume/Dior/Sauvage-31861.html → "Dior"
    return results.map((r) => ({
      ...r,
      brand: new URL(r.url).pathname.split("/")[2]?.replace(/-/g, " ") ?? "",
    }));
  } finally {
    await browser.close();
  }
}

function catalogRowToPreview(row: CatalogRow): FragranticaPreview {
  const storedTags = parseTagsFromJson(row.tags);
  const tags = storedTags.length > 0 ? storedTags : inferTagsFromNotes(row.notes);
  const seasons = parseSeasonsFromJson(row.seasons ?? "[]");
  return {
    name: row.name, brand: row.brand, notes: row.notes, tags, seasons,
    longevity: row.longevity ?? "",
    occasions: inferOccasions(tags, seasons, row.notes),
    fragranticaUrl: row.fragranticaUrl,
    imageUrl: row.imageUrl?.trim() || imageUrlFromFragranticaPerfumeUrl(row.fragranticaUrl),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [], source: "local" });

  // 1. Local catalog first (instant)
  const safe = q.replace(/[%_]/g, "");
  const pattern = `%${safe}%`;
  const localRows = await prisma.$queryRaw<CatalogRow[]>(Prisma.sql`
    SELECT "name", "brand", "notes", "tags", "seasons", "longevity", "fragranticaUrl", "imageUrl"
    FROM "FragranceCatalog"
    WHERE "name" LIKE ${pattern} COLLATE NOCASE
       OR "brand" LIKE ${pattern} COLLATE NOCASE
    ORDER BY "brand" ASC, "name" ASC
    LIMIT 10
  `).catch(() => [] as CatalogRow[]);


  if (localRows.length > 0) {
    return NextResponse.json({
      results: localRows.map(catalogRowToPreview),
      source: "local",
    });
  }

  // 2. Fragrantica search via Playwright
  try {
    const searchResults = await searchFragranticaByName(q);
    if (searchResults.length === 0) {
      return NextResponse.json({ results: [], source: "fragrantica" });
    }

    // Map search cards to lightweight previews (no full scrape yet)
    const previews: FragranticaPreview[] = searchResults.map((r) => {
      let canonical = "";
      try { canonical = normalizeFragranticaUrl(r.url); } catch { canonical = r.url; }
      const thumbId = r.img.match(/[\d]{4,6}(?=\.)/)?.[0];
      const imageUrl = thumbId
        ? `https://fimgs.net/mdimg/perfume-thumbs/375x500.${thumbId}.jpg`
        : r.img;
      return {
        name: r.name, brand: r.brand, notes: "", tags: [], seasons: [], occasions: [], longevity: "",
        fragranticaUrl: canonical, imageUrl,
      };
    });

    return NextResponse.json({ results: previews, source: "fragrantica" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ error: msg, results: [], source: "fragrantica" }, { status: 502 });
  }
}
