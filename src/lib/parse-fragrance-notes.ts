/**
 * Heuristic parsing of Fragrantica-style description / pyramid text.
 * Pattern + keyword scoring — best-effort UI hints (not a perfumer’s verdict).
 */

export type NoteLayer = { items: string[]; rawSnippet?: string };

export type WearHint = {
  label: string;
  basis: string;
  kind: "explicit" | "keyword";
};

export type ParsedFragranceDescription = {
  pyramid: {
    top: NoteLayer;
    middle: NoteLayer;
    base: NoteLayer;
  };
  wear: WearHint[];
  seasons: WearHint[];
  overview: string;
};

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function splitIngredients(clause: string): string[] {
  const cleaned = clause.replace(/\s+and\s+more\.?$/i, "").trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/\s*(?:,|;|\/|\band\b)\s*/i);
  const out: string[] = [];
  for (const p of parts) {
    const t = p.replace(/^[\d.]+\s*/, "").trim();
    if (t.length > 1 && t.length < 80) out.push(t);
  }
  return [...new Set(out)];
}

function matchLayer(text: string, re: RegExp): NoteLayer {
  const m = text.match(re);
  if (!m?.[1]) return { items: [] };
  const raw = m[1].trim();
  return { items: splitIngredients(raw), rawSnippet: raw.slice(0, 220) };
}

const RE_TOP =
  /top\s+notes?\s+(?:are|is|:)\s+([\s\S]+?)(?=\s*[;.]\s*(?:middle|heart)\s+notes?\s+(?:are|is|:)|\s*[;.]\s*base\s+notes?\s+(?:are|is|:)|$)/i;
const RE_MID =
  /(?:middle|heart)\s+notes?\s+(?:are|is|:)\s+([\s\S]+?)(?=\s*[;.]\s*base\s+notes?\s+(?:are|is|:)|$)/i;
const RE_BASE = /base\s+notes?\s+(?:are|is|:)\s+([^.]+(?:\.|$)?)/i;

const RE_TOP_SIMPLE = /top\s+notes?\s+are\s+([^.]+\.)/i;
const RE_MID_SIMPLE = /(?:middle|heart)\s+notes?\s+are\s+([^.]+\.)/i;
const RE_BASE_SIMPLE = /base\s+notes?\s+are\s+([^.]+\.)/i;

function extractPyramid(text: string) {
  let top = matchLayer(text, RE_TOP);
  let middle = matchLayer(text, RE_MID);
  let base = matchLayer(text, RE_BASE);
  if (top.items.length === 0) {
    const m = text.match(RE_TOP_SIMPLE);
    if (m?.[1]) top = { items: splitIngredients(m[1].replace(/\.$/, "")), rawSnippet: m[1] };
  }
  if (middle.items.length === 0) {
    const m = text.match(RE_MID_SIMPLE);
    if (m?.[1]) middle = { items: splitIngredients(m[1].replace(/\.$/, "")), rawSnippet: m[1] };
  }
  if (base.items.length === 0) {
    const m = text.match(RE_BASE_SIMPLE);
    if (m?.[1]) base = { items: splitIngredients(m[1].replace(/\.$/, "")), rawSnippet: m[1] };
  }
  return { top, middle, base };
}

function extractExplicitPhrases(text: string): WearHint[] {
  const out: WearHint[] = [];
  const one = normalizeSpaces(text);
  const patterns: Array<{ re: RegExp; label: (m: RegExpMatchArray) => string }> = [
    {
      re: /\b(?:best|ideal|perfect|great|suited|wonderful)\s+(?:worn|wear)\s+([^.]{4,100})/gi,
      label: (m) => `Wear: ${normalizeSpaces(m[1] ?? "")}`,
    },
    {
      re: /\b(?:best|ideal|perfect|great)\s+for\s+([^.]{4,100})/gi,
      label: (m) => `Good for: ${normalizeSpaces(m[1] ?? "")}`,
    },
    {
      re: /\b(?:for)\s+(?:the\s+)?(evening|night|daytime|day wear|office|work|summer|winter|spring|fall|autumn|cold weather|hot weather|formal|casual)(?:\s+[^.]{0,40})?/gi,
      label: (m) => `Leans toward: ${normalizeSpaces(m[0] ?? "")}`,
    },
  ];
  for (const { re, label } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(one)) !== null) {
      const l = label(m);
      if (l.length > 12) out.push({ label: l, basis: m[0].slice(0, 120), kind: "explicit" });
      if (out.length >= 6) return dedupeHints(out);
    }
  }
  return dedupeHints(out);
}

