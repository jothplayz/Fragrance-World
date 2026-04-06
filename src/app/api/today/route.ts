import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { humanVibeLabel, rankFragrances, vibesFromWeather } from "@/lib/suggestions";
import { cToF, fetchTodayWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const lat = settings?.latitude;
    const lon = settings?.longitude;

    if (lat == null || lon == null) {
      return NextResponse.json({
        ok: false,
        reason: "no_location",
        message: "Set your city in settings so we can load weather.",
      });
    }

    const fragrances = await prisma.fragrance.findMany({ orderBy: { createdAt: "desc" } });

    let weather;
    try {
      weather = await fetchTodayWeather(lat, lon);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Weather error";
      return NextResponse.json({ ok: false, reason: "weather_error", message }, { status: 502 });
    }

    const vibes = vibesFromWeather(weather);
    const ranked = rankFragrances(fragrances, weather);
    const top = ranked.slice(0, 3);

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
      suggestions: top.map((r) => ({
        id: r.fragrance.id,
        name: r.fragrance.name,
        brand: r.fragrance.brand,
        tags: r.tags,
        score: r.score,
        notes: r.fragrance.notes,
      })),
      collectionCount: fragrances.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
