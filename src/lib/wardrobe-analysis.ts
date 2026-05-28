import { parseTagsFromJson, TAG_OPTIONS, type FragranceTag } from "./tag-options";
import { parseSeasonsFromJson, SEASON_OPTIONS, type Season } from "./season-options";
import { parseOccasionsFromJson, OCCASION_OPTIONS, type Occasion } from "./occasion-options";

type FragranceLike = {
  tags: string;
  seasons: string;
  occasions: string;
};

export type WardrobeGap = {
  category: string;
  description: string;
  priority: "high" | "medium" | "low";
  suggestion: string;
};

export type WardrobeAnalysis = {
  tagCoverage: Record<FragranceTag, number>;
  seasonCoverage: Record<Season, number>;
  occasionCoverage: Record<Occasion, number>;
  gaps: WardrobeGap[];
  strengths: string[];
  totalCount: number;
};

const TAG_LABEL: Record<FragranceTag, string> = {
  fresh: "Fresh", citrus: "Citrus", aquatic: "Aquatic", floral: "Floral",
  green: "Green", woody: "Woody", amber: "Amber", gourmand: "Gourmand",
  spicy: "Spicy", musk: "Musk",
};

const SEASON_LABEL: Record<Season, string> = {
  spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter",
};

const OCCASION_LABEL: Record<Occasion, string> = {
  casual: "Casual", work: "Work", date: "Date",
  formal: "Formal", evening: "Evening", sport: "Sport",
};

export { TAG_LABEL, SEASON_LABEL, OCCASION_LABEL };

const LIGHT_TAGS: FragranceTag[] = ["fresh", "citrus", "aquatic", "green"];
const DEEP_TAGS: FragranceTag[] = ["amber", "woody", "spicy", "gourmand"];

export function analyzeWardrobe(fragrances: FragranceLike[]): WardrobeAnalysis {
  const tagCoverage = Object.fromEntries(TAG_OPTIONS.map((t) => [t, 0])) as Record<FragranceTag, number>;
  const seasonCoverage = Object.fromEntries(SEASON_OPTIONS.map((s) => [s, 0])) as Record<Season, number>;
  const occasionCoverage = Object.fromEntries(OCCASION_OPTIONS.map((o) => [o, 0])) as Record<Occasion, number>;

  for (const f of fragrances) {
    for (const tag of parseTagsFromJson(f.tags)) tagCoverage[tag]++;
    for (const season of parseSeasonsFromJson(f.seasons)) seasonCoverage[season]++;
    for (const occasion of parseOccasionsFromJson(f.occasions)) occasionCoverage[occasion]++;
  }

  const gaps: WardrobeGap[] = [];
  const strengths: string[] = [];

  if (fragrances.length === 0) {
    return { tagCoverage, seasonCoverage, occasionCoverage, gaps, strengths, totalCount: 0 };
  }

  const lightCount = LIGHT_TAGS.reduce((sum, t) => sum + tagCoverage[t], 0);
  const deepCount = DEEP_TAGS.reduce((sum, t) => sum + tagCoverage[t], 0);

  if (lightCount === 0) {
    gaps.push({
      category: "Daytime / Light",
      description: "No fresh, citrus, aquatic, or green fragrances in your collection.",
      priority: "high",
      suggestion: "Add a fresh or citrus fragrance for daytime, office, and warm weather wear.",
    });
  }
  if (deepCount === 0) {
    gaps.push({
      category: "Depth / Richness",
      description: "No amber, woody, spicy, or gourmand fragrances in your collection.",
      priority: "high",
      suggestion: "Add an amber or woody fragrance for cooler weather and evening wear.",
    });
  }

  const missingSeasonsHigh = (["summer", "winter"] as Season[]).filter((s) => seasonCoverage[s] === 0);
  for (const s of missingSeasonsHigh) {
    gaps.push({
      category: `${SEASON_LABEL[s]} coverage`,
      description: `No fragrances tagged for ${s}.`,
      priority: "high",
      suggestion: s === "summer"
        ? "A fresh, citrus, or aquatic fragrance handles summer heat well."
        : "An amber, woody, or spicy fragrance is ideal for cold winter days.",
    });
  }

  const missingSeasonsLow = (["spring", "fall"] as Season[]).filter((s) => seasonCoverage[s] === 0);
  for (const s of missingSeasonsLow) {
    gaps.push({
      category: `${SEASON_LABEL[s]} coverage`,
      description: `No fragrances tagged for ${s}.`,
      priority: "medium",
      suggestion: s === "spring"
        ? "Light florals and green fragrances shine in spring."
        : "Woody and spicy fragrances are perfect for crisp fall weather.",
    });
  }

  if (tagCoverage.musk === 0) {
    gaps.push({
      category: "Signature / Skin Scent",
      description: "No musky fragrance — a skin scent makes a great everyday signature.",
      priority: "medium",
      suggestion: "A light musk or floral musk is versatile and works in almost any setting.",
    });
  }

  const missingOccasions = (["work", "date", "evening"] as Occasion[]).filter(
    (o) => occasionCoverage[o] === 0
  );
  for (const o of missingOccasions) {
    gaps.push({
      category: `${OCCASION_LABEL[o]} occasion`,
      description: `Nothing tagged for ${o}.`,
      priority: "medium",
      suggestion:
        o === "work"
          ? "A subtle fresh or woody scent works well in professional settings."
          : o === "date"
          ? "A floral, musk, or light oriental scent is great for intimate occasions."
          : "A richer amber, spicy, or woody fragrance fits evening settings well.",
    });
  }

  // Strengths
  const strongSeasons = SEASON_OPTIONS.filter((s) => seasonCoverage[s] >= 2);
  if (strongSeasons.length > 0) {
    strengths.push(`Strong ${strongSeasons.map((s) => SEASON_LABEL[s]).join(" & ")} coverage.`);
  }
  const dominantTags = TAG_OPTIONS.filter((t) => tagCoverage[t] >= 3);
  if (dominantTags.length > 0) {
    strengths.push(`Deep ${dominantTags.map((t) => TAG_LABEL[t]).join(", ")} collection.`);
  }
  const coveredOccasions = OCCASION_OPTIONS.filter((o) => occasionCoverage[o] > 0);
  if (coveredOccasions.length >= 4) {
    strengths.push("Great occasion variety — you have options for most situations.");
  }
  if (lightCount > 0 && deepCount > 0) {
    strengths.push("Good balance of light and rich fragrances.");
  }

  return {
    tagCoverage,
    seasonCoverage,
    occasionCoverage,
    gaps: gaps.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    }),
    strengths,
    totalCount: fragrances.length,
  };
}