function dedupeHints(hints: WearHint[]): WearHint[] {
  const seen = new Set<string>();
  return hints.filter((h) => {
    const k = h.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const KEYWORD_WEAR: Array<{ words: RegExp; label: string }> = [
  { words: /\b(evening|night\s+out|night\s+time|after\s+dark|clubbing)\b/i, label: "Evening / night out" },
  { words: /\b(daytime|day\s+wear|office|workplace|9\s*to\s*5)\b/i, label: "Daytime / office" },
  { words: /\b(morning|brunch)\b/i, label: "Morning / casual day" },
  { words: /\b(formal|black\s*tie|gala)\b/i, label: "Formal occasions" },
  { words: /\b(casual|everyday|daily|signature)\b/i, label: "Casual / everyday" },
  { words: /\b(date\s+night|romantic)\b/i, label: "Date / romantic" },
  { words: /\b(sport|gym|workout)\b/i, label: "Active / sport" },
];

const KEYWORD_SEASON: Array<{ words: RegExp; label: string }> = [
  { words: /\b(summer|hot\s+weather|beach|tropical\s+heat)\b/i, label: "Summer / heat" },
  { words: /\b(winter|cold\s+weather|snow|freezing)\b/i, label: "Winter / cold" },
  { words: /\b(spring)\b/i, label: "Spring" },
  { words: /\b(fall|autumn)\b/i, label: "Fall" },
  { words: /\b(year[\s-]round|all\s+seasons|any\s+season|versatile)\b/i, label: "Year-round (text suggests)" },
];

function sentenceContaining(text: string, re: RegExp): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if (re.test(s)) return normalizeSpaces(s).slice(0, 160);
  }
  const m = text.match(re);
  return m ? normalizeSpaces(m[0]).slice(0, 120) : "";
}

function keywordHints(
  text: string,
  defs: Array<{ words: RegExp; label: string }>,
  kind: WearHint["kind"]
): WearHint[] {
  const out: WearHint[] = [];
  const lower = text;
  for (const { words, label } of defs) {
    if (words.test(lower)) {
      const basis = sentenceContaining(lower, words) || `Matched “${label}” in your notes`;
      out.push({ label, basis, kind });
    }
  }
  return dedupeHints(out);
}

function buildOverview(text: string, pyramidEmpty: boolean): string {
  const one = normalizeSpaces(text);
  if (!one) return "";
  const sentences = one.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  if (pyramidEmpty && sentences.length > 0) {
    return sentences.slice(0, 2).join(" ").slice(0, 420);
  }
  if (sentences[0]) return sentences[0]!.slice(0, 280);
  return one.slice(0, 280);
}

export function parseFragranceDescription(raw: string): ParsedFragranceDescription {
  const text = raw.trim();
  if (!text) {
    return {
      pyramid: { top: { items: [] }, middle: { items: [] }, base: { items: [] } },
      wear: [],
      seasons: [],
      overview: "",
    };
  }

  const pyramid = extractPyramid(text);
  const pyramidEmpty =
    pyramid.top.items.length + pyramid.middle.items.length + pyramid.base.items.length === 0;

  const explicit = extractExplicitPhrases(text);
  const wearKw = keywordHints(text, KEYWORD_WEAR, "keyword");
  const seasonKw = keywordHints(text, KEYWORD_SEASON, "keyword");

  const wear = dedupeHints([...explicit, ...wearKw]);
  const seasons = dedupeHints(seasonKw);

  return {
    pyramid,
    wear: wear.slice(0, 8),
    seasons: seasons.slice(0, 6),
    overview: buildOverview(text, pyramidEmpty),
  };
}
