import type { FragranceTag } from "@/lib/tag-options";
import { TAG_OPTIONS } from "@/lib/tag-options";

/** Default store actor: Fragrantica search + perfume URLs (see Apify input schema). */
export const DEFAULT_FRAGRANTICA_ACTOR_ID = "lexis-solutions/fragrantica";

export type FragranticaPreview = {
  name: string;
  brand: string;
  notes: string;
  tags: FragranceTag[];
  fragranticaUrl: string;
};

/** Map Fragrantica main-accord names to wardrobe mood tags (best-effort). */
const ACCORD_TO_TAG: Record<string, FragranceTag> = {
  fresh: "fresh",
  citrus: "citrus",
  aquatic: "aquatic",
  marine: "aquatic",
  ozonic: "aquatic",
  water: "aquatic",
  floral: "floral",
  rose: "floral",
  violet: "floral",
  white: "floral",
  green: "green",
  herbal: "green",
  aromatic: "green",
  woody: "woody",
  woods: "woody",
  wood: "woody",
  oud: "woody",
  cedar: "woody",
  sandalwood: "woody",
  patchouli: "woody",
  earthy: "woody",
  mossy: "green",
  amber: "amber",
  balsamic: "amber",
  resinous: "amber",
  sweet: "gourmand",
  vanilla: "gourmand",
  gourmand: "gourmand",
  fruity: "gourmand",
  honey: "gourmand",
  chocolate: "gourmand",
  caramel: "gourmand",
  spicy: "spicy",
  warm: "spicy",
  cinnamon: "spicy",
  leather: "spicy",
  smoky: "woody",
  musky: "musk",
  musk: "musk",
  powdery: "musk",
  soft: "musk",
};

function accordKey(accord: string): string {
  return accord.trim().toLowerCase();
}

export function accordsToTags(mainAccords: unknown): FragranceTag[] {
  if (!Array.isArray(mainAccords)) return [];
  const sorted = [...mainAccords]
    .filter(
      (x): x is { accord: string; value?: number } =>
        Boolean(x) && typeof x === "object" && typeof (x as { accord?: unknown }).accord === "string"
    )
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const out: FragranceTag[] = [];
  const seen = new Set<FragranceTag>();
  for (const row of sorted) {
    const tag = ACCORD_TO_TAG[accordKey(row.accord)];
    if (tag && TAG_OPTIONS.includes(tag) && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
      if (out.length >= 8) break;
    }
  }
  return out;
}

/** Derive a short display name from the Fragrantica title + brand. */
export function parseFragranceName(title: string, brandName: string): string {
  const t = title.trim();
  const b = (brandName || "").trim();
  const head = t.split(/\s+perfume\b/i)[0]?.trim() ?? t;
  if (b && head.length > b.length + 1 && head.toLowerCase().endsWith(b.toLowerCase())) {
    return head.slice(0, head.length - b.length).trim();
  }
  if (b) {
    const idx = head.indexOf(b);
    if (idx > 0) return head.slice(0, idx).trim();
  }
  return head || t;
}

export function normalizeFragranticaUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("INVALID_URL");
  }
  const host = u.hostname.toLowerCase();
  if (!host.endsWith("fragrantica.com")) {
    throw new Error("NOT_FRAGRANTICA");
  }
  u.hash = "";
  u.search = "";
  return u.toString();
}

export function mapFragranticaItem(item: Record<string, unknown>): FragranticaPreview {
  let url = typeof item.url === "string" ? item.url.trim() : "";
  try {
    if (url) url = normalizeFragranticaUrl(url);
  } catch {
    /* keep original if normalization fails */
  }

  const brandName = typeof item.brandName === "string" ? item.brandName.trim() : "";
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const description = typeof item.description === "string" ? item.description.trim() : "";

  const name = parseFragranceName(title, brandName) || title || "Unknown";
  const brand = brandName || "Unknown";
  const notes = description.slice(0, 4000);
  const tags = accordsToTags(item.mainAccords);

  return {
    name,
    brand,
    notes,
    tags,
    fragranticaUrl: url,
  };
}