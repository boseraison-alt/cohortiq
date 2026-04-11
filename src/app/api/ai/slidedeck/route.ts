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

    // Pull course chunks as context (cap at 30 — Claude's prompt instructions
    // need to fit alongside these without truncation)
    const chunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
      take: 30,
    });
    const context = chunks.length ? buildContext(chunks) : "";
    console.log("[slidedeck] Starting generation", {
      courseId,
      topic: topic.trim().slice(0, 80),
      slideCount,
      chunkCount: chunks.length,
      contextLength: context.length,
    });

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

    // ── HARD component quotas based on slide count ──
    // These force variety so Claude cannot default to "all bullet lists"
    const minGrid2   = Math.max(4, Math.floor(slideCount * 0.20)); // ≥20% must use grid2
    const minGrid3   = Math.max(2, Math.floor(slideCount * 0.10)); // ≥10% must use grid3
    const minQuote   = Math.max(3, Math.floor(slideCount * 0.12)); // ≥12% must have a quote
    const minSBox    = Math.max(3, Math.floor(slideCount * 0.15)); // ≥15% must use sbox
    const minFormula = Math.max(2, Math.floor(slideCount * 0.08)); // ≥8% must have formula
    const minTable   = 1;
    const maxAllBullets = Math.floor(slideCount * 0.25);           // ≤25% may be bullets-only

    const systemPrompt = `${prefs}You are creating a RICH, VISUALLY STRUCTURED interactive slide deck for the course "${courseName}". The target quality is comparable to professionally-designed course materials with colored callout boxes, comparison grids, quote blocks, formula panels, and data tables — NOT plain bullet lists.

Topic: "${topic.trim()}"
Exact slide count: ${slideCount}

Return ONLY a valid JSON object. No markdown fences. No commentary.

═══════════════════════════════════════════════════════════════
JSON STRUCTURE
═══════════════════════════════════════════════════════════════
{
  "deckTitle": "string (max 70 chars)",
  "subtitle":  "string (max 120 chars)",
  "slides": [ /* exactly ${slideCount} slides */ ]
}

Each slide:
{
  "tag":      "Eyebrow label, max 45 chars (e.g. 'Chapter 6 — Value Creation')",
  "tagColor": "p" | "t" | "c" | "a" | "g" | "b" | "r",
  "title":    "Slide title, max 70 chars",
  "body":     [ /* 2–4 visual components from the list below */ ]
}

Color codes: p=purple | t=teal | c=coral | a=amber | g=green | b=blue | r=red

═══════════════════════════════════════════════════════════════
VISUAL COMPONENTS (USE A VARIETY — THIS IS CRITICAL)
═══════════════════════════════════════════════════════════════

▶ GRID2 — two colored boxes side-by-side (use for: comparisons, contrasts, pros/cons, two perspectives)
{"type":"grid2","boxes":[
  {"color":"t","title":"Monetary value","body":"Direct financial benefits: **revenue, margins, ROI**."},
  {"color":"p","title":"Strategic value","body":"Brand equity, **long-term positioning**, portfolio synergies."}
]}

▶ GRID3 — three colored boxes (use for: 3-way comparisons, 3-step processes, 3 categories)
{"type":"grid3","boxes":[
  {"color":"b","title":"Demographic","body":"Age, income, education, occupation"},
  {"color":"p","title":"Geographic","body":"Region, urban vs. rural, climate"},
  {"color":"t","title":"Behavioral","body":"Purchase frequency, brand loyalty"}
]}

▶ SBOX — single colored callout (use for: definitions, key concepts, "what it is" sections)
{"type":"sbox","box":{"color":"a","title":"Core insight","body":"Profit = revenue minus all costs. **Three levers**: grow revenue, cut costs, optimize price."}}

▶ QUOTE — italicized quote block with colored left border (use for: memorable insights, famous quotes, cross-links between ideas)
{"type":"quote","text":"\\"The customer is the only one who can fire us all.\\" — Sam Walton","color":"a"}

▶ FORMULA — centered monospace equation (use for: ANY calculation, ratio, or formula)
{"type":"formula","text":"Break-even Volume = Fixed Costs ÷ (Unit Price − Unit Variable Cost)"}

▶ ICARD — plain info card with small-caps title (use for: worked examples, case studies, side notes)
{"type":"icard","title":"EXAMPLE — STARBUCKS","body":"Starbucks earns **monetary value** through coffee sales while its social initiatives build **strategic value** — brand strength that drives long-term growth."}

▶ TABLE — data table (use for: metrics lists, comparison matrices, income statements)
{"type":"table","headers":["Metric","Formula","Meaning"],"rows":[
  {"cells":["Gross margin","(Rev − COGS) / Rev","% kept after production"]},
  {"cells":["Net margin","Net Income / Rev","% kept as profit"]},
  {"cells":["ROI","Net Return / Cost","Return as percentage"]}
]}

▶ BULLETS — colored-dot list (use SPARINGLY, only as a supporting element — NEVER as the sole component)
{"type":"bullets","items":[
  {"text":"Primary point with **bold** emphasis.","color":"t"},
  {"text":"Secondary point showing relation.","color":"a"},
  {"text":"Closing insight that ties the slide together.","color":"p"}
]}

▶ SEGMENTS — three labeled segment cards (use for: market segments, customer types)
{"type":"segments","items":[
  {"color":"con","name":"Consumer","text":"Household use. **Priority: price**."},
  {"color":"trd","name":"Trade","text":"Daily professional use. **Priority: reliability & brand**."},
  {"color":"ind","name":"Industrial","text":"Bulk purchases. **Priority: power**."}
]}

═══════════════════════════════════════════════════════════════
HARD REQUIREMENTS (ENFORCED — THE DECK WILL BE REJECTED IF NOT MET)
═══════════════════════════════════════════════════════════════

1. COMPONENT QUOTAS (minimum counts across the ${slideCount}-slide deck):
   • At least ${minGrid2} slides must contain GRID2
   • At least ${minGrid3} slides must contain GRID3
   • At least ${minQuote} slides must contain QUOTE
   • At least ${minSBox} slides must contain SBOX
   • At least ${minFormula} slides must contain FORMULA (or 0 if no calculations apply at all)
   • At least ${minTable} slide must contain TABLE
   • No more than ${maxAllBullets} slides may use ONLY bullets as their body

2. Every slide must have 2–4 components in its body. A single-component slide is rejected.

3. Use tagColor to establish visual rhythm — alternate between colors across slides, don't use the same color for every tag.

4. Inside component bodies, use **bold** to emphasize key terms.

5. Ground all content in the course materials below. Use real examples, real numbers, real case studies from the materials when available.

═══════════════════════════════════════════════════════════════
FULL EXAMPLE (imitate this diversity across your deck)
═══════════════════════════════════════════════════════════════

Example slide 1 — introduction with QUOTE + BULLETS:
{
  "tag":"Introduction","tagColor":"a",
  "title":"Two dimensions of company value",
  "body":[
    {"type":"quote","text":"Value creation is the foundation of any successful market strategy.","color":"a"},
    {"type":"grid2","boxes":[
      {"color":"t","title":"Monetary value","body":"Direct **financial benefits**: revenue, margins, ROI."},
      {"color":"p","title":"Strategic value","body":"Non-monetary: **brand, reputation**, talent, synergies."}
    ]},
    {"type":"bullets","items":[
      {"text":"Both must work **simultaneously** — neither alone is sufficient.","color":"t"},
      {"text":"Strategic value compounds into monetary value over time.","color":"a"}
    ]}
  ]
}

Example slide 2 — calculation with FORMULA + SBOX:
{
  "tag":"Break-even","tagColor":"p",
  "title":"How many units to break even",
  "body":[
    {"type":"formula","text":"BEV = Fixed Costs ÷ (Unit Price − Unit Variable Cost)"},
    {"type":"icard","title":"WORKED EXAMPLE","body":"Price $100, variable cost $50, fixed investment $50M → BEV = **1,000,000 units** required to break even."},
    {"type":"sbox","box":{"color":"c","title":"Warning","body":"A price cut **doubles** the break-even volume if margin halves."}}
  ]
}

Example slide 3 — comparison with TABLE:
{
  "tag":"Metrics","tagColor":"b",
  "title":"Performance metrics every manager must know",
  "body":[
    {"type":"table","headers":["Metric","Formula","Meaning"],"rows":[
      {"cells":["Gross margin","(Rev − COGS) / Rev","% remaining after production"]},
      {"cells":["Net margin","Net Income / Rev","Final profit %"]},
      {"cells":["ROI","Net Return / Cost","Investment efficiency"]},
      {"cells":["Market share","Offering Sales / Total","Share of category"]}
    ]},
    {"type":"bullets","items":[
      {"text":"These metrics **trace revenue down to profit** line by line.","color":"p"}
    ]}
  ]
}

═══════════════════════════════════════════════════════════════
COURSE MATERIALS TO DRAW FROM
═══════════════════════════════════════════════════════════════
${context || "No materials loaded — use accurate academic knowledge of the topic."}${langInstruction}

REMEMBER: If you produce a deck where every slide is just a "bullets" component, the deck will be REJECTED. Use grids, quotes, tables, formulas, and sboxes generously — they are the entire point.`;

    const raw = await askClaude(
      systemPrompt,
      `Create the ${slideCount}-slide interactive deck on: "${topic.trim()}"`,
      16000
    );

    console.log("[slidedeck] Claude responded", {
      rawLength: raw?.length || 0,
      startsWith: (raw || "").slice(0, 80),
      endsWith: (raw || "").slice(-80),
    });

    // Parse Claude's JSON response — be aggressive about finding valid JSON
    let parsed: { deckTitle: string; subtitle?: string; slides: Slide[] };
    try {
      // Strip markdown code fences if present
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Fall back: find the first { and match braces
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) {
        console.error("[slidedeck] Cannot find JSON in response:", raw.slice(0, 500));
        return NextResponse.json(
          {
            error: `Claude returned non-JSON output. First 300 chars: ${raw.slice(0, 300)}`,
          },
          { status: 500 }
        );
      }
      try {
        parsed = JSON.parse(raw.slice(start, end + 1));
      } catch (secondErr: any) {
        console.error("[slidedeck] JSON parse failed:", secondErr?.message, raw.slice(0, 500));
        return NextResponse.json(
          {
            error: `Slide deck JSON parse error: ${secondErr?.message || "unknown"}. Response started with: ${raw.slice(0, 200)}`,
          },
          { status: 500 }
        );
      }
    }

    if (!parsed?.slides || !Array.isArray(parsed.slides) || !parsed.slides.length) {
      return NextResponse.json({ error: "No slides generated" }, { status: 500 });
    }

    // ── Component diversity audit (soft — logs only, never rejects) ──
    const counts: Record<string, number> = {
      grid2: 0, grid3: 0, quote: 0, sbox: 0, formula: 0, table: 0,
      bullets: 0, icard: 0, segments: 0,
    };
    let bulletOnlySlides = 0;
    for (const s of parsed.slides) {
      if (!Array.isArray(s.body)) continue;
      const types = s.body.map((c: any) => c?.type).filter(Boolean);
      for (const t of types) counts[t] = (counts[t] || 0) + 1;
      if (types.length > 0 && types.every((t: string) => t === "bullets")) {
        bulletOnlySlides++;
      }
    }
    console.log("[slidedeck] Diversity audit:", {
      totalSlides: parsed.slides.length,
      bulletOnlySlides,
      counts,
    });

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
