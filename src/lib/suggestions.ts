import type { Fragrance } from "@prisma/client";
import type { FragranceTag } from "./tag-options";
import { TAG_OPTIONS } from "./tag-options";
import type { Occasion } from "./occasion-options";
import { OCCASION_OPTIONS } from "./occasion-options";
import { isWetCode, type WeatherToday } from "./weather";
import { parseSeasonsFromJson } from "./season-options";

export { TAG_OPTIONS, type FragranceTag } from "./tag-options";
export { OCCASION_OPTIONS, type Occasion } from "./occasion-options";

type Vibe = "hot" | "warm" | "mild" | "cool" | "cold" | "wet";

const VIBE_SCORES: Record<Vibe, Partial<Record<FragranceTag, number>>> = {
  hot: {
    fresh: 4, citrus: 4, aquatic: 4, green: 3,
    musk: 1, floral: 1, woody: -1, amber: -3, gourmand: -3, spicy: -1,
  },
  warm: {
    fresh: 2, citrus: 2, aquatic: 2, floral: 3,
    green: 2, woody: 1, musk: 1, amber: 0, gourmand: 0, spicy: 1,
  },
  mild: {
    floral: 2, woody: 2, fresh: 1, citrus: 1,
    green: 1, musk: 1, aquatic: 1, amber: 1, gourmand: 1, spicy: 1,
  },
  cool: {
    woody: 3, spicy: 2, amber: 2, musk: 2,
    floral: 1, fresh: 0, citrus: 0, green: 0, gourmand: 1, aquatic: -1,
  },
  cold: {
    amber: 4, gourmand: 4, woody: 3, spicy: 3,
    musk: 2, floral: 0, fresh: -2, citrus: -2, aquatic: -2, green: -1,
  },
  wet: {
    fresh: 2, citrus: 2, aquatic: 3, green: 2,
    woody: 1, musk: 1, floral: 1, amber: 0, gourmand: 0, spicy: 0,
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

function parseOccasions(json: string): Occasion[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is Occasion =>
      typeof t === "string" && (OCCASION_OPTIONS as readonly string[]).includes(t)
    );
  } catch {
    return [];
  }
}

function weatherScore(tags: FragranceTag[], vibes: Vibe[]): number {
  let score = 0;
  for (const vibe of vibes) {
    const table = VIBE_SCORES[vibe];
    for (const tag of tags) score += table[tag] ?? 0;
  }
  if (tags.length === 0) score -= 2;
  return score;
}

/** Heavy penalty for recently worn — fades over 4 days */
function recencyPenalty(lastWornAt: Date | null): number {
  if (!lastWornAt) return 0;
  const hoursAgo = (Date.now() - lastWornAt.getTime()) / 3_600_000;
  if (hoursAgo < 20) return 15;  // wore today — essentially skip
  if (hoursAgo < 44) return 8;   // yesterday
  if (hoursAgo < 68) return 4;   // 2 days ago
  if (hoursAgo < 96) return 2;   // 3 days ago
  return 0;
}

/** Encourage variety — boost bottles not worn in a while */
function rotationBonus(lastWornAt: Date | null): number {
  if (!lastWornAt) return 1; // never worn — slight nudge to try it
  const daysAgo = (Date.now() - lastWornAt.getTime()) / 86_400_000;
  if (daysAgo >= 30) return 3;
  if (daysAgo >= 14) return 2;
  if (daysAgo >= 7) return 1;
  return 0;
}

/** Boost when occasion matches what the user flagged for today */
function occasionScore(fragranceOccasions: Occasion[], selected: Occasion | null): number {
  if (!selected) return 0;
  return fragranceOccasions.includes(selected) ? 6 : 0;
}

/** Season-temperature mismatch penalty / bonus.
 *  Heavy negative for wearing winter scents in heat or summer scents in cold.
 *  Adjacent seasons score neutrally; matching seasons get a small bonus. */
function seasonScore(seasonJson: string, tempVibe: Vibe): number {
  const seasons = parseSeasonsFromJson(seasonJson);
  if (seasons.length === 0) return 0;

  const hasSummer = seasons.includes("summer");
  const hasWinter = seasons.includes("winter");
  const hasSpring = seasons.includes("spring");
  const hasFall   = seasons.includes("fall");

  switch (tempVibe) {
    case "hot":
      if (hasWinter && !hasSummer && !hasSpring) return -7; // pure winter scent in heat
      if (hasWinter && !hasSummer) return -4;               // winter + fall only
      if (hasWinter && hasSummer) return -1;                // spans both extremes
      if (hasSummer) return 3;
      if (hasSpring) return 1;
      return 0;
    case "warm":
      if (hasWinter && !hasSummer && !hasSpring) return -4;
      if (hasWinter && !hasSummer) return -2;
      if (hasSummer || hasSpring) return 2;
      return 0;
    case "mild":
      if (hasSpring || hasFall) return 2;
      return 0;
    case "cool":
      if (hasSummer && !hasFall && !hasWinter) return -3;
      if (hasFall) return 2;
      if (hasWinter) return 1;
      return 0;
    case "cold":
      if (hasSummer && !hasWinter && !hasFall) return -7; // pure summer scent in cold
      if (hasSummer && !hasWinter) return -4;             // summer + spring only
      if (hasSummer && hasWinter) return -1;
      if (hasWinter) return 3;
      if (hasFall) return 1;
      return 0;
    default:
      return 0;
  }
}

