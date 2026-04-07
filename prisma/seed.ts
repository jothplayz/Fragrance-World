import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { imageUrlFromFragranticaPerfumeUrl } from "../src/lib/apify-fragrantica";
import { TAG_OPTIONS } from "../src/lib/tag-options";

type SeedRow = {
  name: string;
  brand: string;
  fragranticaUrl: string;
  notes?: string;
  tags?: unknown;
  imageUrl?: string;
};

function normalizeTags(input: unknown): string {
  if (!Array.isArray(input)) return "[]";
  const ok = input.filter(
    (t): t is string => typeof t === "string" && TAG_OPTIONS.includes(t as (typeof TAG_OPTIONS)[number])
  );
  return JSON.stringify(ok);
}

const prisma = new PrismaClient();

async function main() {
  const raw = readFileSync(join(process.cwd(), "data/catalog.seed.json"), "utf8");
  const rows = JSON.parse(raw) as SeedRow[];
  if (!Array.isArray(rows)) throw new Error("catalog.seed.json must be an array");

  let n = 0;
  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const brand = typeof row.brand === "string" ? row.brand.trim() : "";
    const fragranticaUrl = typeof row.fragranticaUrl === "string" ? row.fragranticaUrl.trim() : "";
    if (!name || !brand || !fragranticaUrl) continue;
    const notes = typeof row.notes === "string" ? row.notes.trim() : "";
    const explicitImg = typeof row.imageUrl === "string" ? row.imageUrl.trim() : "";
    const imageUrl = explicitImg || imageUrlFromFragranticaPerfumeUrl(fragranticaUrl);
    await prisma.fragranceCatalog.upsert({
      where: { fragranticaUrl },
      create: {
        name,
        brand,
        notes,
        tags: normalizeTags(row.tags),
        fragranticaUrl,
        imageUrl,
      },
      update: { name, brand, notes, tags: normalizeTags(row.tags), imageUrl },
    });
    n += 1;
  }
  console.log(`Catalog seed: upserted ${n} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
