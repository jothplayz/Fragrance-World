/**
 * Scrape a Fragrantica perfume page and upsert into FragranceCatalog (SQLite via Prisma).
 *
 * BeautifulSoup note: parsing is the easy part; Fragrantica often blocks scripted HTTP (Cloudflare).
 * BeautifulSoup does not fix that — you must obtain HTML first. Zero-extra-cost options:
 *
 * 1) Save page from your browser (Ctrl+S → "Webpage, HTML only" or complete), then:
 *    npm run catalog:scrape-fragrantica -- --file path/to/saved.html
 *    Optional: --url https://... if the file has no canonical/og:url
 *
 * 2) Local Playwright (free; downloads Chromium once — no Apify bill):
 *    npm run catalog:scrape-fragrantica -- --playwright "https://www.fragrantica.com/perfume/..."
 *    First time: npx playwright install chromium
 *
 * 3) Plain URL (often blocked):
 *    npm run catalog:scrape-fragrantica -- "https://..."
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import * as cheerio from "cheerio";
import { normalizeFragranticaUrl } from "../src/lib/apify-fragrantica";
import { TAG_OPTIONS } from "../src/lib/tag-options";

function loadDotEnv() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq < 1) continue;
    const k = s.slice(0, eq).trim();
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadDotEnv();

function normalizeTags(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const ok = input.filter(
    (t): t is string => typeof t === "string" && TAG_OPTIONS.includes(t as (typeof TAG_OPTIONS)[number])
  );
  return JSON.stringify(ok);
}

type ScrapedPerfume = {
  name: string;
  brand: string;
  notes: string;
  fragranticaUrl: string;
  imageUrl: string;
  tags: string;
};

function firstNonEmpty(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) return s;
  }
  return "";
}

function textOrEmpty($: cheerio.CheerioAPI, selector: string): string {
  return $(selector).first().text().replace(/\s+/g, " ").trim();
}

function attrOrEmpty($: cheerio.CheerioAPI, selector: string, attr: string): string {
  const v = $(selector).first().attr(attr);
  return typeof v === "string" ? v.trim() : "";
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
      // ignore
    }
  });
  return out;
}

function extractFromJsonLd(jsonLd: Array<Record<string, unknown>>) {
  for (const obj of jsonLd) {
    const t = obj["@type"];
    const type = typeof t === "string" ? t : Array.isArray(t) ? String(t[0] ?? "") : "";
    if (!type) continue;

    if (type.toLowerCase() === "product") {
      const name = typeof obj.name === "string" ? obj.name : "";
      const brandRaw = obj.brand;
      let brand = "";
      if (typeof brandRaw === "string") brand = brandRaw;
      if (brandRaw && typeof brandRaw === "object") {
        const bn = (brandRaw as Record<string, unknown>).name;
        if (typeof bn === "string") brand = bn;
      }
      const img = obj.image;
      const imageUrl =
        typeof img === "string"
          ? img
          : Array.isArray(img) && typeof img[0] === "string"
            ? (img[0] as string)
            : "";
      return { name: name.trim(), brand: brand.trim(), imageUrl: imageUrl.trim() };
    }
  }
  return { name: "", brand: "", imageUrl: "" };
}

function extractCanonicalFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const link = $('link[rel="canonical"]').attr("href");
  if (link && /^https?:\/\//i.test(link)) return link.trim();
  const og = $('meta[property="og:url"]').attr("content");
  if (og && /^https?:\/\//i.test(og)) return og.trim();
  return null;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const snippet = body.slice(0, 300);
    if (res.status === 403 && /just a moment/i.test(body)) {
      throw new Error("FRAGRANTICA_BLOCKED_CLOUDFLARE");
    }
    throw new Error(`HTTP_${res.status} ${res.statusText}${snippet ? `: ${snippet}` : ""}`);
  }

  return await res.text();
}

async function fetchHtmlWithPlaywright(url: string): Promise<string> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("PLAYWRIGHT_NOT_INSTALLED");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await new Promise((r) => setTimeout(r, 4000));
  } catch {
    // keep whatever HTML we have (challenge pages, partial load)
  }
  const html = await page.content();
  await browser.close();
  return html;
}

function scrapeFragranticaPerfume(html: string, fragranticaUrl: string): ScrapedPerfume {
  const $ = cheerio.load(html);

  const ogTitle = attrOrEmpty($, 'meta[property="og:title"]', "content");
  const ogImage = attrOrEmpty($, 'meta[property="og:image"]', "content");
  const docTitle = firstNonEmpty($("title").first().text());

  const jsonLd = parseJsonLd($);
  const fromLd = extractFromJsonLd(jsonLd);

  let name = fromLd.name;
  let brand = fromLd.brand;
  const imageUrl = firstNonEmpty(fromLd.imageUrl, ogImage);

  if ((!name || !brand) && (ogTitle || docTitle)) {
    const t = firstNonEmpty(ogTitle, docTitle).replace(/\s+/g, " ").trim();
    const byIdx = t.toLowerCase().lastIndexOf(" by ");
    if (byIdx > 0) {
      const left = t.slice(0, byIdx).trim();
      const right = t.slice(byIdx + 4).trim();
      if (!name) name = left;
      if (!brand) brand = right;
    } else if (!name) {
      name = t;
    }
  }

  const notes = firstNonEmpty(
    textOrEmpty($, ".cell.text-left"),
    textOrEmpty($, ".reviewstrigger"),
    ""
  ).slice(0, 2000);

  const cleanName = name.trim();
  const cleanBrand = brand.trim();
  if (!cleanName || !cleanBrand) {
    throw new Error("SCRAPE_FAILED_MISSING_NAME_OR_BRAND");
  }

  return {
    name: cleanName,
    brand: cleanBrand,
    notes: notes || "",
    fragranticaUrl,
    imageUrl: imageUrl || "",
    tags: normalizeTags([]),
  };
}

type Cli = {
  filePath: string | undefined;
  explicitUrl: string | undefined;
  usePlaywright: boolean;
  urlPositional: string | undefined;
};

function parseCli(argv: string[]): Cli {
  const filePathFlag = argv.indexOf("--file");
  const urlFlag = argv.indexOf("--url");
  let filePath: string | undefined;
  let explicitUrl: string | undefined;
  if (filePathFlag !== -1 && argv[filePathFlag + 1] && !argv[filePathFlag + 1].startsWith("-")) {
    filePath = argv[filePathFlag + 1];
  }
  if (urlFlag !== -1 && argv[urlFlag + 1] && !argv[urlFlag + 1].startsWith("-")) {
    explicitUrl = argv[urlFlag + 1];
  }
  const pwIdx = argv.indexOf("--playwright");
  const usePlaywright = pwIdx !== -1;
  const skip = new Set<number>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" || argv[i] === "--url") {
      skip.add(i);
      skip.add(i + 1);
      i++;
    }
  }
  let urlPositional: string | undefined;
  if (pwIdx !== -1 && argv[pwIdx + 1] && /^https?:\/\//i.test(argv[pwIdx + 1])) {
    urlPositional = argv[pwIdx + 1];
  }
  for (let i = 0; i < argv.length; i++) {
    if (urlPositional) break;
    if (skip.has(i)) continue;
    const a = argv[i];
    if (a === "--playwright" || a === "--help" || a === "-h") continue;
    if (!a.startsWith("-") && /^https?:\/\//i.test(a)) {
      urlPositional = a;
      break;
    }
  }
  return { filePath, explicitUrl, usePlaywright, urlPositional };
}

const prisma = new PrismaClient();

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
Usage:
  npm run catalog:scrape-fragrantica -- --file ./page.html [--url "https://..."]
  npm run catalog:scrape-fragrantica -- --playwright "https://www.fragrantica.com/perfume/..."
  npm run catalog:scrape-fragrantica -- "https://..."

No-cost HTML: save the perfume page in your browser, then use --file.
Playwright (free locally): install browsers once with: npx playwright install chromium
`);
    return;
  }

  const { filePath, explicitUrl, usePlaywright, urlPositional } = parseCli(argv);

  let html: string;
  let canonical: string;

  if (filePath) {
    const resolved = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    if (!existsSync(resolved)) {
      console.error("File not found:", resolved);
      process.exitCode = 1;
      return;
    }
    html = readFileSync(resolved, "utf8");
    const fromPage = extractCanonicalFromHtml(html);
    const urlRaw = explicitUrl ?? fromPage;
    if (!urlRaw) {
      console.error(
        "Could not find canonical URL in the HTML. Re-save the page or pass: --url \"https://www.fragrantica.com/perfume/...\""
      );
      process.exitCode = 1;
      return;
    }
    try {
      canonical = normalizeFragranticaUrl(urlRaw);
    } catch {
      console.error("Invalid Fragrantica URL (--url or <link rel=canonical>):", urlRaw);
      process.exitCode = 1;
      return;
    }
  } else {
    const urlInput = explicitUrl ?? urlPositional;
    if (!urlInput) {
      console.error(
        'Provide a Fragrantica perfume URL, or use --file. Example:\n  npm run catalog:scrape-fragrantica -- --file saved.html\n  npm run catalog:scrape-fragrantica -- --playwright "https://..."'
      );
      process.exitCode = 1;
      return;
    }
    try {
      canonical = normalizeFragranticaUrl(urlInput);
    } catch {
      console.error("Invalid Fragrantica perfume URL:", urlInput);
      process.exitCode = 1;
      return;
    }

    if (usePlaywright) {
      html = await fetchHtmlWithPlaywright(canonical);
    } else {
      html = await fetchHtml(canonical);
    }
  }

  const scraped = scrapeFragranticaPerfume(html, canonical);

  const row = await prisma.fragranceCatalog.upsert({
    where: { fragranticaUrl: scraped.fragranticaUrl },
    create: scraped,
    update: {
      name: scraped.name,
      brand: scraped.brand,
      notes: scraped.notes,
      imageUrl: scraped.imageUrl,
      tags: scraped.tags,
    },
  });

  console.log("Upserted FragranceCatalog:", {
    id: row.id,
    name: row.name,
    brand: row.brand,
    url: row.fragranticaUrl,
  });
}

main()
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "FRAGRANTICA_BLOCKED_CLOUDFLARE") {
      console.error(
        [
          "Blocked by Fragrantica (Cloudflare). Plain HTTP fetch is not enough — same for BeautifulSoup alone.",
          "Free options:",
          "  • Save the page in your browser, then: npm run catalog:scrape-fragrantica -- --file saved.html",
          "  • Or install Playwright browsers and retry: npx playwright install chromium",
          "    then: npm run catalog:scrape-fragrantica -- --playwright \"<perfume url>\"",
        ].join("\n")
      );
      process.exitCode = 2;
      return;
    }
    if (msg === "PLAYWRIGHT_NOT_INSTALLED") {
      console.error("Install Playwright: npm install && npx playwright install chromium");
      process.exitCode = 1;
      return;
    }
    console.error(msg);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
