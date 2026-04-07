import { ApifyClient } from "apify-client";
import { NextResponse } from "next/server";
import {
  DEFAULT_FRAGRANTICA_ACTOR_ID,
  mapFragranticaItem,
  normalizeFragranticaUrl,
  perfumeIdFromFragranticaPath,
  perfumeUrlMatchesId,
  searchQueryFromPerfumePath,
  type FragranticaPreview,
} from "@/lib/apify-fragrantica";
import { readJsonBody } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getActorId(): string {
  const id = process.env.APIFY_FRAGRANTICA_ACTOR_ID?.trim();
  return id && id.length > 0 ? id : DEFAULT_FRAGRANTICA_ACTOR_ID;
}

/** If the actor returned one row without a URL, attach the requested canonical link (same perfume id). */
function ensureCanonicalPerfumeUrl(
  previews: FragranticaPreview[],
  canonical: string,
  pid: string | null
): FragranticaPreview[] {
  if (!pid || previews.length !== 1) return previews;
  const [row] = previews;
  if (!row || row.fragranticaUrl.trim()) return previews;
  return [{ ...row, fragranticaUrl: canonical }];
}

function hasUsableFragranticaUrl(previews: FragranticaPreview[]): boolean {
  return previews.some((r) => r.fragranticaUrl.trim().length > 0);
}

async function runFragranticaActorOnce(
  payload: Record<string, unknown>,
  useProxy: boolean
): Promise<FragranticaPreview[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_TOKEN_MISSING");
  }

  const client = new ApifyClient({ token });
  const actorId = getActorId();

  const input: Record<string, unknown> = {
    ...payload,
    allReviews: false,
    omitFields: ["reviews"],
  };
  if (useProxy) {
    input.proxyConfiguration = { useApifyProxy: true };
  }

  const run = await client.actor(actorId).call(input, { waitSecs: 300 });

  if (run.status !== "SUCCEEDED") {
    throw new Error(`APIFY_RUN_${run.status}`);
  }

  const datasetId = run.defaultDatasetId;
  if (!datasetId) {
    throw new Error("APIFY_NO_DATASET");
  }

  const { items } = await client.dataset(datasetId).listItems({
    limit: 50,
    clean: true,
  });

  const raw = items as Record<string, unknown>[];
  return raw.map((row) => mapFragranticaItem(row));
}

/**
 * Fragrantica often blocks datacenter IPs; the actor README recommends proxies.
 * If the first run returns no rows with a perfume URL, retry once with Apify proxy (unless disabled).
 */
async function runFragranticaActor(payload: Record<string, unknown>): Promise<FragranticaPreview[]> {
  const envProxy = process.env.APIFY_USE_PROXY === "true";
  const skipAutoProxy = process.env.APIFY_NO_AUTO_PROXY_RETRY === "true";

  let previews = await runFragranticaActorOnce(payload, envProxy);
  if (!hasUsableFragranticaUrl(previews) && !envProxy && !skipAutoProxy) {
    previews = await runFragranticaActorOnce(payload, true);
  }
  return previews;
}

export async function POST(request: Request) {
  const parsed = await readJsonBody<{ url?: string; query?: string }>(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const urlRaw = typeof parsed.data.url === "string" ? parsed.data.url.trim() : "";
  const queryRaw = typeof parsed.data.query === "string" ? parsed.data.query.trim() : "";

  if (urlRaw && queryRaw) {
    return NextResponse.json({ error: "Send either url or query, not both." }, { status: 400 });
  }

  if (!urlRaw && !queryRaw) {
    return NextResponse.json(
      { error: "Provide a Fragrantica perfume URL or a search query." },
      { status: 400 }
    );
  }

  try {
    if (urlRaw) {
      let canonical: string;
      try {
        canonical = normalizeFragranticaUrl(urlRaw);
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (code === "NOT_FRAGRANTICA") {
          return NextResponse.json(
            {
              error:
                "URL must be a Fragrantica perfume page (www.fragrantica.com or a regional fragrantica.* site).",
            },
            { status: 400 }
          );
        }
        if (code === "NOT_PERFUME_URL") {
          return NextResponse.json(
            {
              error:
                "Use a perfume page URL like …/perfume/Brand/Name-12345.html (not search, designer, or board links).",
            },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
      }

      const path = new URL(canonical).pathname;
      const pid = perfumeIdFromFragranticaPath(path);

      const mapped = ensureCanonicalPerfumeUrl(
        await runFragranticaActor({
          startUrls: [{ url: canonical }],
          maxItems: 8,
        }),
        canonical,
        pid
      );

      let results = mapped.filter((r) => r.fragranticaUrl);

      if (results.length > 0 && pid) {
        const hit = results.find((r) => perfumeUrlMatchesId(r.fragranticaUrl, pid));
        results = hit ? [hit] : [results[0]!];
      } else if (results.length > 1) {
        results = [results[0]!];
      }

      if (results.length === 0) {
        const guess = searchQueryFromPerfumePath(path);
        if (guess) {
          const fromMapped = ensureCanonicalPerfumeUrl(
            await runFragranticaActor({
              query: guess,
              maxItems: 15,
            }),
            canonical,
            pid
          );
          const fromQuery = fromMapped.filter((r) => r.fragranticaUrl);
          if (pid) {
            const hit = fromQuery.find((r) => perfumeUrlMatchesId(r.fragranticaUrl, pid));
            results = hit ? [hit] : fromQuery.slice(0, 1);
          } else {
            results = fromQuery.slice(0, 1);
          }
        }
      }

      return NextResponse.json({ results, actorId: getActorId() });
    }

    if (queryRaw.length < 2) {
      return NextResponse.json({ error: "Search query is too short." }, { status: 400 });
    }

    const mapped = await runFragranticaActor({
      query: queryRaw,
      maxItems: 8,
    });
    const results = mapped.filter((r) => r.fragranticaUrl.trim());

    return NextResponse.json({ results, actorId: getActorId() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";

    if (msg === "APIFY_TOKEN_MISSING") {
      return NextResponse.json(
        {
          error:
            "Apify is not configured. Set APIFY_TOKEN in .env (see env.example). The default actor is lexis-solutions/fragrantica on Apify.",
        },
        { status: 503 }
      );
    }

    if (msg.startsWith("APIFY_RUN_")) {
      return NextResponse.json(
        { error: `Apify run did not succeed (${msg.replace("APIFY_RUN_", "")}).` },
        { status: 502 }
      );
    }

    return NextResponse.json({ error: msg }, { status: 502 });
  }
}