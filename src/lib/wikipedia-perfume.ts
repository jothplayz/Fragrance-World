const WIKI_API = "https://en.wikipedia.org/w/api.php";

/** Wikimedia requires a descriptive User-Agent: https://meta.wikimedia.org/wiki/User-Agent_policy */
const WIKI_UA =
  "FragranceWardrobe/0.1 (https://github.com/Fragrance-World; local dev — replace with your contact if public)";

type WikiSearchHit = { title: string; snippet?: string };

function wikiArticleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

async function wikiGetJson<T>(params: Record<string, string>): Promise<T> {
  const u = new URL(WIKI_API);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), {
    headers: { "User-Agent": WIKI_UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`WIKI_HTTP_${res.status}`);
  }
  return (await res.json()) as T;
}

function looksPerfumeRelated(title: string, brand: string, name: string): boolean {
  const t = title.toLowerCase();
  const b = brand.toLowerCase();
  const n = name.toLowerCase();
  if (/\b(perfume|fragrance|cologne|eau de|parfum)\b/i.test(title)) return true;
  if (b.length > 2 && t.includes(b)) return true;
  if (n.length > 3 && t.includes(n.slice(0, Math.min(n.length, 24)))) return true;
  return false;
}

export type WikipediaSnippet = {
  title: string;
  url: string;
  extract: string;
};

/**
 * Best-effort intro extract for a perfume (often the house or the scent has a Wikipedia article).
 */
export async function fetchWikipediaSnippetForFragrance(
  brand: string,
  name: string
): Promise<WikipediaSnippet | null> {
  const b = brand.trim();
  const n = name.trim();
  if (!b || !n) return null;

  const queries = [
    `${b} ${n} perfume`,
    `${b} ${n} fragrance`,
    `${n} ${b} perfume`,
    `${b} ${n}`,
  ];

  const seenTitles = new Set<string>();

  for (const q of queries) {
    const data = await wikiGetJson<{
      query?: { search?: WikiSearchHit[] };
    }>({
      action: "query",
      list: "search",
      srsearch: q,
      srlimit: "8",
      format: "json",
    });

    const hits = data.query?.search ?? [];
    const ranked = hits.filter((h) => looksPerfumeRelated(h.title, b, n));
    const pool = ranked.length > 0 ? ranked : hits;

    for (const hit of pool) {
      if (seenTitles.has(hit.title)) continue;
      seenTitles.add(hit.title);

      const ex = await wikiGetJson<{
        query?: {
          pages?: Record<
            string,
            {
              title?: string;
              extract?: string;
              missing?: boolean;
            }
          >;
        };
      }>({
        action: "query",
        prop: "extracts",
        exintro: "true",
        explaintext: "true",
        redirects: "1",
        titles: hit.title,
        format: "json",
      });

      const pages = ex.query?.pages;
      if (!pages) continue;
      const page = Object.values(pages)[0];
      if (!page || page.missing || !page.extract?.trim()) continue;

      const extract = page.extract.trim().slice(0, 3500);
      return {
        title: page.title ?? hit.title,
        url: wikiArticleUrl(page.title ?? hit.title),
        extract,
      };
    }
  }

  return null;
}
