import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/request-json";
import { geocodeCity } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureSettings() {
  const row = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (row) return row;
  return prisma.appSettings.create({
    data: { id: 1, cityQuery: "", displayName: "" },
  });
}

export async function GET() {
  try {
    const s = await ensureSettings();
    return NextResponse.json(s);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const parsed = await readJsonBody<{ cityQuery?: string }>(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const cityQuery = typeof parsed.data.cityQuery === "string" ? parsed.data.cityQuery : "";

  let geo: Awaited<ReturnType<typeof geocodeCity>>;
  try {
    geo = cityQuery.trim() ? await geocodeCity(cityQuery) : null;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Geocoding failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (cityQuery.trim() && !geo) {
    return NextResponse.json(
      {
        error:
          "Could not find that location. Try the city name, or “City, ST” with a US state code (e.g. Austin, TX).",
      },
      { status: 422 }
    );
  }

  try {
    const s = await prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        cityQuery,
        displayName: geo?.name ?? "",
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
      },
      update: {
        cityQuery,
        displayName: geo?.name ?? "",
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
      },
    });
    return NextResponse.json(s);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
