import { NextResponse } from "next/server";
import { imageUrlFromFragranticaPerfumeUrl } from "@/lib/apify-fragrantica";
import { enrichFragranceRecord } from "@/lib/enrich-fragrance";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/request-json";
import { TAG_OPTIONS } from "@/lib/tag-options";
import { OCCASION_OPTIONS } from "@/lib/occasion-options";
import { SEASON_OPTIONS } from "@/lib/season-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTags(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  return JSON.stringify(
    input.filter(
      (t): t is string => typeof t === "string" && TAG_OPTIONS.includes(t as (typeof TAG_OPTIONS)[number])
    )
  );
}

function normalizeOccasions(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  return JSON.stringify(
    input.filter(
      (t): t is string =>
        typeof t === "string" && (OCCASION_OPTIONS as readonly string[]).includes(t)
    )
  );
}

function normalizeSeasons(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  return JSON.stringify(
    input.filter(
      (t): t is string =>
        typeof t === "string" && (SEASON_OPTIONS as readonly string[]).includes(t)
    )
  );
}

export async function GET() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [raw, recentGroups] = await Promise.all([
      prisma.fragrance.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { wearLogs: true } },
          wearLogs: {
            orderBy: { wornAt: "desc" },
            take: 1,
            select: { wornAt: true },
          },
        },
      }),
      prisma.wearLog.groupBy({
        by: ["fragranceId"],
        where: { wornAt: { gte: sevenDaysAgo } },
        _count: { id: true },
      }),
    ]);

    const recentMap = new Map(recentGroups.map((r) => [r.fragranceId, r._count.id]));

    const list = raw.map((f) => ({
      ...f,
      imageUrl: f.imageUrl?.trim() || imageUrlFromFragranticaPerfumeUrl(f.fragranticaUrl),
      wearCount: f._count.wearLogs,
      recentWearCount: recentMap.get(f.id) ?? 0,
      lastWornAt: f.wearLogs[0]?.wornAt?.toISOString() ?? null,
      _count: undefined,
      wearLogs: undefined,
    }));

    return NextResponse.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<{
    name?: string;
    brand?: string;
    tags?: unknown;
    occasions?: unknown;
    seasons?: unknown;
    longevity?: string;
    notes?: string;
    fragranticaUrl?: string;
    imageUrl?: string;
  }>(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const body = parsed.data;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const brand = typeof body.brand === "string" ? body.brand.trim() : "";
  if (!name || !brand) {
    return NextResponse.json({ error: "Name and brand are required." }, { status: 400 });
  }

  const notes = typeof body.notes === "string" ? body.notes : "";
  const fragranticaUrl = typeof body.fragranticaUrl === "string" ? body.fragranticaUrl.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const longevity = typeof body.longevity === "string" && ["short", "moderate", "long"].includes(body.longevity)
    ? body.longevity : "";

  try {
    const row = await prisma.fragrance.create({
      data: {
        name,
        brand,
        tags: normalizeTags(body.tags),
        occasions: normalizeOccasions(body.occasions),
        seasons: normalizeSeasons(body.seasons),
        longevity,
        notes,
        fragranticaUrl,
        imageUrl,
      },
    });
    try {
      await enrichFragranceRecord(row.id, { wikipediaOnly: true });
    } catch {
      /* optional */
    }
    void enrichFragranceRecord(row.id).catch(() => {});
    const fresh = await prisma.fragrance.findUnique({ where: { id: row.id } });
    return NextResponse.json(fresh ?? row, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
