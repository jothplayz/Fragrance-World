import type { FragranceTag } from "./tag-options";
import type { Season } from "./season-options";
import type { Occasion } from "./occasion-options";

const TAG_SCORES: Record<FragranceTag, Record<Occasion, number>> = {
  fresh:    { casual: 3,  work: 2,  date: 0,  formal: 0,  evening: -1, sport: 3  },
  citrus:   { casual: 3,  work: 2,  date: 1,  formal: 0,  evening: -1, sport: 3  },
  aquatic:  { casual: 3,  work: 2,  date: 0,  formal: -1, evening: -1, sport: 3  },
  green:    { casual: 2,  work: 2,  date: 0,  formal: 0,  evening: -1, sport: 2  },
  floral:   { casual: 1,  work: 1,  date: 3,  formal: 2,  evening: 2,  sport: 0  },
  musk:     { casual: 1,  work: 2,  date: 3,  formal: 1,  evening: 2,  sport: 0  },
  woody:    { casual: 0,  work: 2,  date: 1,  formal: 3,  evening: 2,  sport: 0  },
  amber:    { casual: -1, work: -1, date: 2,  formal: 3,  evening: 3,  sport: -2 },
  spicy:    { casual: -1, work: -1, date: 2,  formal: 3,  evening: 3,  sport: -2 },
  gourmand: { casual: -1, work: -2, date: 2,  formal: 1,  evening: 3,  sport: -2 },
};

const SEASON_SCORES: Record<Season, Record<Occasion, number>> = {
  spring: { casual: 2,  work: 1, date: 1,  formal: 0,  evening: 0,  sport: 2  },
  summer: { casual: 2,  work: 1, date: 0,  formal: -1, evening: -1, sport: 2  },
  fall:   { casual: 0,  work: 1, date: 2,  formal: 2,  evening: 2,  sport: 0  },
  winter: { casual: -1, work: 0, date: 2,  formal: 3,  evening: 3,  sport: -1 },
};

const KEYWORD_SIGNALS: Array<{ pattern: RegExp; scores: Partial<Record<Occasion, number>> }> = [
  { pattern: /\b(sport|sporty|athletic|gym|active|energetic|invigorat)\b/i, scores: { sport: 3 } },
  { pattern: /\b(office|work|professional|workplace|business|boardroom)\b/i, scores: { work: 3 } },
  { pattern: /\b(date|seduct|sensual|intimate|romantic|allur)\b/i, scores: { date: 3 } },
  { pattern: /\b(evening|night|nocturnal|nighttime)\b/i, scores: { evening: 2 } },
  { pattern: /\b(casual|everyday|daily|versatile|laid.back)\b/i, scores: { casual: 2 } },
  { pattern: /\b(formal|black.tie|gala|ceremony|elegant|sophisticated|luxur)\b/i, scores: { formal: 2 } },
  { pattern: /\boud\b/i,           scores: { formal: 2, evening: 2 } },
  { pattern: /\btobacco\b/i,       scores: { evening: 2, formal: 1 } },
  { pattern: /\bleather\b/i,       scores: { formal: 2, evening: 1 } },
  { pattern: /\bincense\b/i,       scores: { evening: 2, formal: 1 } },
  { pattern: /\bvanilla\b/i,       scores: { date: 1, evening: 1 } },
  { pattern: /\b(mint|herbal)\b/i, scores: { sport: 1, casual: 1 } },
  { pattern: /\b(ocean|marine|ozonic|sea)\b/i, scores: { sport: 2, casual: 1 } },
];

const OCCASIONS: Occasion[] = ["casual", "work", "date", "formal", "evening", "sport"];

export function inferOccasions(
  tags: FragranceTag[],
  seasons: Season[],
  notes: string
): Occasion[] {
  const scores: Record<Occasion, number> = {
    casual: 0, work: 0, date: 0, formal: 0, evening: 0, sport: 0,
  };

  for (const tag of tags) {
    const row = TAG_SCORES[tag];
    for (const occ of OCCASIONS) scores[occ] += row[occ];
  }

  for (const season of seasons) {
    const row = SEASON_SCORES[season];
    for (const occ of OCCASIONS) scores[occ] += row[occ];
  }

  for (const { pattern, scores: bonus } of KEYWORD_SIGNALS) {
    if (pattern.test(notes)) {
      for (const [occ, pts] of Object.entries(bonus) as [Occasion, number][]) {
        scores[occ] += pts;
      }
    }
  }

  const ranked = OCCASIONS
    .map((occ) => ({ occ, score: scores[occ] }))
    .sort((a, b) => b.score - a.score);

  const maxScore = ranked[0]?.score ?? 0;

  // A fragrance is versatile when its top score is moderate and spread is low.
  // Use a relative threshold: include occasions scoring >= 50% of the top score.
  // Floor of 2 prevents including near-zero occasions on weak fragrances.
  const relativeFloor = Math.max(2, maxScore * 0.5);

  const qualified = ranked.filter((r) => r.score >= relativeFloor);

  // Always return at least one
  if (qualified.length === 0 && ranked[0] && ranked[0].score > 0) {
    return [ranked[0].occ];
  }

  return qualified.map((r) => r.occ);
}
