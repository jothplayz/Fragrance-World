import { NextResponse } from "next/server";
import { imageUrlFromFragranticaPerfumeUrl } from "@/lib/apify-fragrantica";
import { enrichFragranceRecord } from "@/lib/enrich-fragrance";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/request-json";
import { TAG_OPTIONS } from "@/lib/tag-options";
import { SEASON_OPTIONS } from "@/lib/season-options";
import { OCCASION_OPTIONS } from "@/lib/occasion-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const row = await prisma.fragrance.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...row,
      imageUrl: row.imageUrl?.trim() || imageUrlFromFragranticaPerfumeUrl(row.fragranticaUrl),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeTags(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const ok = input.filter(
    (t): t is string => typeof t === "string" && TAG_OPTIONS.includes(t as (typeof TAG_OPTIONS)[number])
  );
  return JSON.stringify(ok);
}

function normalizeSeasons(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const ok = input.filter(
    (t): t is string => typeof t === "string" && SEASON_OPTIONS.includes(t as (typeof SEASON_OPTIONS)[number])
  );
  return JSON.stringify(ok);
}

function normalizeOccasions(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const ok = input.filter(
    (t): t is string => typeof t === "string" && OCCASION_OPTIONS.includes(t as (typeof OCCASION_OPTIONS)[number])
  );
  return JSON.stringify(ok);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const parsed = await readJsonBody<{
    name?: string;
    brand?: string;
    tags?: unknown;
    seasons?: unknown;
    occasions?: unknown;
    notes?: string;
    fragranticaUrl?: string;
    imageUrl?: string;
  }>(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const body = parsed.data;

  const { id } = await ctx.params;

  try {
    const existing = await prisma.fragrance.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const row = await prisma.fragrance.update({
      where: { id },
      data: {
        ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
        ...(typeof body.brand === "string" ? { brand: body.brand.trim() } : {}),
        ...(body.tags !== undefined ? { tags: normalizeTags(body.tags) } : {}),
        ...(body.seasons !== undefined ? { seasons: normalizeSeasons(body.seasons) } : {}),
        ...(body.occasions !== undefined ? { occasions: normalizeOccasions(body.occasions) } : {}),
        ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
        ...(typeof body.fragranticaUrl === "string" ? { fragranticaUrl: body.fragranticaUrl.trim() } : {}),
        ...(typeof body.imageUrl === "string" ? { imageUrl: body.imageUrl.trim() } : {}),
      },
    });

    const urlChanged =
      typeof body.fragranticaUrl === "string" &&
      body.fragranticaUrl.trim() !== existing.fragranticaUrl.trim();
    const nameChanged = typeof body.name === "string" && body.name.trim() !== existing.name;
    const brandChanged = typeof body.brand === "string" && body.brand.trim() !== existing.brand;
    if (urlChanged || nameChanged || brandChanged) {
      void enrichFragranceRecord(id, { force: true }).catch(() => {});
    }

    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.fragrance.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
