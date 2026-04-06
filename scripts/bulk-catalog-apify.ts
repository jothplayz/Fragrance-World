/**
 * Bulk-fill FragranceCatalog via the Apify Fragrantica actor (same integration as the app).
 * This is the supported way to pull large amounts of Fragrantica-shaped data without bypassing their bot protection.
 *
 * Usage (from repo root):
 *   npx tsx scripts/bulk-catalog-apify.ts --target=10000 --delay-ms=2500 --per-query=40
 *
 * Env: APIFY_TOKEN (required), APIFY_USE_PROXY=true optional, APIFY_FRAGRANTICA_ACTOR_ID optional.
 * Extra lines: data/apify-search-queries.txt (one query per line) are merged with built-in queries.
 *
 * Apify runs are billable; throttling reduces rate-limit risk. Men's filter drops rows whose gender is women-only when present.
 */
import { readFileSync, existsSync } from "node:fs";
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

/** Drop clear women-only entries when actor provides gender. */
function keepForMensCatalog(raw: Record<string, unknown>): boolean {
  const gender = typeof raw.gender === "string" ? raw.gender.toLowerCase() : "";
  if (!gender) return true;
  if (gender.includes("for women and men")) return true;
  if (gender.includes("for men")) return true;
  if (gender.includes("unisex")) return true;
  if (gender.includes("for women") && !gender.includes("men")) return false;
  return true;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let target = 10_000;
  let delayMs = 2_500;
  let perQuery = 40;
  let mensOnly = true;
  for (const a of argv) {
    if (a.startsWith("--target=")) target = Math.max(1, parseInt(a.slice(9), 10) || target);
    if (a.startsWith("--delay-ms=")) delayMs = Math.max(0, parseInt(a.slice(11), 10));
    if (a.startsWith("--per-query=")) perQuery = Math.max(1, Math.min(200, parseInt(a.slice(12), 10) || perQuery));
    if (a === "--all-genders") mensOnly = false;
  }
  return { target, delayMs, perQuery, mensOnly };
}

