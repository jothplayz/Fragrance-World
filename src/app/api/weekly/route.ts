import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { imageUrlFromFragranticaPerfumeUrl } from "@/lib/apify-fragrantica";
import { humanVibeLabel, rankFragrances, vibesFromWeather } from "@/lib/suggestions";
import { cToF, fetchWeekWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type WeekDayPick = {
  date: string;
  weather: {
    tempMaxC: number;
    tempMinC: number;
    tempMaxF: number;
    tempMinF: number;
    precipProbMax: number;
    weatherCode: number;
  };
  vibe: string;
  pick: {
    id: string;
    name: string;
    brand: string;
    imageUrl: string;
    fragranticaUrl: string;
    tags: string[];
  } | null;
};

export type WeeklyPayload =
  | { ok: true; location: string; days: WeekDayPick[] }
  | { ok: false; reason: string; message: string };

export async function GET(): Promise<NextResponse<WeeklyPayload>> {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const lat = settings?.latitude;
    const lon = settings?.longitude;

    if (lat == null || lon == null) {
      return NextResponse.json({
        ok: false,
        reason: "no_location",
        message: "Set your city so we can load the weather.",
      });
    }

    const [rawFragrances, weekWeather] = await Promise.all([
      prisma.fragrance.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { wearLogs: true } },
          wearLogs: { orderBy: { wornAt: "desc" }, take: 1, select: { wornAt: true } },
        },
      }),
      fetchWeekWeather(lat, lon),
    ]);

    const fragrances = rawFragrances.map((f) => ({
      ...f,
      wearStats: {
        lastWornAt: f.wearLogs[0]?.wornAt ?? null,
        wearCount: f._count.wearLogs,
      },
    }));

    const usedIds = new Set<string>();

    const days: WeekDayPick[] = weekWeather.map((w) => {
      const vibes = vibesFromWeather(w);
      const ranked = rankFragrances(fragrances, w, null);

      // Pick the highest-scored fragrance not yet used this week
      const best = ranked.find((r) => !usedIds.has(r.fragrance.id)) ?? ranked[0] ?? null;
      if (best) usedIds.add(best.fragrance.id);

      const imageUrl = best
        ? (best.fragrance.imageUrl?.trim() ||
            imageUrlFromFragranticaPerfumeUrl(best.fragrance.fragranticaUrl))
        : "";

      return {
        date: w.date,
        weather: {
          tempMaxC: w.tempMaxC,
          tempMinC: w.tempMinC,
          tempMaxF: cToF(w.tempMaxC),
          tempMinF: cToF(w.tempMinC),
          precipProbMax: w.precipProbMax,
          weatherCode: w.weatherCode,
        },
        vibe: humanVibeLabel(vibes),
        pick: best
          ? {
              id: best.fragrance.id,
              name: best.fragrance.name,
              brand: best.fragrance.brand,
              imageUrl: imageUrl ?? "",
              fragranticaUrl: best.fragrance.fragranticaUrl ?? "",
              tags: best.tags,
            }
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      location: settings?.displayName || settings?.cityQuery || "",
      days,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, reason: "server_error", message }, { status: 500 });
  }
}
