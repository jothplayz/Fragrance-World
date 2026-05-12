export const OCCASION_OPTIONS = [
  "casual",
  "work",
  "date",
  "formal",
  "evening",
  "sport",
] as const;

export type Occasion = (typeof OCCASION_OPTIONS)[number];

export function parseOccasionsFromJson(json: string): Occasion[] {
  try {
    const a = JSON.parse(json) as unknown;
    if (!Array.isArray(a)) return [];
    return a.filter(
      (t): t is Occasion =>
        typeof t === "string" && (OCCASION_OPTIONS as readonly string[]).includes(t)
    );
  } catch {
    return [];
  }
}
