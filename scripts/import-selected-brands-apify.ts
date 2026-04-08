/**
 * Import Fragrantica catalog rows for selected brands via Apify (men + unisex only).
 * Shortens descriptions to at most two sentences.
 *
 * Usage:
 *   npx tsx scripts/import-selected-brands-apify.ts
 *   npx tsx scripts/import-selected-brands-apify.ts --per-query=35 --delay-ms=2200
 *
 * Env: APIFY_TOKEN (required). APIFY_USE_PROXY=true recommended if runs return empty.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ApifyClient } from "apify-client";
import { PrismaClient } from "@prisma/client";
import { TAG_OPTIONS } from "../src/lib/tag-options";
import {
  DEFAULT_FRAGRANTICA_ACTOR_ID,
  mapFragranticaItem,
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

/** Max two sentences; trim length for DB display. */
function summarizeNotes(raw: string, maxLen = 450): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  const sentences = oneLine.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  const two = sentences.slice(0, 2).join(" ").trim();
  return two.length > maxLen ? `${two.slice(0, maxLen - 1).trim()}…` : two;
}

function keepForMensCatalog(raw: Record<string, unknown>): boolean {
  const gender = typeof raw.gender === "string" ? raw.gender.toLowerCase() : "";
  if (gender) {
    if (gender.includes("for women and men")) return true;
    if (gender.includes("for men")) return true;
    if (gender.includes("unisex")) return true;
    if (gender.includes("for women") && !gender.includes("men")) return false;
  }
  return true;
}

function titleSuggestsWomenOnly(title: string): boolean {
  const t = title.toLowerCase();
  if (/\bfor men\b|pour homme|\bunisex\b|women and men/.test(t)) return false;
  if (/\bfor women\b|pour femme\b/.test(t)) return true;
  return false;
}

function rowIsMenOrUnisex(raw: Record<string, unknown>): boolean {
  if (!keepForMensCatalog(raw)) return false;
  const title = typeof raw.title === "string" ? raw.title : "";
  if (title && titleSuggestsWomenOnly(title)) return false;
  return true;
}

type BrandCfg = {
  id: string;
  /** Apify search queries */
  queries: string[];
  /** Keep row if Fragrantica brand matches one of these (substring, case-insensitive) */
  brandMatch: (fragranticaBrand: string) => boolean;
};

const SELECTED_BRANDS: BrandCfg[] = [
  {
    id: "dumont",
    queries: ["Dumont Paris men", "Dumont men", "Dumont perfume men"],
    brandMatch: (b) => /dumont/i.test(b),
  },
  {
    id: "arabiyat-prestige",
    queries: ["Arabiyat Prestige men", "Arabiyat Prestige", "Arabiyat Prestige unisex"],
    brandMatch: (b) => /arabiyat/i.test(b) && /prestige/i.test(b),
  },
  {
    id: "jo-milano",
    queries: ["Jo Milano men", "Joe Milano men", "Jo Milano"],
    brandMatch: (b) => /\bjo\s*milano\b|\bjoe\s*milano\b/i.test(b),
  },
  {
    id: "chanel",
    queries: ["Chanel men", "Chanel pour homme", "Chanel unisex"],
    brandMatch: (b) => /^chanel$/i.test(b.trim()) || /^chanel\b/i.test(b),
  },
  {
    id: "ysl",
    queries: ["Yves Saint Laurent men", "YSL men", "Yves Saint Laurent unisex"],
    brandMatch: (b) =>
      /yves saint laurent|^ysl$/i.test(b.trim()) || /yves\s+saint\s+laurent/i.test(b),
  },
  {
    id: "afnan",
    queries: ["Afnan men", "Afnan perfume men", "Afnan unisex"],
    brandMatch: (b) => /afnan/i.test(b),
  },
  {
    id: "french-avenue",
    queries: ["French Avenue men", "French Avenue perfume", "French Avenue unisex"],
    brandMatch: (b) => /french avenue/i.test(b),
  },
  {
    id: "rayhaan",
    queries: ["Rayhaan men", "Rayhaan perfume", "Rayhaan unisex"],
    brandMatch: (b) => /rayhaan|rayhan/i.test(b),
  },
];

function parseArgs() {
  const argv = process.argv.slice(2);
  let perQuery = 40;
  let delayMs = 2200;
  for (const a of argv) {
    if (a.startsWith("--per-query=")) perQuery = Math.max(5, Math.min(80, parseInt(a.slice(12), 10) || perQuery));
    if (a.startsWith("--delay-ms=")) delayMs = Math.max(0, parseInt(a.slice(11), 10));
  }
  return { perQuery, delayMs };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const prisma = new PrismaClient();

async function main() {
  const { perQuery, delayMs } = parseArgs();
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    console.error("Set APIFY_TOKEN in .env");
    process.exit(1);
  }

  const actorId = process.env.APIFY_FRAGRANTICA_ACTOR_ID?.trim() || DEFAULT_FRAGRANTICA_ACTOR_ID;
  const useProxy = process.env.APIFY_USE_PROXY === "true";
  const client = new ApifyClient({ token });

  let upserted = 0;
  let skipped = 0;
  let runs = 0;

  for (const cfg of SELECTED_BRANDS) {
    console.log(`\n--- Brand: ${cfg.id} ---`);
    for (const query of cfg.queries) {
      try {
        const run = await client.actor(actorId).call(
          {
            query,
            maxItems: perQuery,
            allReviews: false,
            omitFields: ["reviews"],
            proxyConfiguration: { useApifyProxy: useProxy },
          },
          { waitSecs: 300 }
        );
        runs += 1;

        if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) {
          console.warn(`  Query "${query}" → status ${run.status}`);
          continue;
        }

        const { items } = await client.dataset(run.defaultDatasetId).listItems({
          limit: perQuery + 10,
          clean: true,
        });

        for (const item of items as Record<string, unknown>[]) {
          if (!rowIsMenOrUnisex(item)) {
            skipped += 1;
            continue;
          }
          const p = mapFragranticaItem(item);
          if (!p.fragranticaUrl) continue;
          if (!cfg.brandMatch(p.brand)) {
            skipped += 1;
            continue;
          }

          const notes = summarizeNotes(p.notes);

          await prisma.fragranceCatalog.upsert({
            where: { fragranticaUrl: p.fragranticaUrl },
            create: {
              name: p.name,
              brand: p.brand,
              notes,
              tags: normalizeTags(p.tags),
              fragranticaUrl: p.fragranticaUrl,
              imageUrl: p.imageUrl ?? "",
            },
            update: {
              name: p.name,
              brand: p.brand,
              notes,
              tags: normalizeTags(p.tags),
              imageUrl: p.imageUrl ?? "",
            },
          });
          upserted += 1;
        }

        const qShort = query.length > 44 ? `${query.slice(0, 44)}…` : query;
        process.stdout.write(`  "${qShort}" → +rows so far ${upserted} (skipped ${skipped})\n`);
      } catch (e) {
        console.warn(`  Query failed "${query}":`, e instanceof Error ? e.message : e);
      }

      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const total = await prisma.fragranceCatalog.count();
  console.log(`\nDone. Upserted this run: ${upserted}, skipped (gender/brand): ${skipped}, Apify runs: ${runs}, catalog total rows: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
