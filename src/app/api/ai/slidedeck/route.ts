import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";
import type { Slide } from "@/lib/slideDeckTemplate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Generate a rich, color-coded interactive HTML slide deck from course content.
 *
 * Flow:
 *   1. Pull course chunks as context
 *   2. Ask Claude to write ~30 structured slides with visual components
 *      (colored boxes, grids, tables, quotes, formulas, bullet lists, etc.)
 *   3. Save as a Video row with sourceType="slidedeck" and slidesData=JSON
 *   4. Return {videoId} so the frontend can open /api/slidedeck/[videoId]
 */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId, topic, numSlides = 25, lang = "en" } = await req.json();
    if (!courseId || !topic?.trim()) {
      return NextResponse.json(
        { error: "courseId and topic are required" },
        { status: 400 }
      );
    }

    const slideCount = Math.min(40, Math.max(10, Number(numSlides) || 25));

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });
    const courseName = course?.name || "Course";

    // Pull course chunks as context
    const chunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
      take: 60,
    });
    const context = chunks.length ? buildContext(chunks) : "";

    const LANG_NAMES: Record<string, string> = {
      en: "English",
      ja: "Japanese",
      es: "Spanish",
      fr: "French",
      zh: "Mandarin Chinese",
    };
    const langName = LANG_NAMES[lang] ?? "English";
    const langInstruction =
      lang === "en"
        ? ""
        : `\n\nLANGUAGE: Generate ALL slide content (tags, titles, body text) entirely in ${langName}. Do not mix languages.`;

    const prefs = await getUserPrefsPrompt((session.user as any).id);

    const systemPrompt = `${prefs}You are an expert academic course designer creating a rich, visually structured interactive slide deck for the course "${courseName}".

Your task: write a ${slideCount}-slide deck on the topic: "${topic.trim()}"

Return ONLY a valid JSON object — no markdown fences, no commentary, no text before or after.

STRUCTURE:
{
  "deckTitle": "Overall deck title (under 70 chars)",
  "subtitle": "Short description of the deck (under 120 chars)",
  "slides": [ /* exactly ${slideCount} slide objects */ ]
}

EACH SLIDE OBJECT:
{
  "tag": "Short eyebrow label (max 45 chars) — e.g. 'Chapter 6 — Value Creation' or 'Step 1 — Value Drivers'",
  "tagColor": "p" | "t" | "c" | "a" | "g" | "b" | "r",
  "title": "Slide title (max 70 chars)",
  "body": [ /* ordered list of visual components */ ]
}

VISUAL COMPONENTS AVAILABLE (mix and match — be creative, use at least 2 components per slide):

1. BULLETS — colored-dot bullet list:
   {"type":"bullets","items":[{"text":"Bullet content. **Bold** is allowed.","color":"p"},{"text":"Next bullet","color":"t"}]}
   Colors: p=purple, t=teal, c=coral, a=amber, g=green, b=blue, r=red. Omit for default purple.

2. SBOX — single colored callout box:
   {"type":"sbox","box":{"color":"t","title":"Definition","body":"Explanation with **bold** words."}}

3. GRID2 — two side-by-side colored boxes (perfect for comparisons):
   {"type":"grid2","boxes":[{"color":"t","title":"Option A","body":"..."},{"color":"p","title":"Option B","body":"..."}]}

4. GRID3 — three-column colored boxes:
   {"type":"grid3","boxes":[{"color":"b","title":"Step 1","body":"..."},{"color":"p","title":"Step 2","body":"..."},{"color":"t","title":"Step 3","body":"..."}]}

5. QUOTE — italicized quote block with colored left border:
   {"type":"quote","text":"A memorable insight or direct quote with attribution.","color":"a"}
   Colors: omit=purple, "t"=teal, "a"=amber

6. FORMULA — centered monospace formula/equation panel:
   {"type":"formula","text":"Profit = Revenue × Margin − Fixed Costs"}

7. ICARD — plain info card with small-caps title:
   {"type":"icard","title":"EXAMPLE","body":"Walk through a worked example or case study."}

8. TABLE — data table:
   {"type":"table","headers":["Metric","Formula","Meaning"],"rows":[{"cells":["Gross margin","(Rev−COGS)/Rev","% kept after production"]}]}

9. SEGMENTS — three labeled segment cards (for market segments, types, categories):
   {"type":"segments","items":[{"color":"con","name":"Consumer","text":"..."},{"color":"trd","name":"Trade","text":"..."},{"color":"ind","name":"Industrial","text":"..."}]}

CRITICAL RULES:
- Vary component usage across slides — don't make every slide a bullets list. Use grids, quotes, tables, formulas, sboxes liberally.
- When discussing calculations or metrics, ALWAYS include a FORMULA component with a worked example.
- When comparing two things, use GRID2. When comparing three, use GRID3 or SEGMENTS.
- When citing memorable phrases or insights, use QUOTE.
- Use bold (**word**) to emphasize key terms within body text.
- Slide 1 = introduction/overview (use QUOTE + BULLETS + SBOX).
- Last slide = combined takeaways (use BULLETS with varied colors).
- Color intent: p=primary/default, t=positive/correct/key, c=warning/caution, a=emphasis/highlight, g=benefits/success, b=informational, r=risk/drawback.
- Ground all content in the course materials below. Use real examples and specific details from the materials.
- Titles and bodies must be concise and scannable — aim for richness through components, not walls of text.

COURSE MATERIALS:
${context || "No materials loaded — use general academic knowledge of the topic."}${langInstruction}`;

    const raw = await askClaude(
      systemPrompt,
      `Create the ${slideCount}-slide interactive deck on: "${topic.trim()}"`,
      16000
    );

    // Parse Claude's JSON response
    let parsed: { deckTitle: string; subtitle?: string; slides: Slide[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json(
          { error: "Failed to parse slide deck structure from Claude response" },
          { status: 500 }
        );
      }
      parsed = JSON.parse(match[0]);
    }

    if (!parsed?.slides || !Array.isArray(parsed.slides) || !parsed.slides.length) {
      return NextResponse.json({ error: "No slides generated" }, { status: 500 });
    }

    // Save to DB as a Video row with sourceType="slidedeck"
    const deckTitle =
      (parsed.deckTitle || topic.trim()).slice(0, 200);

    const video = await prisma.video.create({
      data: {
        courseId,
        title: deckTitle,
        description: (parsed.subtitle || `Interactive slide deck — ${parsed.slides.length} slides`).slice(0, 500),
        url: "slides-only",
        sourceType: "slidedeck",
        lang,
        slidesData: JSON.stringify(parsed),
      },
    });

    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "podcast_script",
      inputText: systemPrompt,
      outputText: raw,
    });

    return NextResponse.json({
      videoId: video.id,
      title: video.title,
      slideCount: parsed.slides.length,
      viewUrl: `/api/slidedeck/${video.id}`,
    });
  } catch (e: any) {
    console.error("[slidedeck] ERROR:", {
      message: e?.message,
      status: e?.status,
      anthropicError: e?.error?.error?.message,
    });
    const detail =
      e?.error?.error?.message || e?.message || "Slide deck generation failed";
    return NextResponse.json(
      { error: `Slide deck generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
