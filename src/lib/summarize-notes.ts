/** Collapse long pyramid / description text to at most two sentences (and max length). */
export function summarizeNotes(raw: string, maxLen = 450): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  const sentences = oneLine.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  const two = sentences.slice(0, 2).join(" ").trim();
  return two.length > maxLen ? `${two.slice(0, maxLen - 1).trim()}…` : two;
}

export function notesHaveExtraBeyondSummary(raw: string): boolean {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return false;
  const sentences = oneLine.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  const sum = summarizeNotes(raw);
  if (sentences.length > 2) return true;
  if (sum.endsWith("…")) return true;
  return false;
}
