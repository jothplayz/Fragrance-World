import type { Fragrance } from "@prisma/client";
import type { FragranceTag } from "./tag-options";
import { TAG_OPTIONS } from "./tag-options";
import { isWetCode, type WeatherToday } from "./weather";

export { TAG_OPTIONS, type FragranceTag } from "./tag-options";

type Vibe = "hot" | "warm" | "mild" | "cool" | "cold" | "wet";

/** Per-vibe points for each tag (higher = better fit). */
const VIBE_SCORES: Record<Vibe, Partial<Record<FragranceTag, number>>> = {
  hot: {
    fresh: 4,
    citrus: 4,
    aquatic: 4,
    green: 3,
    musk: 1,
    floral: 1,
    woody: -1,
    amber: -3,
    gourmand: -3,
    spicy: -1,
  },
  warm: {
    fresh: 2,
    citrus: 2,
    aquatic: 2,
    floral: 3,
    green: 2,
    woody: 1,
    musk: 1,
    amber: 0,
    gourmand: 0,
    spicy: 1,
  },
  mild: {
    floral: 2,
    woody: 2,
    fresh: 1,
    citrus: 1,
    green: 1,
    musk: 1,
    aquatic: 1,
    amber: 1,
    gourmand: 1,
    spicy: 1,
  },
  cool: {
    woody: 3,
    spicy: 2,
    amber: 2,
    musk: 2,
    floral: 1,
    fresh: 0,
    citrus: 0,
    green: 0,
    gourmand: 1,
    aquatic: -1,
  },
  cold: {
    amber: 4,
    gourmand: 4,
    woody: 3,
    spicy: 3,
    musk: 2,
    floral: 0,
    fresh: -2,
    citrus: -2,
    aquatic: -2,
    green: -1,
  },
  wet: {
    fresh: 2,
    citrus: 2,
    aquatic: 3,
    green: 2,
    woody: 1,
    musk: 1,
    floral: 1,
    amber: 0,
    gourmand: 0,
    spicy: 0,
  },
};

function tempVibe(maxC: number, minC: number): Vibe {
  const avg = (maxC + minC) / 2;
  if (avg >= 28) return "hot";
  if (avg >= 22) return "warm";
  if (avg >= 15) return "mild";
  if (avg >= 8) return "cool";
  return "cold";
}

function parseTags(json: string): FragranceTag[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is FragranceTag =>
      typeof t === "string" && (TAG_OPTIONS as readonly string[]).includes(t)
    );
  } catch {
    return [];
  }
}

export function scoreFragrance(tags: FragranceTag[], vibes: Vibe[]): number {
  let score = 0;
  for (const vibe of vibes) {
    const table = VIBE_SCORES[vibe];
    for (const tag of tags) {
      score += table[tag] ?? 0;
    }
  }
  if (tags.length === 0) score -= 2;
  return score;
}

export function vibesFromWeather(w: WeatherToday): Vibe[] {
  const vibes: Vibe[] = [tempVibe(w.tempMaxC, w.tempMinC)];
  const wet =
    w.precipProbMax >= 45 || isWetCode(w.weatherCode);
  if (wet) vibes.push("wet");
  return vibes;
}

export type SuggestionRow = {
  fragrance: Fragrance;
  score: number;
  tags: FragranceTag[];
};

export function rankFragrances(
  items: Fragrance[],
  weather: WeatherToday
): SuggestionRow[] {
  const vibes = vibesFromWeather(weather);
  const rows: SuggestionRow[] = items.map((f) => {
    const tags = parseTags(f.tags);
    return { fragrance: f, tags, score: scoreFragrance(tags, vibes) };
  });
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export function humanVibeLabel(vibes: Vibe[]): string {
  const temp = vibes.find((v): v is Exclude<Vibe, "wet"> => v !== "wet");
  const wet = vibes.includes("wet");
  const tempLabels: Record<Exclude<Vibe, "wet">, string> = {
    hot: "hot day",
    warm: "warm day",
    mild: "mild day",
    cool: "cool day",
    cold: "cold day",
  };
  const t = temp ? tempLabels[temp] : "today";
  if (wet) return `${t} with a good chance of rain`;
  return t;
}
