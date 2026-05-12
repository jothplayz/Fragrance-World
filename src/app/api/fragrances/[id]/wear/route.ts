import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/request-json";
import { OCCASION_OPTIONS } from "@/lib/occasion-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsed = await readJsonBody<{ occasion?: string }>(request);

  const occasion =
    parsed.ok &&
    typeof parsed.data.occasion === "string" &&
    (OCCASION_OPTIONS as readonly string[]).includes(parsed.data.occasion)
      ? parsed.data.occasion
      : "";

  try {
    const fragrance = await prisma.fragrance.findUnique({ where: { id } });
    if (!fragrance) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const log = await prisma.wearLog.create({ data: { fragranceId: id, occasion } });
    return NextResponse.json(log, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  // Delete the most recent wear log for this fragrance (undo last wear)
  const { id } = await ctx.params;
  try {
    const latest = await prisma.wearLog.findFirst({
      where: { fragranceId: id },
      orderBy: { wornAt: "desc" },
    });
    if (!latest) return NextResponse.json({ error: "No wear log found" }, { status: 404 });
    await prisma.wearLog.delete({ where: { id: latest.id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
