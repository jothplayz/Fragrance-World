import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/request-json";
import { TAG_OPTIONS } from "@/lib/tag-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTags(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const ok = input.filter(
    (t): t is string => typeof t === "string" && TAG_OPTIONS.includes(t as (typeof TAG_OPTIONS)[number])
  );
  return JSON.stringify(ok);
}

export async function GET() {
  try {
    const list = await prisma.fragrance.findMany({ orderBy: { createdAt: "desc" } });
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
    notes?: string;
    fragranticaUrl?: string;
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

  try {
    const row = await prisma.fragrance.create({
      data: {
        name,
        brand,
        tags: normalizeTags(body.tags),
        notes,
        fragranticaUrl,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