/** Hard seasonal guardrail: returns false for fragrances that are clearly
 *  out of season for the current weather, so they are never recommended —
 *  pure fall/winter scents on warm days, pure spring/summer scents on cold
 *  days. Fragrances with no season data, or that span the temperature divide
 *  (e.g. tagged both summer and winter), are always allowed. "Mild" weather is
 *  treated as neutral — every scent stays in the running there. */
function isInSeason(seasonJson: string, tempVibe: Vibe): boolean {
  const seasons = parseSeasonsFromJson(seasonJson);
  if (seasons.length === 0) return true; // unknown — don't exclude

  const hasSummer = seasons.includes("summer");
  const hasSpring = seasons.includes("spring");
  const hasWinter = seasons.includes("winter");
  const hasFall   = seasons.includes("fall");

  const warmWeather = tempVibe === "hot" || tempVibe === "warm";
  const coldWeather = tempVibe === "cold" || tempVibe === "cool";

  // Cold-only scent (fall/winter, no warm season) on a warm day → out.
  if (warmWeather && (hasWinter || hasFall) && !hasSummer && !hasSpring) return false;
  // Warm-only scent (spring/summer, no cold season) on a cold day → out.
  if (coldWeather && (hasSummer || hasSpring) && !hasWinter && !hasFall) return false;
  return true;
}

/** True when a fragrance covers every possible occasion — a true all-rounder */
function isVersatile(occasions: Occasion[]): boolean {
  return OCCASION_OPTIONS.every((o) => occasions.includes(o));
}

export function vibesFromWeather(w: WeatherToday): Vibe[] {
  const vibes: Vibe[] = [tempVibe(w.tempMaxC, w.tempMinC)];
  if (w.precipProbMax >= 45 || isWetCode(w.weatherCode)) vibes.push("wet");
  return vibes;
}

export type WearStats = {
  lastWornAt: Date | null;
  wearCount: number;
};

export type SuggestionRow = {
  fragrance: Fragrance;
  score: number;
  tags: FragranceTag[];
  occasions: Occasion[];
  weatherScore: number;
  wearStats: WearStats;
};

export type FragranceWithWear = Fragrance & { wearStats?: WearStats };

export function rankFragrances(
  items: FragranceWithWear[],
  weather: WeatherToday,
  selectedOccasion: Occasion | null = null
): SuggestionRow[] {
  const vibes = vibesFromWeather(weather);
  const tempVibe = vibes.find((v) => v !== "wet") ?? "mild";

  const rows: SuggestionRow[] = items.map((f) => {
    const tags = parseTags(f.tags);
    const occasions = parseOccasions(f.occasions);
    const stats: WearStats = f.wearStats ?? { lastWornAt: null, wearCount: 0 };

    const ws = weatherScore(tags, vibes);
    const score =
      ws
      + seasonScore(f.seasons, tempVibe)
      + occasionScore(occasions, selectedOccasion)
      + rotationBonus(stats.lastWornAt)
      - recencyPenalty(stats.lastWornAt);

    return { fragrance: f, score, tags, occasions, weatherScore: ws, wearStats: stats };
  });

  rows.sort((a, b) => b.score - a.score);

  // Hard seasonal guardrail — drop clearly out-of-season scents (winter/fall on
  // hot days, summer/spring on cold days) so they're never recommended. Falls
  // back to the full list if filtering would leave nothing to suggest.
  const inSeason = rows.filter((r) => isInSeason(r.fragrance.seasons, tempVibe));
  const pool = inSeason.length > 0 ? inSeason : rows;

  // Versatile fragrances (all occasions) cycle to the top, sorted by least
  // recently worn — but only among in-season picks, so an all-rounder can't
  // jump the seasonal guardrail.
  const versatile = pool.filter((r) => isVersatile(r.occasions));
  if (versatile.length > 0) {
    versatile.sort((a, b) => {
      const at = a.wearStats.lastWornAt?.getTime() ?? 0;
      const bt = b.wearStats.lastWornAt?.getTime() ?? 0;
      return at - bt;
    });
    const rest = pool.filter((r) => !isVersatile(r.occasions));
    return [...versatile, ...rest];
  }

  return pool;
}

export function humanVibeLabel(vibes: Vibe[]): string {
  const temp = vibes.find((v): v is Exclude<Vibe, "wet"> => v !== "wet");
  const wet = vibes.includes("wet");
  const labels: Record<Exclude<Vibe, "wet">, string> = {
    hot: "hot day", warm: "warm day", mild: "mild day", cool: "cool day", cold: "cold day",
  };
  const t = temp ? labels[temp] : "today";
  return wet ? `${t} with rain` : t;
}