function builtInQueries(): string[] {
  const brands = [
    "Dior",
    "Chanel",
    "Hermes",
    "Yves Saint Laurent",
    "Tom Ford",
    "Creed",
    "Giorgio Armani",
    "Versace",
    "Prada",
    "Dolce Gabbana",
    "Paco Rabanne",
    "Jean Paul Gaultier",
    "Givenchy",
    "Guerlain",
    "Cartier",
    "Bvlgari",
    "Burberry",
    "Hugo Boss",
    "Calvin Klein",
    "Ralph Lauren",
    "Montblanc",
    "Mugler",
    "Issey Miyake",
    "Kenzo",
    "Lalique",
    "Lancôme",
    "Lancome",
    "Viktor Rolf",
    "Maison Francis Kurkdjian",
    "Parfums de Marly",
    "Initio",
    "Xerjoff",
    "Amouage",
    "Clive Christian",
    "Roja Dove",
    "Penhaligons",
    "Acqua di Parma",
    "Valentino",
    "Gucci",
    "Bottega Veneta",
    "Balenciaga",
    "Hermetica",
    "Mancera",
    "Montale",
    "Nasomatto",
    "Orto Parisi",
    "Tiziana Terenzi",
    "Nishane",
    "Zaharoff",
    "D.S. Durga",
    "Le Labo",
    "Byredo",
    "Diptyque",
    "Jo Malone",
    "Maison Margiela",
    "Serge Lutens",
    "Frederic Malle",
    "Kilian",
    "Parfums MDCI",
    "Stephane Humbert Lucas",
    "Pierre Guillaume",
    "Etat Libre d Orange",
    "Heeley",
    "Jovoy",
    "LArtisan Parfumeur",
    "Comme des Garcons",
    "CdG",
    "Zadig Voltaire",
    "Mercedes Benz",
    "Bentley",
    "Ferrari",
    "Jaguar",
    "Azzaro",
    "Jacques Bogart",
    "Davidoff",
    "Dunhill",
    "Alfred Dunhill",
    "English Laundry",
    "John Varvatos",
    "Michael Kors",
    "Coach",
    "Guess",
    "Sean John",
    "Nautica",
    "Perry Ellis",
    "Tommy Hilfiger",
    "Lacoste",
    "Adidas",
    "Puma",
    "Brioni",
    "Ermenegildo Zegna",
    "Zegna",
    "Carolina Herrera",
    "Paco",
    "Mercedes",
    "Mercedes-Benz",
    "Mercedes Benz",
    "Mercedes-Benz Club",
    "Mercedes-Benz Select",
    "Bentley Infinite",
    "Bentley for Men",
    "Diesel",
    "Dsquared2",
    "Iceberg",
    "Trussardi",
    "Etro",
    "Moschino",
    "Roberto Cavalli",
    "Salvatore Ferragamo",
    "Ferragamo",
    "Tiffany",
    "Van Cleef Arpels",
    "Van Cleef",
    "Boucheron",
    "Chopard",
    "David Yurman",
    "Hermès",
    "Maison Alhambra",
    "Armaf",
    "Lattafa",
    "Rasasi",
    "Ajmal",
    "Al Haramain",
    "Swiss Arabian",
    "Alexandre J",
    "Jeroboam",
    "Jusbox",
    "Eight Bob",
    "Escentric Molecules",
    "Molecule 01",
    "Histoires de Parfums",
    "Juliette Has a Gun",
    "Maison Crivelli",
    "Maison Tahite",
    "Marc-Antoine Barrois",
    "Mizensir",
    "Olfactive Studio",
    "Oman Luxury",
    "Parfums de Marly",
    "Perris Monte Carlo",
    "Phlur",
    "Profumum Roma",
    "Ramon Monegal",
    "Salle Privee",
    "Simone Andreoli",
    "Spirit of Dubai",
    "The Spirit of Dubai",
    "V Canto",
    "Vilhelm Parfumerie",
    "West Third Brand",
    "Zoologist",
    "4160 Tuesdays",
    "Aedes de Venustas",
    "Affinessence",
    "Alaia",
    "Alfred Sung",
    "Al Rehab",
    "Al Wataniah",
    "Andy Tauer",
    "Annick Goutal",
    "Antonio Banderas",
    "Antonio Puig",
    "Ariana Grande",
    "Armaf Club de Nuit",
    "Atelier Cologne",
    "Atkinsons",
    "Atelier des Ors",
    "Au Pays de la Fleur d Oranger",
    "Avon",
    "Azzaro Chrome",
    "Azzaro Wanted",
    "Banana Republic",
    "Barrister and Mann",
    "Batiste",
    "Beaufort London",
    "Ben Sherman",
    "Berdoues",
    "Bharara",
    "Billie Eilish",
    "Billy Jealousy",
    "Blauer",
    "Bond No 9",
    "Britney Spears",
    "Brooks Brothers",
    "Bruno Banani",
    "BURBERRY",
    "Burberry Brit",
    "Burberry Hero",
    "Cacharel",
    "Cafe Parfums",
    "Cerruti",
    "Cerruti 1881",
    "Chevignon",
    "Chloe",
    "Chopard Oud",
    "Christian Audigier",
    "Clinique",
    "Coach for Men",
    "Cologne Indelebile",
    "Costume National",
    "Cuba Paris",
    "Custo Barcelona",
    "Czech Speake",
    "Daniel Hechter",
    "David Beckham",
    "David Yurman",
    "Demeter",
    "Desigual",
    "Donald Trump",
    "Drakkar Noir",
    "Dunhill Icon",
    "Escada",
    "Estee Lauder",
    "Etienne Aigner",
    "Ex Nihilo",
    "Faberge",
    "Faconnable",
    "Fendi",
    "Fragonard",
    "Gai Mattiolo",
    "Gilles Cantuel",
    "Glenn Perri",
    "Gres",
    "Guy Laroche",
    "Halston",
    "Halloween",
    "Harley Davidson",
    "Hollister",
    "Houbigant",
    "Hummer",
    "Isaac Mizrahi",
    "J del Pozo",
    "Jaguar Classic",
    "James Bond 007",
    "Jesus del Pozo",
    "Jil Sander",
    "Jimmy Choo",
    "John Richmond",
    "Joop",
    "Jovan",
    "Juicy Couture",
    "Justin Bieber",
    "Karl Lagerfeld",
    "Kate Spade",
    "Keith Urban",
    "Kenneth Cole",
    "Kenzo Homme",
    "Kylie Minogue",
    "Lagerfeld",
    "Lamborghini",
    "Laura Biagiotti",
    "Le Couvent",
    "Liz Claiborne",
    "Loewe",
    "Lolita Lempicka",
    "Lorenzo Villoresi",
    "Lulu Castagnette",
    "Mandarina Duck",
    "Marc Jacobs",
    "Marina de Bourbon",
    "Masaki Matsushima",
    "Masque Milano",
    "Mauboussin",
    "McQueen",
    "Mexx",
    "Michael Jordan",
    "Missoni",
    "Molyneux",
    "Moresque",
    "Muelhens",
    "Narciso Rodriguez",
    "Nicki Minaj",
    "Nick Jonas",
    "Nicole Miller",
    "Nikos",
    "Nine West",
    "O Boticario",
    "Oscar de la Renta",
    "Pacha Ibiza",
    "Pal Zileri",
    "Paris Hilton",
    "Paul Sebastian",
    "Paul Smith",
    "Phat Farm",
    "Playboy",
    "Police",
    "Porsche Design",
    "Princesse Marina de Bourbon",
    "Replay",
    "Revlon",
    "Reyane",
    "Richard James",
    "Robert Piguet",
    "Rochas",
    "Roger Gallet",
    "S Oliver",
    "Salvador Dali",
    "Sarah Jessica Parker",
    "Sean Combs",
    "Shakira",
    "Shiseido",
    "Slava Zaitsev",
    "Sonia Rykiel",
    "St Dupont",
    "Stetson",
    "Swarovski",
    "Tabac",
    "Ted Lapidus",
    "Teo Cabanel",
    "The Different Company",
    "The Merchant of Venice",
    "Thierry Mugler",
    "Tous",
    "Trussardi Riflesso",
    "Usher",
    "Vicky Tiel",
    "Victorias Secret",
    "Viktor",
    "Vince Camuto",
    "Worth",
    "Yohji Yamamoto",
    "Zippo",
  ];

  const out = new Set<string>();
  for (const b of brands) {
    const t = b.trim();
    if (t.length < 2) continue;
    out.add(t);
    out.add(`${t} men`);
    out.add(`men ${t}`);
  }
  for (let c = 97; c <= 122; c++) {
    out.add(String.fromCharCode(c));
  }
  for (const a of "abcdefghijklmnopqrstuvwxyz") {
    for (const b of "aeiou") {
      out.add(a + b);
    }
  }
  return [...out];
}

