import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { imageUrlFromFragranticaPerfumeUrl, type FragranticaPreview } from "@/lib/apify-fragrantica";
import { prisma } from "@/lib/db";
import { parseTagsFromJson } from "@/lib/tag-options";
import { parseSeasonsFromJson } from "@/lib/season-options";
import { parseOccasionsFromJson } from "@/lib/occasion-options";
import { inferOccasions } from "@/lib/infer-occasions";
import { inferTagsFromNotes } from "@/lib/infer-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPreview(row: {
  name: string;
  brand: string;
  notes: string;
  tags: string;
  seasons: string;
  longevity: string;
  fragranticaUrl: string;
  imageUrl: string;
}): FragranticaPreview {
  const storedImage = row.imageUrl?.trim() ?? "";
  const imageUrl = storedImage || imageUrlFromFragranticaPerfumeUrl(row.fragranticaUrl);
  const storedTags = parseTagsFromJson(row.tags);
  const tags = storedTags.length > 0 ? storedTags : inferTagsFromNotes(row.notes);
  const seasons = parseSeasonsFromJson(row.seasons ?? "[]");
  return {
    name: row.name,
    brand: row.brand,
    notes: row.notes,
    tags,
    seasons,
    longevity: row.longevity ?? "",
    occasions: inferOccasions(tags, seasons, row.notes),
    fragranticaUrl: row.fragranticaUrl,
    imageUrl,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    const safe = q.replace(/[%_]/g, "");
    const pattern = `%${safe}%`;
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        brand: string;
        tags: string;
        seasons: string;
        longevity: string;
        notes: string;
        fragranticaUrl: string;
        imageUrl: string;
      }>
    >(Prisma.sql`
      SELECT "id", "name", "brand", "tags", "seasons", "longevity", "notes", "fragranticaUrl", "imageUrl"
      FROM "FragranceCatalog"
      WHERE "name" LIKE ${pattern} COLLATE NOCASE
         OR "brand" LIKE ${pattern} COLLATE NOCASE
      ORDER BY "brand" ASC, "name" ASC
      LIMIT 25
    `);
    const results = rows.map(toPreview);
    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message, results: [] }, { status: 500 });
  }
}
