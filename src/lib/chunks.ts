const CHUNK_SIZE = 350; // words per chunk
const MAX_CONTEXT_CHUNKS = 30;

export function chunkText(
  text: string,
  title: string,
  materialId: string
): { title: string; text: string; chunkIndex: number; materialId: string }[] {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push({
      materialId,
      title,
      text: words.slice(i, Math.min(i + CHUNK_SIZE, words.length)).join(" "),
      chunkIndex: Math.floor(i / CHUNK_SIZE),
    });
  }
  return chunks;
}

function scoreChunk(
  chunkText: string,
  chunkTitle: string,
  query: string
): number {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const cl = chunkText.toLowerCase();
  const tl = chunkTitle.toLowerCase();
  let score = 0;

  for (const t of terms) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = cl.match(new RegExp(escaped, "gi"));
    if (matches) score += matches.length * (t.length > 5 ? 2 : 1);
    if (tl.includes(t)) score += 5;
  }
  return score;
}

export function retrieveRelevantChunks(
  chunks: { id: string; title: string; text: string; chunkIndex: number }[],
  query: string,
  max = MAX_CONTEXT_CHUNKS
): typeof chunks {
  if (chunks.length <= max) return chunks;

  const scored = chunks.map((c) => ({
    ...c,
    score: scoreChunk(c.text, c.title, query),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}

export function buildContext(
  chunks: { title: string; text: string; chunkIndex: number }[]
): string {
  const byTitle: Record<string, typeof chunks> = {};
  for (const c of chunks) {
    if (!byTitle[c.title]) byTitle[c.title] = [];
    byTitle[c.title].push(c);
  }
  return Object.entries(byTitle)
    .map(
      ([title, chs]) =>
        `═══ ${title} ═══\n${chs
          .sort((a, b) => a.chunkIndex - b.chunkIndex)
          .map((c) => c.text)
          .join("\n")}`
    )
    .join("\n\n");
}
