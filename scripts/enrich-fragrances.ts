/**
 * Backfill or refresh `Fragrance.enrichmentJson` (Fragrantica via Apify when URL+token, Wikipedia otherwise).
 *
 * Usage:
 *   npx tsx scripts/enrich-fragrances.ts --all
 *   npx tsx scripts/enrich-fragrances.ts --id=<cuid>
 *   npx tsx scripts/enrich-fragrances.ts --all --force
 * Optional: --delay-ms=800 between rows (--all) to be gentle on Wikipedia.
 * Fast / no Apify: --wikipedia-only
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { enrichFragranceRecord } from "../src/lib/enrich-fragrance";
import { prisma } from "../src/lib/db";

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const all = process.argv.includes("--all");
  const force = process.argv.includes("--force");
  const wikipediaOnly = process.argv.includes("--wikipedia-only");
  const id = argValue("--id");
  const delayMs = Math.max(0, Number(argValue("--delay-ms") ?? "600") || 0);
  const enrichOpts = { force, wikipediaOnly } as const;

  if (all === Boolean(id)) {
    console.error("Specify exactly one of: --all  or  --id=<fragranceId>");
    process.exit(1);
  }

  if (id) {
    await enrichFragranceRecord(id, { ...enrichOpts });
    console.log(`Done: ${id}`);
    return;
  }

  const rows = await prisma.fragrance.findMany({ select: { id: true, name: true, brand: true } });
  console.log(`Enriching ${rows.length} fragrance(s)…`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    process.stdout.write(`[${i + 1}/${rows.length}] ${r.brand} — ${r.name}… `);
    try {
      await enrichFragranceRecord(r.id, { ...enrichOpts });
      console.log("ok");
    } catch (e) {
      console.log(e instanceof Error ? e.message : "error");
    }
    if (i < rows.length - 1 && delayMs > 0) await sleep(delayMs);
  }
  console.log("Finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
