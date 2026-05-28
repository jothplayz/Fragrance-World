import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { imageUrlFromFragranticaPerfumeUrl } from "@/lib/apify-fragrantica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type WearEntry = {
  logId: string;
  wornAt: string;
  occasion: string;
  fragrance: {
    id: string;
    name: string;
    brand: string;
    imageUrl: string;
    fragranticaUrl: string;
  };
};

export type HistoryPayload =
  | { ok: true; month: string; days: Record<string, WearEntry[]> }
  | { ok: false; error: string };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("month") ?? "";

  // Default to current month if not provided or invalid
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  const now = new Date();
  const year = match ? parseInt(match[1]) : now.getFullYear();
  const month = match ? parseInt(match[2]) : now.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // exclusive

  try {
    const logs = await prisma.wearLog.findMany({
      where: { wornAt: { gte: start, lt: end } },
      orderBy: { wornAt: "asc" },
      include: {
        fragrance: {
          select: { id: true, name: true, brand: true, imageUrl: true, fragranticaUrl: true },
        },
      },
    });

    const days: Record<string, WearEntry[]> = {};
    for (const log of logs) {
      const dateKey = log.wornAt.toISOString().slice(0, 10);
      if (!days[dateKey]) days[dateKey] = [];
      const imgUrl = log.fragrance.imageUrl?.trim() ||
        imageUrlFromFragranticaPerfumeUrl(log.fragrance.fragranticaUrl);
      days[dateKey].push({
        logId: log.id,
        wornAt: log.wornAt.toISOString(),
        occasion: log.occasion,
        fragrance: { ...log.fragrance, imageUrl: imgUrl },
      });
    }

    return NextResponse.json({ ok: true, month: monthStr, days } satisfies HistoryPayload);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ ok: false, error } satisfies HistoryPayload, { status: 500 });
  }
}

// POST: log a wear on a specific past date
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { fragranceId?: string; date?: string; occasion?: string };
    const { fragranceId, date, occasion = "" } = body;
    if (!fragranceId || !date) {
      return NextResponse.json({ error: "fragranceId and date required" }, { status: 400 });
    }

    // Parse YYYY-MM-DD, treat as local noon to avoid TZ edge cases
    const parsed = new Date(`${date}T12:00:00`);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const fragrance = await prisma.fragrance.findUnique({ where: { id: fragranceId } });
    if (!fragrance) return NextResponse.json({ error: "Fragrance not found" }, { status: 404 });

    const log = await prisma.wearLog.create({
      data: { fragranceId, wornAt: parsed, occasion },
    });
    return NextResponse.json(log, { status: 201 });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error }, { status: 500 });
  }
}

// DELETE: remove a specific wear log entry
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const logId = searchParams.get("logId");
    if (!logId) return NextResponse.json({ error: "logId required" }, { status: 400 });
    await prisma.wearLog.delete({ where: { id: logId } });
    return new Response(null, { status: 204 });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error }, { status: 500 });
  }
}