function loadExtraQueriesFromFile(): string[] {
  const p = join(process.cwd(), "data/apify-search-queries.txt");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !l.startsWith("#"));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const prisma = new PrismaClient();

async function main() {
  const { target, delayMs, perQuery, mensOnly } = parseArgs();
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    console.error("Set APIFY_TOKEN in .env");
    process.exit(1);
  }

  const actorId =
    process.env.APIFY_FRAGRANTICA_ACTOR_ID?.trim() || DEFAULT_FRAGRANTICA_ACTOR_ID;
  const useProxy = process.env.APIFY_USE_PROXY === "true";
  const client = new ApifyClient({ token });

  const startCount = await prisma.fragranceCatalog.count();
  const queries = [...new Set([...builtInQueries(), ...loadExtraQueriesFromFile()])];
  console.log(
    `Starting bulk import: ${queries.length} queries, up to ${perQuery} items each, target +${target} rows (from ${startCount} in DB). delay=${delayMs}ms mensOnly=${mensOnly}`
  );

  let runs = 0;
  for (const query of queries) {
    const nowTotal = await prisma.fragranceCatalog.count();
    if (nowTotal - startCount >= target) {
      console.log(`Reached target (+${target}). Stopping.`);
      break;
    }

    try {
      const run = await client.actor(actorId).call(
        {
          query,
          maxItems: perQuery,
          allReviews: false,
          omitFields: ["reviews", "images"],
          proxyConfiguration: { useApifyProxy: useProxy },
        },
        { waitSecs: 300 }
      );
      runs += 1;

      if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) {
        console.warn(`Query "${query}" run status: ${run.status}`);
        continue;
      }

      const { items } = await client.dataset(run.defaultDatasetId).listItems({
        limit: perQuery + 10,
        clean: true,
      });

      for (const item of items as Record<string, unknown>[]) {
        if (mensOnly && !keepForMensCatalog(item)) continue;
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
      }

      const total = await prisma.fragranceCatalog.count();
      const added = total - startCount;
      const qPrev = query.length > 36 ? `${query.slice(0, 36)}…` : query;
      process.stdout.write(`\rRun ${runs} "${qPrev}" → ${total} rows (+${added})   `);
    } catch (e) {
      console.warn(`\nQuery failed "${query}":`, e instanceof Error ? e.message : e);
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  const endCount = await prisma.fragranceCatalog.count();
  console.log(`\nDone. Catalog rows: ${endCount} (started ${startCount}, added ${endCount - startCount}, Apify runs ${runs}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
