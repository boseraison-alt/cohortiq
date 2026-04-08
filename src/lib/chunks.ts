const CHUNK_SIZE = 500; // words per chunk — larger to preserve complete concepts
const MAX_CONTEXT_CHUNKS = 30;

export function chunkText(
  text: string,
  title: string,
  materialId: string
): { title: string; text: string; chunkIndex: number; materialId: string }[] {
  const chunks = [];

  // Try to split on paragraph/section boundaries first
  const paragraphs = text.split(/\n{2,}/);
  let buffer = "";
  let idx = 0;

  for (const para of paragraphs) {
    const combined = buffer ? buffer + "\n\n" + para : para;
    const wordCount = combined.split(/\s+/).length;

    if (wordCount >= CHUNK_SIZE && buffer) {
      // Save the buffer as a chunk, start new one with current paragraph
      chunks.push({
        materialId,
        title,
        text: buffer.trim(),
        chunkIndex: idx++,
      });
      buffer = para;
    } else if (wordCount >= CHUNK_SIZE * 1.5) {
      // Single paragraph too large — force split by words
      const words = combined.split(/\s+/);
      for (let i = 0; i < words.length; i += CHUNK_SIZE) {
        chunks.push({
          materialId,
          title,
          text: words.slice(i, Math.min(i + CHUNK_SIZE, words.length)).join(" "),
          chunkIndex: idx++,
        });
      }
      buffer = "";
    } else {
      buffer = combined;
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    chunks.push({
      materialId,
      title,
      text: buffer.trim(),
      chunkIndex: idx++,
    });
  }

  // Fallback: if no chunks created (no paragraph breaks), use word-based splitting
  if (!chunks.length) {
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      chunks.push({
        materialId,
        title,
        text: words.slice(i, Math.min(i + CHUNK_SIZE, words.length)).join(" "),
        chunkIndex: Math.floor(i / CHUNK_SIZE),
      });
    }
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

/**
 * Detect if a query is "broad" (explain a whole chapter/topic) vs "narrow" (specific question).
 * Broad queries need more context; narrow queries need targeted retrieval.
 */
export function isBroadQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  const broadPatterns = [
    /^explain\s+(chapter|topic|section|module|unit|all|everything)/i,
    /^(summarize|overview|summary|recap|review|walk.?through)\s/i,
    /^(teach|tell)\s+me\s+(about|everything)/i,
    /^what\s+(is|are)\s+(the\s+)?(key|main|important)\s+(concepts?|topics?|ideas?|points?|takeaways?)/i,
    /\b(entire|whole|all|full)\s+(chapter|topic|section|material)/i,
    /\bcover\s+(all|everything|the\s+main)/i,
  ];
  return broadPatterns.some((p) => p.test(q));
}

/**
 * Detect if the query references a specific chapter/section by name or number.
 * Returns the chapter identifier if found, null otherwise.
 */
export function detectChapterRef(query: string): string | null {
  const match = query.match(/\b(chapter|ch\.?|section|module|unit|week)\s*(\d+)/i);
  if (match) return match[0];

  // Also match title-based references like "explain CVP" or "explain cost volume"
  return null;
}

/**
 * Retrieve relevant chunks with adaptive strategy:
 * - Broad queries: return more chunks (up to all), prioritize by title match
 * - Narrow queries: return fewer, more targeted chunks
 * - Chapter-specific: filter by title first, then score
 */
export function retrieveRelevantChunks(
  chunks: { id: string; title: string; text: string; chunkIndex: number }[],
  query: string,
  max = MAX_CONTEXT_CHUNKS
): typeof chunks {
  const broad = isBroadQuery(query);
  const chapterRef = detectChapterRef(query);

  // If referencing a specific chapter, filter to matching chunks first
  if (chapterRef) {
    const chapterNum = chapterRef.match(/\d+/)?.[0];
    const filtered = chunks.filter((c) => {
      const tl = c.title.toLowerCase();
      if (chapterNum && tl.includes(chapterNum)) return true;
      if (tl.includes(chapterRef.toLowerCase())) return true;
      return false;
    });
    // If we found chapter-specific chunks, use those (with higher limit)
    if (filtered.length > 0) {
      // For chapter queries, return ALL matching chunks (up to 60)
      if (filtered.length <= 60) return filtered;
      // If still too many, score and take top
      return scoreAndSlice(filtered, query, 60);
    }
  }

  // For broad queries, use more chunks
  const limit = broad ? Math.min(chunks.length, 50) : max;

  if (chunks.length <= limit) return chunks;

  return scoreAndSlice(chunks, query, limit);
}

function scoreAndSlice(
  chunks: { id: string; title: string; text: string; chunkIndex: number }[],
  query: string,
  max: number
): typeof chunks {
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
