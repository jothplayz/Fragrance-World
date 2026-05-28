import { parseTagsFromJson, type FragranceTag } from "./tag-options";
import { parseSeasonsFromJson } from "./season-options";
import { parseFragranceDescription } from "./parse-fragrance-notes";

type FragranceLike = {
  id: string;
  name: string;
  brand: string;
  tags: string;
  notes: string;
  seasons: string;
  imageUrl?: string;
  fragranticaUrl?: string;
};

export type SimilarFragrance = {
  fragrance: FragranceLike;
  score: number;
  sharedTags: FragranceTag[];
  sharedNotes: string[];
};

function extractAllNotes(notes: string): Set<string> {
  if (!notes.trim()) return new Set();
  const parsed = parseFragranceDescription(notes);
  const all = [
    ...parsed.pyramid.top.items,
    ...parsed.pyramid.middle.items,
    ...parsed.pyramid.base.items,
  ];
  return new Set(all.map((n) => n.toLowerCase().trim()));
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findSimilarFragrances(
  target: FragranceLike,
  collection: FragranceLike[],
  limit = 5
): SimilarFragrance[] {
  const targetTags = new Set(parseTagsFromJson(target.tags));
  const targetNotes = extractAllNotes(target.notes);
  const targetSeasons = new Set(parseSeasonsFromJson(target.seasons));

  return collection
    .filter((f) => f.id !== target.id)
    .map((f) => {
      const candidateTags = parseTagsFromJson(f.tags);
      const sharedTags = candidateTags.filter((t) => targetTags.has(t));
      const candidateNotes = extractAllNotes(f.notes);
      const sharedNotes: string[] = [];
      for (const n of targetNotes) {
        if (candidateNotes.has(n)) sharedNotes.push(n);
      }
      const candidateSeasons = new Set(parseSeasonsFromJson(f.seasons));
      const seasonOverlap = [...targetSeasons].filter((s) => candidateSeasons.has(s)).length;

      const tagScore = jaccardScore(targetTags, new Set(candidateTags)) * 10;
      const noteScore = sharedNotes.length * 1.5;
      const seasonScore = seasonOverlap * 0.5;

      return {
        fragrance: f,
        score: tagScore + noteScore + seasonScore,
        sharedTags,
        sharedNotes: sharedNotes.slice(0, 8),
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
