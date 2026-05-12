import type { WearHint } from "@/lib/parse-fragrance-notes";
import type { FragranceTag } from "@/lib/tag-options";

/** When parsed text has no cues, derive soft hints from saved mood tags (clearly labeled as tag-based). */
export function wearHintsFromMoodTags(tags: FragranceTag[]): WearHint[] {
  const out: WearHint[] = [];
  const set = new Set(tags);
  if (set.has("fresh") || set.has("citrus") || set.has("aquatic") || set.has("green")) {
    out.push({
      label: "Daytime / warm-weather lean",
      basis: "Fresh, citrus, aquatic, or green tags often read lighter and more daytime-friendly.",
      kind: "keyword",
    });
  }
  if (set.has("woody") || set.has("amber") || set.has("spicy") || set.has("musk")) {
    out.push({
      label: "Evening / cooler-weather lean",
      basis: "Woody, amber, spicy, or musk tags often skew richer — nice for night or layered wear.",
      kind: "keyword",
    });
  }
  if (set.has("gourmand")) {
    out.push({
      label: "Casual / cozy occasions",
      basis: "Gourmand profiles are often playful and comforting — great for casual plans.",
      kind: "keyword",
    });
  }
  if (set.has("floral")) {
    out.push({
      label: "Versatile social wear",
      basis: "Floral tags are broad; many work from office to dinner depending on concentration.",
      kind: "keyword",
    });
  }
  return out.slice(0, 5);
}

export function seasonHintsFromMoodTags(tags: FragranceTag[]): WearHint[] {
  const out: WearHint[] = [];
  const set = new Set(tags);
  if (set.has("citrus") || set.has("fresh") || set.has("aquatic")) {
    out.push({
      label: "Summer / heat (tag hint)",
      basis: "Bright or watery tags often pair well with hot weather.",
      kind: "keyword",
    });
  }
  if (set.has("woody") || set.has("amber") || set.has("spicy")) {
    out.push({
      label: "Winter / cold (tag hint)",
      basis: "Denser, warmer tags often feel at home in cool air.",
      kind: "keyword",
    });
  }
  if (set.has("floral") || set.has("green")) {
    out.push({
      label: "Spring (tag hint)",
      basis: "Green and floral families often read spring-like.",
      kind: "keyword",
    });
  }
  if (set.has("gourmand")) {
    out.push({
      label: "Fall / cozy evenings (tag hint)",
      basis: "Sweet or edible notes often suit transitional or chilly evenings.",
      kind: "keyword",
    });
  }
  return out.slice(0, 4);
}
