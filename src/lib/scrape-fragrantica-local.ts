import * as cheerio from "cheerio";
import type { FragranticaPreview } from "./apify-fragrantica";
import { imageUrlFromFragranticaPerfumeUrl } from "./apify-fragrantica";
import { SEASON_OPTIONS, type Season } from "./season-options";
import { inferOccasions } from "./infer-occasions";
import { inferTags } from "./infer-tags";
import { newFragranticaContext } from "./fragrantica-browser";

function firstNonEmpty(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

function parseJsonLd($: cheerio.CheerioAPI): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") out.push(item as Record<string, unknown>);
        }
        return;
      }
      if (parsed && typeof parsed === "object") out.push(parsed as Record<string, unknown>);
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return out;
}

function extractFromJsonLd(jsonLd: Array<Record<string, unknown>>) {
  for (const obj of jsonLd) {
    const t = obj["@type"];
    const type = typeof t === "string" ? t : Array.isArray(t) ? String(t[0] ?? "") : "";
    if (type.toLowerCase() !== "product") continue;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const brandRaw = obj.brand;
    let brand = "";
    if (typeof brandRaw === "string") brand = brandRaw.trim();
    if (brandRaw && typeof brandRaw === "object") {
      const bn = (brandRaw as Record<string, unknown>).name;
      if (typeof bn === "string") brand = bn.trim();
    }
    const img = obj.image;
    const imageUrl =
      typeof img === "string"
        ? img.trim()
        : Array.isArray(img) && typeof img[0] === "string"
          ? (img[0] as string).trim()
          : "";
    return { name, brand, imageUrl };
  }
  return { name: "", brand: "", imageUrl: "" };
}

function extractLongevity(html: string): "short" | "moderate" | "long" | "" {
  const levels = [
    { label: "poor", tier: 1 },
    { label: "weak", tier: 2 },
    { label: "moderate", tier: 3 },
    { label: "long lasting", tier: 4 },
    { label: "eternal", tier: 5 },
  ] as const;
  let bestPct = 0;
  let bestTier = 0;
  for (const { label, tier } of levels) {
    const re = new RegExp(`>${label}</span>[\\s\\S]{0,400}?width:\\s*([\\d.]+)%`, "i");
    const m = html.match(re);
    if (m) {
      const pct = parseFloat(m[1]!);
      if (pct > bestPct) { bestPct = pct; bestTier = tier; }
    }
  }
  if (bestPct === 0) return "";
  if (bestTier <= 2) return "short";
  if (bestTier === 3) return "moderate";
  return "long";
}

function extractSeasons(html: string): Season[] {
  const scores: Record<Season, number> = { spring: 0, summer: 0, fall: 0, winter: 0 };
  for (const season of SEASON_OPTIONS) {
    // Each season label is followed by a progress bar div with style="width: X%"
    const re = new RegExp(`>${season}</span>[\\s\\S]{0,400}?width:\\s*([\\d.]+)%`, "i");
    const m = html.match(re);
    if (m) scores[season] = parseFloat(m[1]!);
  }
  const max = Math.max(...Object.values(scores));
  if (max === 0) return [];
  // Include seasons that are at least 30% of the top season
  return SEASON_OPTIONS.filter((s) => scores[s] / max >= 0.3);
}

function brandFromUrl(canonicalUrl: string): string {
  try {
    const pathname = new URL(canonicalUrl).pathname;
    // /perfume/Brand-Name/Perfume-Name-12345.html
    const seg = pathname.split("/").filter(Boolean)[1];
    if (seg) return decodeURIComponent(seg).replace(/-/g, " ").trim();
  } catch { /* ignore */ }
  return "";
}

function htmlToPreview(html: string, canonicalUrl: string): FragranticaPreview {
  const $ = cheerio.load(html);
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim() ?? "";
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  const docTitle = $("title").first().text().trim();

  // 1. Microdata (current Fragrantica structure)
  const microdataBrand = $('[itemprop="brand"] [itemprop="name"]').first().text().replace(/\s+/g, " ").trim();
  const microdataFullName = $('h1[itemprop="name"]').first().text().replace(/\s+/g, " ").trim();

  let brand = microdataBrand;
  let name = "";

  if (microdataFullName && brand) {
    // H1 contains "Perfume Name Brand Name" — strip brand suffix to get just the name
    const stripped = microdataFullName.replace(new RegExp(`\\s*${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*.*$`, "i"), "").trim();
    name = stripped || microdataFullName;
  } else if (microdataFullName) {
    name = microdataFullName;
  }

  // 2. JSON-LD fallback
  if (!name || !brand) {
    const jsonLd = parseJsonLd($);
    const fromLd = extractFromJsonLd(jsonLd);
    if (!name) name = fromLd.name;
    if (!brand) brand = fromLd.brand;
  }

  // 3. og:title / <title> fallback — Fragrantica format: "Name Brand perfume - a fragrance for …"
  if (!name || !brand) {
    const t = firstNonEmpty(ogTitle, docTitle).replace(/\s+/g, " ").trim();
    // Strip trailing "perfume - a fragrance for women/men/…"
    const stripped = t.replace(/\s+perfume\b.*/i, "").trim();
    const byIdx = stripped.toLowerCase().lastIndexOf(" by ");
    if (byIdx > 0) {
      if (!name) name = stripped.slice(0, byIdx).trim();
      if (!brand) brand = stripped.slice(byIdx + 4).trim();
    } else if (!name) {
      name = stripped || t;
    }
  }

  // 4. Brand from URL path as last resort
  if (!brand) brand = brandFromUrl(canonicalUrl);

  // Clean up
  name = name.replace(/\s+perfume\b.*/i, "").trim();

  const imageUrl = firstNonEmpty(imageUrlFromFragranticaPerfumeUrl(canonicalUrl), ogImage);

  // Notes: try multiple selectors Fragrantica has used over time
  const notes = firstNonEmpty(
    $('[itemprop="description"]').first().text().replace(/\s+/g, " ").trim(),
    $(".cell.text-left").first().text().replace(/\s+/g, " ").trim(),
    $(".fragrantica-description").first().text().replace(/\s+/g, " ").trim(),
    ""
  ).slice(0, 4000);

  if (!name || !brand) throw new Error("SCRAPE_FAILED_MISSING_NAME_OR_BRAND");

  const seasons = extractSeasons(html);
  const longevity = extractLongevity(html);
  const tags = inferTags(html, notes);
  const occasions = inferOccasions(tags, seasons, notes);

  return { name, brand, notes, tags, seasons, longevity, occasions, fragranticaUrl: canonicalUrl, imageUrl };
}

export async function scrapeFragranticaUrl(url: string): Promise<FragranticaPreview> {
  const context = await newFragranticaContext();

  let html = "";
  try {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      // Wait for the real page (h1 microdata) — survives the Cloudflare
      // challenge redirect and returns as soon as content is up.
      await page.waitForSelector('h1[itemprop="name"]', { timeout: 15_000 });
      // Season/longevity vote bars hydrate client-side after the h1 exists;
      // extractSeasons/extractLongevity read their inline width styles.
      await page.waitForSelector('span:text-is("winter")', { timeout: 6_000 }).catch(() => {});
    } catch {
      // keep whatever HTML we have
    }
    html = await page.content();
  } finally {
    await context.close();
  }

  if (/just a moment/i.test(html) && html.length < 15_000) {
    throw new Error(
      "CLOUDFLARE_BLOCKED: Fragrantica blocked the automated request. " +
      "Open the page in your browser, save it (File → Save Page As → HTML only), " +
      "then use the manual file import option."
    );
  }

  return htmlToPreview(html, url);
}
