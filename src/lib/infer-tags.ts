import type { FragranceTag } from "./tag-options";

// Maps accord/note keywords → tag family.
// Ordered from most-specific to least so first-match wins per word.
const KEYWORD_MAP: Array<[RegExp, FragranceTag]> = [
  // aquatic before fresh (more specific)
  [/\b(aquatic|marine|ocean|sea\s*salt|ozonic|ozone|watery|ocean\s*breeze)\b/i, "aquatic"],
  // citrus
  [/\b(citrus|bergamot|lemon|lime|grapefruit|mandarin|tangerine|yuzu|orange\s*peel|neroli)\b/i, "citrus"],
  // fresh — description-level words
  [/\b(fresh|clean|airy|crisp|light\s*fresh|freshness)\b/i, "fresh"],
  // floral
  [/\b(floral|rose|jasmine|lily|violet\s*(leaf|flower)?|iris|peony|geranium|magnolia|tuberose|ylang|narcissus|mimosa|freesia|lily.of.the.valley|orange\s*blossom|white\s*floral|flower)\b/i, "floral"],
  // green
  [/\b(green|grass|fern|basil|herb(al)?|mint|sage|tea|tomato\s*leaf|violet\s*leaf|galbanum|artemisia|tarragon)\b/i, "green"],
  // woody
  [/\b(wood(y|s)?|cedar|cedarwood|sandalwood|vetiver|patchouli|oakmoss|pine|fir|juniper|oud|agarwood|birch|guaiac|iso\s*e\s*super|amyris)\b/i, "woody"],
  // amber / resinous
  [/\b(amber|labdanum|benzoin|copal|olibanum|frankincense|balsam(ic)?|resin(ous)?|myrrh|elemi|styrax|castoreum)\b/i, "amber"],
  // gourmand / sweet
  [/\b(vanilla|caramel|chocolate|honey|tonka|praline|almond|sugar|marzipan|rum|butterscotch|hazelnut|gourmand|sweet|fruity|fruit|peach|apple|pear|berry|raspberry|strawberry|plum)\b/i, "gourmand"],
  // spicy
  [/\b(pepper|black\s*pepper|cardamom|cinnamon|clove|nutmeg|ginger|saffron|cumin|bay\s*leaf|allspice|leather|tobacco|smoke|smoky|incense|papyrus|labdanum)\b/i, "spicy"],
  // musk
  [/\b(musk(y)?|ambrette|ambrox|ambroxan|cashmeran|skin\s*musk|white\s*musk|clean\s*musk|ambergris|powdery|powder)\b/i, "musk"],
];

// Also map fragrance family phrases (e.g. "a Floral Woody fragrance")
const FAMILY_MAP: Array<[RegExp, FragranceTag]> = [
  [/\bfloral\b/i, "floral"],
  [/\bcitrus\b/i, "citrus"],
  [/\bwoody\b/i, "woody"],
  [/\b(oriental|amber(y|ic)?)\b/i, "amber"],
  [/\baquatic\b/i, "aquatic"],
  [/\bfresh\b/i, "fresh"],
  [/\bgreen\b/i, "green"],
  [/\b(gourmand|sweet)\b/i, "gourmand"],
  [/\bspic(y|ed)\b/i, "spicy"],
  [/\bmusky\b/i, "musk"],
];

// Maps Fragrantica accord names (from the /accords-search/ URL) → tag family.
const ACCORD_TO_TAG: Record<string, FragranceTag> = {
  // fresh/aquatic
  fresh: "fresh",
  "fresh spicy": "fresh",
  aquatic: "aquatic",
  marine: "aquatic",
  ozonic: "aquatic",
  water: "aquatic",
  // citrus
  citrus: "citrus",
  "citrus aromatic": "citrus",
  // floral
  floral: "floral",
  rose: "floral",
  violet: "floral",
  "white floral": "floral",
  iris: "floral",
  jasmine: "floral",
  // green
  green: "green",
  herbal: "green",
  aromatic: "green",
  mossy: "green",
  earthy: "green",
  "soft spicy": "spicy",
  // woody
  woody: "woody",
  woods: "woody",
  wood: "woody",
  oud: "woody",
  cedar: "woody",
  sandalwood: "woody",
  patchouli: "woody",
  smoky: "woody",
  // amber/resinous
  amber: "amber",
  balsamic: "amber",
  resinous: "amber",
  warm: "amber",
  "warm spicy": "amber",
  oriental: "amber",
  "soft oriental": "amber",
  // gourmand
  sweet: "gourmand",
  vanilla: "gourmand",
  gourmand: "gourmand",
  fruity: "gourmand",
  honey: "gourmand",
  chocolate: "gourmand",
  caramel: "gourmand",
  // spicy
  spicy: "spicy",
  cinnamon: "spicy",
  leather: "spicy",
  tobacco: "spicy",
  "fresh aromatic": "fresh",
  // musk
  musky: "musk",
  musk: "musk",
  powdery: "musk",
  soft: "musk",
};

/** Parse accord names + percentages from Fragrantica's /accords-search/ URL in the HTML. */
export function extractAccordsFromHtml(html: string): Record<string, number> {
  const m = html.match(/href="\/accords-search\/\?([^"]+f_from_perfume_id[^"]+)"/);
  if (!m) return {};
  const raw = m[1]!.replace(/&amp;/g, "&");
  const result: Record<string, number> = {};
  for (const part of raw.split("&")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 1) continue;
    const key = decodeURIComponent(part.slice(0, eqIdx).replace(/\+/g, " ")).toLowerCase().trim();
    const val = parseFloat(part.slice(eqIdx + 1));
    if (key && !key.startsWith("f_") && !isNaN(val)) result[key] = val;
  }
  return result;
}

/** Convert Fragrantica accord map → sorted tag array (highest accord % first). */
export function accordsToTags(accords: Record<string, number>): FragranceTag[] {
  const tagScores: Partial<Record<FragranceTag, number>> = {};
  for (const [accord, pct] of Object.entries(accords)) {
    const tag = ACCORD_TO_TAG[accord];
    if (tag) tagScores[tag] = (tagScores[tag] ?? 0) + pct;
  }
  return (Object.entries(tagScores) as [FragranceTag, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

/** Keyword-based tag extraction from notes/description text. Returns tags in match-count order. */
export function inferTagsFromNotes(notes: string): FragranceTag[] {
  const counts: Partial<Record<FragranceTag, number>> = {};
  const words = notes.toLowerCase();

  // Score from ingredient keywords (each hit counts once)
  for (const [pattern, tag] of KEYWORD_MAP) {
    const matches = words.match(new RegExp(pattern.source, "gi"));
    if (matches) counts[tag] = (counts[tag] ?? 0) + matches.length;
  }

  // Small bonus from fragrance family phrases
  for (const [pattern, tag] of FAMILY_MAP) {
    if (pattern.test(notes)) counts[tag] = (counts[tag] ?? 0) + 0.5;
  }

  return (Object.entries(counts) as [FragranceTag, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

/** Primary entry point: use HTML accords if available, fall back to notes text. */
export function inferTags(html: string, notes: string): FragranceTag[] {
  const accords = extractAccordsFromHtml(html);
  if (Object.keys(accords).length >= 2) return accordsToTags(accords);
  return inferTagsFromNotes(notes);
}
