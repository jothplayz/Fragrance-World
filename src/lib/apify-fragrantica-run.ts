import { ApifyClient } from "apify-client";
import {
  DEFAULT_FRAGRANTICA_ACTOR_ID,
  mapFragranticaItem,
  normalizeFragranticaUrl,
  perfumeIdFromFragranticaPath,
  perfumeUrlMatchesId,
  searchQueryFromPerfumePath,
  type FragranticaPreview,
} from "@/lib/apify-fragrantica";

export function getFragranticaActorId(): string {
  const id = process.env.APIFY_FRAGRANTICA_ACTOR_ID?.trim();
  return id && id.length > 0 ? id : DEFAULT_FRAGRANTICA_ACTOR_ID;
}

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
  const actorId = getFragranticaActorId();

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
 * Fragrantica often blocks datacenter IPs; retry once with Apify proxy when no usable URLs.
 */
export async function runFragranticaActor(payload: Record<string, unknown>): Promise<FragranticaPreview[]> {
  const envProxy = process.env.APIFY_USE_PROXY === "true";
  const skipAutoProxy = process.env.APIFY_NO_AUTO_PROXY_RETRY === "true";

  let previews = await runFragranticaActorOnce(payload, envProxy);
  if (!hasUsableFragranticaUrl(previews) && !envProxy && !skipAutoProxy) {
    previews = await runFragranticaActorOnce(payload, true);
  }
  return previews;
}

/** Best single preview for a perfume URL (same selection logic as the API route). */
export async function fetchFragranticaPreviewForUrl(urlRaw: string): Promise<FragranticaPreview | null> {
  const canonical = normalizeFragranticaUrl(urlRaw);
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

  return results[0] ?? null;
}
