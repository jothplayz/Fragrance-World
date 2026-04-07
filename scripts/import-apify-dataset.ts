/**
 * Import Fragrantica-shaped rows from Apify into FragranceCatalog (local SQLite).
 *
 * Use when data lives in Apify Storage (you ran the actor on apify.com) or you exported JSON.
 *
 *   npm run catalog:import-dataset -- <datasetId>
 *   npm run catalog:import-dataset -- --run=<actorRunId>
 *   npm run catalog:import-dataset -- --file=data/my-dataset.json
 *
 * Or set APIFY_DATASET_ID in .env and run: npm run catalog:import-dataset
 *
 * Dataset ID: Apify Console → Storage → Datasets → ID (e.g. abc123...).
 * Run ID: open a finished actor run → copy Run ID → use --run=...
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApifyClient } from "apify-client";
import { PrismaClient } from "@prisma/client";
import { TAG_OPTIONS } from "../src/lib/tag-options";
import { mapFragranticaItem } from "../src/lib/apify-fragrantica";

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

function parseLocalItemsFile(absPath: string): Record<string, unknown>[] {
  const raw = readFileSync(absPath, "utf8").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    const a = JSON.parse(raw) as unknown;
    return Array.isArray(a) ? (a as Record<string, unknown>[]) : [];
  }
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as Record<string, unknown>);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

async function fetchAllDatasetItems(client: ApifyClient, datasetId: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const res = await client.dataset(datasetId).listItems({ offset, limit, clean: true });
    const batch = res.items as Record<string, unknown>[];
    out.push(...batch);
    const total = res.total ?? batch.length;
    if (batch.length === 0 || out.length >= total) break;
    offset += limit;
  }
  return out;
}

const prisma = new PrismaClient();

async function main() {
  const argv = process.argv.slice(2);
  let datasetId = process.env.APIFY_DATASET_ID?.trim() || "";
  let runId = "";
  let filePath = "";

  for (const a of argv) {
    if (a.startsWith("--dataset=")) datasetId = a.slice(10).trim();
    else if (a.startsWith("--run=")) runId = a.slice(6).trim();
    else if (a.startsWith("--file=")) filePath = a.slice(7).trim();
    else if (!a.startsWith("-") && a.length > 0) datasetId = a.trim();
  }

  let items: Record<string, unknown>[] = [];

  if (filePath) {
    const abs = resolve(process.cwd(), filePath);
    if (!existsSync(abs)) {
      console.error("File not found:", abs);
      process.exit(1);
    }
    items = parseLocalItemsFile(abs);
    console.log(`Loaded ${items.length} rows from ${abs}`);
  } else {
    const token = process.env.APIFY_TOKEN?.trim();
    if (!token) {
      console.error("Set APIFY_TOKEN in .env (or use --file= for a local export).");
      process.exit(1);
    }
    const client = new ApifyClient({ token });

    if (runId) {
      const run = await client.run(runId).get();
      if (!run?.defaultDatasetId) {
        console.error("Run has no defaultDatasetId. Status:", run?.status);
        process.exit(1);
      }
      datasetId = run.defaultDatasetId;
      console.log("Using dataset from run", runId, "→", datasetId);
    }

    if (!datasetId) {
      console.error(`Usage:
  npm run catalog:import-dataset -- <datasetId>
  npm run catalog:import-dataset -- --run=<actorRunId>
  npm run catalog:import-dataset -- --file=data/export.json

Or set APIFY_DATASET_ID in .env`);
      process.exit(1);
    }

    items = await fetchAllDatasetItems(client, datasetId);
    console.log(`Fetched ${items.length} items from Apify dataset ${datasetId}`);
  }

  if (items.length === 0) {
    console.error("No items to import.");
    process.exit(1);
  }

  let n = 0;
  for (const item of items) {
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
        imageUrl: p.imageUrl ?? "",
      },
      update: {
        name: p.name,
        brand: p.brand,
        notes: p.notes,
        tags: normalizeTags(p.tags),
        imageUrl: p.imageUrl ?? "",
      },
    });
    n += 1;
  }

  const total = await prisma.fragranceCatalog.count();
  console.log(`Upserted ${n} catalog rows (${items.length} source items). FragranceCatalog total: ${total}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
