import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { imageUrlFromFragranticaPerfumeUrl } from "@/lib/apify-fragrantica";
import { humanVibeLabel, rankFragrances, vibesFromWeather } from "@/lib/suggestions";
import type { Occasion } from "@/lib/occasion-options";
import { OCCASION_OPTIONS } from "@/lib/occasion-options";
import { cToF, fetchTodayWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const occasionParam = searchParams.get("occasion");
  const selectedOccasion: Occasion | null =
    occasionParam && (OCCASION_OPTIONS as readonly string[]).includes(occasionParam)
      ? (occasionParam as Occasion)
      : null;

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

    // Fetch fragrances with wear stats in one query
    const raw = await prisma.fragrance.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { wearLogs: true } },
        wearLogs: {
          orderBy: { wornAt: "desc" },
          take: 1,
          select: { wornAt: true },
        },
      },
    });

    const fragrances = raw.map((f) => ({
      ...f,
      wearStats: {
        lastWornAt: f.wearLogs[0]?.wornAt ?? null,
        wearCount: f._count.wearLogs,
      },
    }));

    let weather;
    try {
      weather = await fetchTodayWeather(lat, lon);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Weather error";
      return NextResponse.json({ ok: false, reason: "weather_error", message }, { status: 502 });
    }

    const vibes = vibesFromWeather(weather);
    const ranked = rankFragrances(fragrances, weather, selectedOccasion);
    const best = ranked[0];
    const pickImage =
      best &&
      (best.fragrance.imageUrl?.trim() ||
        imageUrlFromFragranticaPerfumeUrl(best.fragrance.fragranticaUrl));

    const isShortLongevity = (best?.fragrance as { longevity?: string } | undefined)?.longevity === "short";
    const second = isShortLongevity ? ranked[1] : null;
    const secondImage =
      second &&
      (second.fragrance.imageUrl?.trim() ||
        imageUrlFromFragranticaPerfumeUrl(second.fragrance.fragranticaUrl));

    function pickShape(row: (typeof ranked)[0], img: string | null | undefined) {
      return {
        id: row.fragrance.id,
        name: row.fragrance.name,
        brand: row.fragrance.brand,
        tags: row.tags,
        occasions: row.occasions,
        score: row.score,
        notes: row.fragrance.notes,
        imageUrl: img ?? "",
        fragranticaUrl: row.fragrance.fragranticaUrl ?? "",
        longevity: (row.fragrance as { longevity?: string }).longevity ?? "",
        wearStats: row.wearStats,
      };
    }

    const picks = ranked.slice(0, 3).map((row) => {
      const img = row.fragrance.imageUrl?.trim() || imageUrlFromFragranticaPerfumeUrl(row.fragrance.fragranticaUrl);
      return pickShape(row, img);
    });

    return NextResponse.json({
      ok: true,
      location: {
        displayName: settings?.displayName ?? settings?.cityQuery ?? "",
        cityQuery: settings?.cityQuery ?? "",
      },
      weather: {
        date: weather.date,
        tempMaxC: weather.tempMaxC,
        tempMinC: weather.tempMinC,
        tempMaxF: cToF(weather.tempMaxC),
        tempMinF: cToF(weather.tempMinC),
        precipProbMax: weather.precipProbMax,
        weatherCode: weather.weatherCode,
        timezone: weather.timezone,
      },
      vibe: {
        keys: vibes,
        label: humanVibeLabel(vibes),
      },
      selectedOccasion,
      pick: best ? pickShape(best, pickImage) : null,
      secondPick: second ? pickShape(second, secondImage) : null,
      picks,
      collectionCount: fragrances.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json(
      { ok: false, reason: "server_error", message },
      { status: 500 }
    );
  }
}
