/**
 * Bulk-import perfume pages into FragranceCatalog via Apify (same actor as the app).
 * Usage: ensure .env has APIFY_TOKEN, then add Fragrantica URLs to data/catalog-urls.txt (one per line).
 * Run: npm run catalog:import-urls
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ApifyClient } from "apify-client";
import { PrismaClient } from "@prisma/client";
import { TAG_OPTIONS } from "../src/lib/tag-options";
import {
  DEFAULT_FRAGRANTICA_ACTOR_ID,
  mapFragranticaItem,
  normalizeFragranticaUrl,
} from "../src/lib/apify-fragrantica";

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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
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

const prisma = new PrismaClient();

async function main() {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    console.error("Set APIFY_TOKEN in .env");
    process.exit(1);
  }

  const listPath = join(process.cwd(), "data/catalog-urls.txt");
  if (!existsSync(listPath)) {
    console.error("Create data/catalog-urls.txt with one Fragrantica perfume URL per line.");
    process.exit(1);
  }

  const lines = readFileSync(listPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const startUrls: { url: string }[] = [];
  for (const line of lines) {
    try {
      startUrls.push({ url: normalizeFragranticaUrl(line) });
    } catch {
      console.warn("Skip invalid URL:", line);
    }
  }

  if (startUrls.length === 0) {
    console.error("No valid Fragrantica URLs in catalog-urls.txt");
    process.exit(1);
  }

  const actorId =
    process.env.APIFY_FRAGRANTICA_ACTOR_ID?.trim() || DEFAULT_FRAGRANTICA_ACTOR_ID;
  const useProxy = process.env.APIFY_USE_PROXY === "true";
  const client = new ApifyClient({ token });

  const run = await client.actor(actorId).call(
    {
      startUrls,
      maxItems: startUrls.length,
      allReviews: false,
      omitFields: ["reviews", "images"],
      proxyConfiguration: { useApifyProxy: useProxy },
    },
    { waitSecs: 300 }
  );

  if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) {
    console.error("Apify run failed:", run.status);
    process.exit(1);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: 500,
    clean: true,
  });

  let n = 0;
  for (const item of items as Record<string, unknown>[]) {
    const p = mapFragranticaItem(item);
    if (!p.fragranticaUrl) continue;
    await prisma.fragranceCatalog.upsert({
      where: { fragranticaUrl: p.fragranticaUrl },
      create: {
        name: p.name,
        brand: p.brand,
        notes: p.notes,
        tags: normalizeTags(p.tags),
        fragranticaUrl: p.fragranticaUrl,
      },
      update: {
        name: p.name,
        brand: p.brand,
        notes: p.notes,
        tags: normalizeTags(p.tags),
      },
    });
    n += 1;
  }

  console.log(`Imported ${n} catalog rows from Apify.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
