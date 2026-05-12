import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { imageUrlFromFragranticaPerfumeUrl, type FragranticaPreview } from "@/lib/apify-fragrantica";
import { prisma } from "@/lib/db";
import { parseTagsFromJson } from "@/lib/tag-options";
import { parseSeasonsFromJson } from "@/lib/season-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPreview(row: {
  name: string;
  brand: string;
  notes: string;
  tags: string;
  seasons: string;
  fragranticaUrl: string;
  imageUrl: string;
}): FragranticaPreview {
  const stored = row.imageUrl?.trim() ?? "";
  const imageUrl = stored || imageUrlFromFragranticaPerfumeUrl(row.fragranticaUrl);
  return {
    name: row.name,
    brand: row.brand,
    notes: row.notes,
    tags: parseTagsFromJson(row.tags),
    seasons: parseSeasonsFromJson(row.seasons ?? "[]"),
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
        notes: string;
        fragranticaUrl: string;
        imageUrl: string;
      }>
    >(Prisma.sql`
      SELECT "id", "name", "brand", "tags", "seasons", "notes", "fragranticaUrl", "imageUrl"
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
