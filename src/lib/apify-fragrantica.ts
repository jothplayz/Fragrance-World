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
  imageUrl: string;
};

/** Fragrantica CDN thumb pattern (pid from perfume URL slug …-31861.html). */
export function imageUrlFromFragranticaPerfumeUrl(fragranticaUrl: string): string {
  const m = fragranticaUrl.trim().match(/-(\d+)(?:\.html)?(?:[#?].*)?$/i);
  if (!m) return "";
  return `https://fimgs.net/mdimg/perfume-thumbs/375x500.${m[1]}.jpg`;
}

function extractPrimaryImageUrl(item: Record<string, unknown>): string {
  const primary = typeof item.primaryImageUrl === "string" ? item.primaryImageUrl.trim() : "";
  if (primary.startsWith("http")) return primary;
  const imgs = item.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs[0];
    if (typeof first === "string" && first.startsWith("http")) return first;
    if (first && typeof first === "object") {
      const o = first as { url?: unknown; image?: unknown; src?: unknown };
      for (const u of [o.url, o.image, o.src]) {
        if (typeof u === "string" && u.startsWith("http")) return u.trim();
      }
    }
  }
  const legacy = typeof item.mainImage === "string" ? item.mainImage.trim() : "";
  if (legacy.startsWith("http")) return legacy;
  return "";
}

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

/** Accept www / regional Fragrantica hosts (actor is tuned for the .com site). */
export function isFragranticaHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "fragrantica.com" || h.endsWith(".fragrantica.com")) return true;
  return /^([a-z0-9-]+\.)?fragrantica\.[a-z]{2,63}$/i.test(h);
}

/** Numeric perfume id from …/Name-31861.html or …/Name-31861 (no extension). */
export function perfumeIdFromFragranticaPath(pathname: string): string | null {
  const m = pathname.match(/-(\d+)(?:\.html?)?\/?(?:[#?].*)?$/i);
  return m ? m[1]! : null;
}

/**
 * True if the URL's last path segment ends with -{pid} (.htm/.html optional).
 * Avoids naive includes() so …-31861 matches pid 31861 but not 3186, and pid 1 does not match …-21.
 */
export function perfumeUrlMatchesId(fragranticaUrl: string, pid: string): boolean {
  if (!pid || !/^\d+$/.test(pid) || !fragranticaUrl.trim()) return false;
  try {
    const pathname = new URL(fragranticaUrl.trim()).pathname;
    return new RegExp(`[^/]-${pid}(?:\\.html?)?/?$`, "i").test(pathname);
  } catch {
    return new RegExp(`[^/]-${pid}(?:\\.html?)?(?:[#?]|$)`, "i").test(fragranticaUrl.trim());
  }
}

/** Build a search string from a perfume path for Apify query fallback. */
export function searchQueryFromPerfumePath(pathname: string): string | null {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length < 3 || segs[0]!.toLowerCase() !== "perfume") return null;
  const houseSeg = segs[1]!;
  const lastSeg = segs[2]!.replace(/\.html?$/i, "");
  const house = decodeURIComponent(houseSeg.replace(/\+/g, " ")).replace(/-/g, " ");
  const namePart = lastSeg.replace(/-\d+$/, "").replace(/-/g, " ");
  const q = `${house} ${namePart}`.trim();
  return q.length >= 3 ? q : null;
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
  if (!isFragranticaHost(host)) {
    throw new Error("NOT_FRAGRANTICA");
  }
  u.hash = "";
  u.search = "";
  u.protocol = "https:";
  // Actor + CDN thumbs assume www.fragrantica.com paths (regional hosts usually share paths).
  u.hostname = "www.fragrantica.com";
  const p = u.pathname.toLowerCase();
  if (!p.includes("/perfume/")) {
    throw new Error("NOT_PERFUME_URL");
  }
  return u.toString();
}

function firstUrlField(item: Record<string, unknown>): string {
  for (const key of ["url", "perfumeUrl", "canonicalUrl", "productUrl", "link"] as const) {
    const v = item[key];
    if (typeof v === "string" && v.trim().startsWith("http")) return v.trim();
  }
  return "";
}

export function mapFragranticaItem(item: Record<string, unknown>): FragranticaPreview {
  let url = firstUrlField(item);
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
  let imageUrl = extractPrimaryImageUrl(item);
  if (!imageUrl && url) imageUrl = imageUrlFromFragranticaPerfumeUrl(url);

  return {
    name,
    brand,
    notes,
    tags,
    fragranticaUrl: url,
    imageUrl,
  };
}