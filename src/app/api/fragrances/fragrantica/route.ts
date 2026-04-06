import { ApifyClient } from "apify-client";
import { NextResponse } from "next/server";
import {
  DEFAULT_FRAGRANTICA_ACTOR_ID,
  mapFragranticaItem,
  normalizeFragranticaUrl,
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

async function runFragranticaActor(payload: Record<string, unknown>): Promise<FragranticaPreview[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_TOKEN_MISSING");
  }

  const useProxy = process.env.APIFY_USE_PROXY === "true";
  const client = new ApifyClient({ token });
  const actorId = getActorId();

  const input = {
    ...payload,
    allReviews: false,
    omitFields: ["reviews", "images"],
    proxyConfiguration: { useApifyProxy: useProxy },
  };

  const run = await client.actor(actorId).call(input, { waitSecs: 300 });

  if (run.status !== "SUCCEEDED") {
    throw new Error(`APIFY_RUN_${run.status}`);
  }

  const datasetId = run.defaultDatasetId;
  if (!datasetId) {
    throw new Error("APIFY_NO_DATASET");
  }

  const { items } = await client.dataset(datasetId).listItems({
    limit: 25,
    clean: true,
  });

  const raw = items as Record<string, unknown>[];
  return raw.map((row) => mapFragranticaItem(row));
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
          return NextResponse.json({ error: "URL must be on fragrantica.com." }, { status: 400 });
        }
        return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
      }

      const results = await runFragranticaActor({
        startUrls: [{ url: canonical }],
        maxItems: 1,
      });

      return NextResponse.json({ results, actorId: getActorId() });
    }

    if (queryRaw.length < 2) {
      return NextResponse.json({ error: "Search query is too short." }, { status: 400 });
    }

    const results = await runFragranticaActor({
      query: queryRaw,
      maxItems: 8,
    });

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