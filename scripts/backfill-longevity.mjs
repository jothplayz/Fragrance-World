// One-shot script: scrapes longevity from Fragrantica for every fragrance
// in the collection that doesn't have it set yet.
// Run with: node scripts/backfill-longevity.mjs

import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function extractLongevity(html) {
  const levels = [
    { label: "poor", tier: 1 },
    { label: "weak", tier: 2 },
    { label: "moderate", tier: 3 },
    { label: "long lasting", tier: 4 },
    { label: "eternal", tier: 5 },
  ];
  let bestPct = 0;
  let bestTier = 0;
  for (const { label, tier } of levels) {
    const re = new RegExp(`>${label}</span>[\\s\\S]{0,400}?width:\\s*([\\d.]+)%`, "i");
    const m = html.match(re);
    if (m) {
      const pct = parseFloat(m[1]);
      if (pct > bestPct) { bestPct = pct; bestTier = tier; }
    }
  }
  if (bestPct === 0) return "";
  if (bestTier <= 2) return "short";
  if (bestTier === 3) return "moderate";
  return "long";
}

async function main() {
  const fragrances = await prisma.fragrance.findMany({
    where: { fragranticaUrl: { not: "" } },
    select: { id: true, name: true, brand: true, fragranticaUrl: true, longevity: true },
  });

  const pending = fragrances.filter((f) => !f.longevity);
  console.log(`Found ${pending.length} fragrances needing longevity data.\n`);
  if (pending.length === 0) { await prisma.$disconnect(); return; }

  // headless:false is required — Cloudflare blocks headless/automated browsers.
  // A visible window passes the JS challenge automatically.
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  for (const f of pending) {
    process.stdout.write(`  ${f.brand} – ${f.name} … `);
    const page = await context.newPage();
    try {
      await page.goto(f.fragranticaUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });

      // If Cloudflare challenge page, wait up to 15s for it to auto-resolve
      let html = await page.content();
      if (/just a moment/i.test(html) && html.length < 15_000) {
        process.stdout.write("(CF wait) ");
        await page.waitForTimeout(12000);
        html = await page.content();
      }

      // Additional settle time for vote bars to render
      await page.waitForTimeout(4000);
      html = await page.content();

      if (/just a moment/i.test(html) && html.length < 15_000) {
        console.log("BLOCKED by Cloudflare — skipping");
        continue;
      }

      const longevity = extractLongevity(html);
      if (longevity) {
        await prisma.fragrance.update({ where: { id: f.id }, data: { longevity } });
        console.log(`✓ ${longevity}`);
      } else {
        console.log("no longevity data found");
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    } finally {
      await page.close();
    }
    // Random pause 3–6s between requests
    const delay = 3000 + Math.floor(Math.random() * 3000);
    await new Promise((r) => setTimeout(r, delay));
  }

  await browser.close();
  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
