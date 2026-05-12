export const SEASON_OPTIONS = ["spring", "summer", "fall", "winter"] as const;

export type Season = (typeof SEASON_OPTIONS)[number];

export function parseSeasonsFromJson(json: string): Season[] {
  try {
    const a = JSON.parse(json) as unknown;
    if (!Array.isArray(a)) return [];
    return a.filter(
      (t): t is Season =>
        typeof t === "string" && (SEASON_OPTIONS as readonly string[]).includes(t)
    );
  } catch {
    return [];
  }
}
