export const TAG_OPTIONS = [
  "fresh",
  "citrus",
  "aquatic",
  "floral",
  "green",
  "woody",
  "amber",
  "gourmand",
  "spicy",
  "musk",
] as const;

export type FragranceTag = (typeof TAG_OPTIONS)[number];

export function parseTagsFromJson(json: string): FragranceTag[] {
  try {
    const a = JSON.parse(json) as unknown;
    if (!Array.isArray(a)) return [];
    return a.filter(
      (t): t is FragranceTag =>
        typeof t === "string" && (TAG_OPTIONS as readonly string[]).includes(t)
    );
  } catch {
    return [];
  }
}
