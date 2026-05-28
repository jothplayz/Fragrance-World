import { parseTagsFromJson, type FragranceTag } from "./tag-options";
import { parseFragranceDescription } from "./parse-fragrance-notes";

type FragranceLike = {
  id: string;
  name: string;
  brand: string;
  tags: string;
  notes: string;
  longevity?: string;
};

export type LayeringHarmony = "excellent" | "good" | "fair" | "risky";

export type LayeringAnalysis = {
  harmony: LayeringHarmony;
  harmonyReason: string;
  sharedNotes: string[];
  uniqueToA: string[];
  uniqueToB: string[];
  firstToApply: "a" | "b" | "either";
  applicationTip: string;
  complementaryPairs: { aTag: FragranceTag; bTag: FragranceTag; reason: string }[];
};

// Higher = heavier/longer-lasting, should go on skin first
const TAG_WEIGHT: Record<FragranceTag, number> = {
  amber: 5,
  gourmand: 5,
  woody: 4,
  spicy: 4,
  musk: 3,
  floral: 2,
  green: 1,
  fresh: 1,
  citrus: 1,
  aquatic: 1,
};

// Only truly classic cross-profile pairings — scored for when the tag is EXCLUSIVE to one side
type CompatEntry = {
  tags: [FragranceTag, FragranceTag];
  score: number;
  reason: string;
};

const COMPAT_TABLE: CompatEntry[] = [
  { tags: ["fresh", "woody"], score: 3, reason: "Light freshness over earthy wood — the most classic layering combo" },
  { tags: ["citrus", "amber"], score: 3, reason: "Citrus top brightens and lifts a warm amber base" },
  { tags: ["floral", "musk"], score: 3, reason: "Soft florals anchored by skin musk" },
  { tags: ["aquatic", "woody"], score: 2, reason: "Oceanic freshness on a woody foundation" },
  { tags: ["spicy", "amber"], score: 2, reason: "Warm oriental combination" },
  { tags: ["fresh", "musk"], score: 2, reason: "Clean, airy skin scent" },
  { tags: ["floral", "woody"], score: 1, reason: "Elegant floral-woody pairing" },
  { tags: ["citrus", "musk"], score: 1, reason: "Bright citrus lifted by warm skin musk" },
];

function extractAllNotes(notes: string): string[] {
  if (!notes.trim()) return [];
  const parsed = parseFragranceDescription(notes);
  return [
    ...parsed.pyramid.top.items,
    ...parsed.pyramid.middle.items,
    ...parsed.pyramid.base.items,
  ].map((n) => n.toLowerCase().trim());
}

function fragranceWeight(tags: FragranceTag[]): number {
  if (tags.length === 0) return 0;
  return tags.reduce((sum, t) => sum + (TAG_WEIGHT[t] ?? 1), 0) / tags.length;
}

export function analyzeLayering(a: FragranceLike, b: FragranceLike): LayeringAnalysis {
  const tagsA = parseTagsFromJson(a.tags);
  const tagsB = parseTagsFromJson(b.tags);
  const tagSetA = new Set(tagsA);
  const tagSetB = new Set(tagsB);

  const notesA = new Set(extractAllNotes(a.notes));
  const notesB = new Set(extractAllNotes(b.notes));

  const sharedNotes: string[] = [];
  const uniqueToA: string[] = [];
  const uniqueToB: string[] = [];

  for (const n of notesA) {
    if (notesB.has(n)) sharedNotes.push(n);
    else uniqueToA.push(n);
  }
  for (const n of notesB) {
    if (!notesA.has(n)) uniqueToB.push(n);
  }

  // Tag Jaccard similarity — similar tag profiles = redundant layering
  const sharedTagCount = tagsA.filter((t) => tagSetB.has(t)).length;
  const unionTagCount = new Set([...tagsA, ...tagsB]).size;
  const tagJaccard = unionTagCount > 0 ? sharedTagCount / unionTagCount : 0;

  const complementaryPairs: LayeringAnalysis["complementaryPairs"] = [];
  let compatScore = 0;

  // Penalise high tag overlap — very similar profiles add little when layered
  if (tagJaccard >= 0.7) compatScore -= 4;
  else if (tagJaccard >= 0.5) compatScore -= 2;
  else if (tagJaccard >= 0.3) compatScore -= 1;

  // Extra penalty when both are heavy-only (no light notes at all)
  const LIGHT: FragranceTag[] = ["fresh", "citrus", "aquatic", "green"];
  const HEAVY: FragranceTag[] = ["amber", "woody", "spicy", "gourmand"];
  const aIsHeavyOnly = HEAVY.some((t) => tagSetA.has(t)) && LIGHT.every((t) => !tagSetA.has(t));
  const bIsHeavyOnly = HEAVY.some((t) => tagSetB.has(t)) && LIGHT.every((t) => !tagSetB.has(t));
  if (aIsHeavyOnly && bIsHeavyOnly) compatScore -= 2;

  // Gourmand + gourmand = too sweet
  if (tagSetA.has("gourmand") && tagSetB.has("gourmand")) compatScore -= 3;

  for (const entry of COMPAT_TABLE) {
    const [t1, t2] = entry.tags;
    // Fires when A brings t1 AND B adds t2 that A doesn't already have (or vice versa)
    // This ensures the second fragrance is genuinely contributing something new
    const forwardMatch = tagSetA.has(t1) && tagSetB.has(t2) && !tagSetA.has(t2);
    const reverseMatch = tagSetB.has(t1) && tagSetA.has(t2) && !tagSetB.has(t2);

    if (forwardMatch || reverseMatch) {
      compatScore += entry.score;
      const aTag = forwardMatch ? t1 : t2;
      const bTag = forwardMatch ? t2 : t1;
      complementaryPairs.push({ aTag, bTag, reason: entry.reason });
    }
  }

  let harmony: LayeringHarmony;
  let harmonyReason: string;
  if (compatScore >= 4) {
    harmony = "excellent";
    harmonyReason = "Strong complementary profiles — each fragrance adds what the other lacks.";
  } else if (compatScore >= 2) {
    harmony = "good";
    harmonyReason = "Good pairing with complementary note families.";
  } else if (compatScore >= -1) {
    harmony = "fair";
    harmonyReason = "These can work together but won't create much additional complexity.";
  } else {
    harmony = "risky";
    harmonyReason = tagJaccard >= 0.5
      ? "Too similar — layering these adds little and may feel redundant."
      : "Profiles may compete — test lightly on skin before committing.";
  }

  const weightA = fragranceWeight(tagsA);
  const weightB = fragranceWeight(tagsB);
  let firstToApply: LayeringAnalysis["firstToApply"];
  let applicationTip: string;

  if (Math.abs(weightA - weightB) < 0.5) {
    firstToApply = "either";
    applicationTip = "Similar weight — apply either first. Let the first dry before layering the second.";
  } else if (weightA > weightB) {
    firstToApply = "a";
    applicationTip = `Apply ${a.name} first (heavier base), then layer ${b.name} on top once dry.`;
  } else {
    firstToApply = "b";
    applicationTip = `Apply ${b.name} first (heavier base), then layer ${a.name} on top once dry.`;
  }

  return {
    harmony,
    harmonyReason,
    sharedNotes: sharedNotes.slice(0, 8),
    uniqueToA: uniqueToA.slice(0, 8),
    uniqueToB: uniqueToB.slice(0, 8),
    firstToApply,
    applicationTip,
    complementaryPairs: complementaryPairs.slice(0, 4),
  };
}
