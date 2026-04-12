/**
 * Robust JSON recovery for LLM-generated responses.
 *
 * Claude (and other LLMs) occasionally produce JSON with:
 *   - Unescaped quotes inside string values
 *   - Truncated output (cut off mid-slide)
 *   - Trailing commas
 *   - Wrapped in markdown code fences
 *
 * This module tries progressively more aggressive strategies to
 * recover a usable object from broken JSON. In the worst case,
 * it walks the `slides` array character-by-character and returns
 * every complete slide object it can parse — so a 12-slide deck
 * with one malformed slide becomes an 11-slide deck instead of
 * a total failure.
 */

export interface RecoveredDeck {
  deckTitle?: string;
  subtitle?: string;
  slides: any[];
}

/**
 * Strip markdown code fences from a JSON response.
 */
function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * Find the outermost balanced `{ ... }` block in the string.
 */
function extractOutermostObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

/**
 * Walk the `slides` array character-by-character, extracting every
 * top-level slide object that parses successfully. Stops at the first
 * malformed slide but keeps all the good ones before it.
 *
 * Handles nested objects/arrays inside each slide by tracking brace
 * and bracket depth with string-literal awareness (so quotes inside
 * string values don't mess up the counter).
 */
function extractValidSlides(raw: string): any[] {
  // Find the start of the slides array
  const match = raw.match(/"slides"\s*:\s*\[/);
  if (!match || match.index === undefined) return [];
  const arrayStart = match.index + match[0].length;

  const slides: any[] = [];
  let depth = 0;          // brace depth
  let bracketDepth = 0;   // bracket depth (for arrays inside slide)
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = arrayStart; i < raw.length; i++) {
    const ch = raw[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0 && bracketDepth === 0) {
        objStart = i;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && bracketDepth === 0 && objStart >= 0) {
        const slideText = raw.slice(objStart, i + 1);
        try {
          const slide = JSON.parse(slideText);
          slides.push(slide);
        } catch {
          // This slide is malformed — stop here, keep everything before it
          return slides;
        }
        objStart = -1;
      }
    } else if (ch === "[") {
      bracketDepth++;
    } else if (ch === "]") {
      if (bracketDepth === 0 && depth === 0) {
        // End of the slides array — we're done
        return slides;
      }
      bracketDepth--;
    }
  }

  return slides;
}

/**
 * Try to parse a raw LLM response as a slide deck JSON.
 * Returns null if completely unrecoverable.
 *
 * Strategies (in order):
 *   1. Direct parse
 *   2. Strip code fences, parse again
 *   3. Extract outermost {...}, parse
 *   4. Walk the slides array and recover every valid slide object
 */
export function recoverDeckJson(raw: string): RecoveredDeck | null {
  // 1. Direct parse
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.slides?.length) return parsed;
  } catch {
    /* try next */
  }

  // 2. Strip code fences
  const cleaned = stripFences(raw);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed?.slides?.length) return parsed;
  } catch {
    /* try next */
  }

  // 3. Outermost balanced object
  const outer = extractOutermostObject(cleaned);
  if (outer) {
    try {
      const parsed = JSON.parse(outer);
      if (parsed?.slides?.length) return parsed;
    } catch {
      /* try next */
    }
  }

  // 4. Walk the slides array and rescue as many as possible
  const slides = extractValidSlides(cleaned);
  if (slides.length > 0) {
    const titleMatch = cleaned.match(/"deckTitle"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
    const subtitleMatch = cleaned.match(/"subtitle"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
    return {
      deckTitle: titleMatch?.[1],
      subtitle: subtitleMatch?.[1],
      slides,
    };
  }

  return null;
}
