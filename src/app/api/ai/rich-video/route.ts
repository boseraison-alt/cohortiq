import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";
import { recoverDeckJson } from "@/lib/jsonRecovery";
import type { Slide } from "@/lib/slideDeckTemplate";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes

/**
 * Rich Video Generation
 * ─────────────────────
 * Uses the same rich component vocabulary as the HTML slide deck
 * (grid2, sbox, quote, formula, table, segments) but renders each
 * slide as a 1920×1080 SVG → PNG, generates TTS narration with
 * OpenAI "onyx" voice (same voice as existing videos), and composites
 * into an MP4 with FFmpeg — all using the existing pipeline, no
 * new dependencies needed.
 */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId, topic, numSlides = 8, lang = "en" } = await req.json();
    if (!courseId || !topic?.trim()) {
      return NextResponse.json(
        { error: "courseId and topic are required" },
        { status: 400 }
      );
    }

    const slideCount = Math.min(30, Math.max(5, Number(numSlides) || 8));

    // ── Course info + context chunks ──
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true, color: true },
    });
    const courseName = course?.name || "Course";
    const accentColor = course?.color || "#C9956B";

    const chunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
      take: 30,
    });
    const context = chunks.length ? buildContext(chunks) : "";

    console.log("[rich-video] Starting generation", {
      courseId,
      topic: topic.trim().slice(0, 80),
      slideCount,
      chunkCount: chunks.length,
    });

    // ── Ask Claude for rich slides WITH narration ──
    const prefs = await getUserPrefsPrompt((session.user as any).id);

    const LANG_NAMES: Record<string, string> = {
      en: "English", ja: "Japanese", es: "Spanish", fr: "French", zh: "Mandarin Chinese",
    };
    const langName = LANG_NAMES[lang] ?? "English";
    const langInstruction = lang === "en"
      ? ""
      : `\n\nLANGUAGE: Generate ALL slide content AND narration entirely in ${langName}. Do not mix languages.`;

    const systemPrompt = `${prefs}You are creating a rich visually-structured narrated slide presentation for the course "${courseName}". Each slide has BOTH visual components (for the viewer) AND spoken narration (for audio TTS).

Topic: "${topic.trim()}"
Slide count: ${slideCount}

Return ONLY a valid JSON object. No markdown fences.

CRITICAL JSON FORMATTING RULES (READ CAREFULLY — syntax errors break the whole deck):
- Escape ALL double quotes inside string values with a backslash: \\"
- Do NOT use curly/smart quotes " " ' ' inside string values. Use straight quotes only.
- Do NOT use unescaped newlines inside string values. Use the literal characters \\n or just a space.
- For quotations within narration text, use single quotes (') instead of escaped double quotes.
  GOOD: "narration": "Apple said 'we are the best' in 2023."
  BAD:  "narration": "Apple said "we are the best" in 2023."
- Do NOT put trailing commas before ] or }.
- Do NOT add any text outside the JSON object — no explanations, no markdown.

STRUCTURE:
{
  "deckTitle": "string (max 70 chars)",
  "subtitle": "string (max 120 chars)",
  "slides": [ /* exactly ${slideCount} slides */ ]
}

EACH SLIDE:
{
  "tag": "Short eyebrow label, max 40 chars",
  "tagColor": "p" | "t" | "c" | "a" | "g" | "b" | "r",
  "title": "Slide title, max 60 chars",
  "body": [ /* 2-3 visual components */ ],
  "narration": "80-120 words of natural spoken narration — written for a single clear narrator voice. Walk through the concept conversationally. Do NOT read the bullet points verbatim. Explain and connect ideas concisely."
}

Colors: p=purple | t=teal | c=coral | a=amber | g=green | b=blue | r=red

VISUAL COMPONENTS (use 2-3 per slide, VARY them across slides):

▶ grid2 — two side-by-side colored boxes (comparisons, pros vs cons):
{"type":"grid2","boxes":[
  {"color":"t","title":"Monetary","body":"Revenue, margins, ROI"},
  {"color":"p","title":"Strategic","body":"Brand, synergies, long-term"}
]}

▶ grid3 — three colored boxes (3 options, 3 steps):
{"type":"grid3","boxes":[
  {"color":"b","title":"Step 1","body":"Define drivers"},
  {"color":"p","title":"Step 2","body":"Segment market"},
  {"color":"t","title":"Step 3","body":"Target selection"}
]}

▶ sbox — single colored callout box (key definition, insight):
{"type":"sbox","box":{"color":"a","title":"Core concept","body":"Key explanation here"}}

▶ quote — italicized quote block with colored left border:
{"type":"quote","text":"A memorable insight or direct quote","color":"a"}

▶ formula — centered monospace equation (ALWAYS use when discussing a calculation):
{"type":"formula","text":"Break-even = Fixed Costs / (Price - Variable Cost)"}

▶ icard — plain info card with small-caps title (examples, case studies):
{"type":"icard","title":"EXAMPLE","body":"Walk through a specific case with numbers"}

▶ table — data table (metrics list, comparison matrix):
{"type":"table","headers":["Metric","Formula","Meaning"],"rows":[
  {"cells":["Gross margin","(Rev-COGS)/Rev","% kept after production"]}
]}

▶ bullets — colored-dot bullet list (USE SPARINGLY — prefer the components above):
{"type":"bullets","items":[
  {"text":"Key point with emphasis","color":"t"},
  {"text":"Supporting point","color":"a"}
]}

═══════════════════════════════════════════════════════════════
GRAPHS & DATA VISUALIZATION (use these liberally for anything numeric!)
═══════════════════════════════════════════════════════════════

GRAPH TYPE SELECTION — pick the right graph for the data:

  Data pattern                          →  Correct graph type
  ──────────────────────────────────────────────────────────────
  Comparing discrete categories         →  barchart
   (e.g. "Revenue by region", "Scores by team", "Sales by product")
  Trends or change over time            →  linechart
   (e.g. "Growth 2020–2026", "Stock price", "User signups per month")
  Parts of a whole that sum to 100%     →  piechart
   (e.g. "Market share %", "Budget allocation", "Customer segments by size")
  Headline KPIs / dashboard numbers     →  metrics
   (e.g. "Revenue $12M, +23%", "4 big numbers with deltas")
  Relative achievement or completion    →  progress
   (e.g. "Campaign awareness 85%", "Target attainment by rep")
  Few data points, just show numbers    →  table  (or skip graph entirely)

RULES:
  - Do NOT use a pie chart for data that doesn't sum to 100% or isn't a composition.
  - Do NOT use a line chart for discrete non-sequential categories — use bar chart.
  - Do NOT use a bar chart for trends over time — use line chart.
  - When showing 2–4 headline stats that need to stand out, use metrics (NOT bar chart).
  - Always match the visual metaphor to the data shape. Wrong chart type = confusion.

▶ barchart — vertical bar chart (use for: category comparisons, rankings, discrete values):
{"type":"barchart","title":"Revenue by Quarter","unit":"M","bars":[
  {"label":"Q1","value":12.5,"color":"t"},
  {"label":"Q2","value":15.8,"color":"p"},
  {"label":"Q3","value":18.2,"color":"a"},
  {"label":"Q4","value":22.1,"color":"g"}
]}

▶ linechart — line chart (use for: trends over time, growth curves, before/after):
{"type":"linechart","title":"User Growth 2020–2026","yLabel":"Users (M)","series":[
  {"label":"Organic","color":"t","points":[[2020,2.1],[2021,3.5],[2022,5.8],[2023,9.2],[2024,13.0],[2025,18.5],[2026,24.0]]},
  {"label":"Paid","color":"p","points":[[2020,0.5],[2021,1.2],[2022,2.4],[2023,3.9],[2024,5.1],[2025,6.8],[2026,8.2]]}
]}

▶ piechart — pie chart with donut hole (use for: market share, proportions, breakdowns):
{"type":"piechart","title":"Market Share 2026","slices":[
  {"label":"Company A","value":45,"color":"p"},
  {"label":"Company B","value":28,"color":"t"},
  {"label":"Company C","value":15,"color":"a"},
  {"label":"Others","value":12,"color":"b"}
]}

▶ metrics — KPI dashboard with up to 4 big numbers (use for: headline stats, key metrics, at-a-glance numbers):
{"type":"metrics","items":[
  {"label":"Revenue","value":"$12.5M","delta":"+23%","color":"g"},
  {"label":"Customers","value":"45K","delta":"+18%","color":"t"},
  {"label":"Churn","value":"2.1%","delta":"-0.4%","color":"p"},
  {"label":"NPS","value":"72","delta":"+8","color":"b"}
]}

▶ progress — horizontal progress bars (use for: completion rates, attainment, relative comparisons):
{"type":"progress","title":"Campaign Performance","items":[
  {"label":"Awareness","percent":85,"color":"t"},
  {"label":"Consideration","percent":62,"color":"p"},
  {"label":"Purchase Intent","percent":41,"color":"a"},
  {"label":"Loyalty","percent":28,"color":"c"}
]}

═══════════════════════════════════════════════════════════════
CRITICAL: EVERY SLIDE MUST TEACH WITH CONCRETE EXAMPLES
═══════════════════════════════════════════════════════════════

The single most important rule: **abstract explanations are forbidden**.
Every slide must include AT LEAST ONE concrete example — real numbers,
real companies, real scenarios, named historical cases, or worked
calculations. Students learn 3× faster from specific examples than
from general principles. Your job is to make everything tangible.

What counts as a good example:
  ✓ "Apple cut iPhone prices 12% in 2013 to counter Samsung — sold 47M units that quarter, up from 37M"
  ✓ "A bakery with $10,000 fixed costs, $5 variable cost per cake, $15 selling price → BEP = 1,000 cakes"
  ✓ "Campbell's Soup's 2019 repositioning: dropped 27% of SKUs to focus on core products, margin rose 4 points"
  ✓ "Toyota's lean production reduces WIP inventory from 2 weeks to 4 hours at the Georgetown plant"

What does NOT count (these are abstract and will be rejected):
  ✗ "Companies should reduce costs to improve margins"  (no example)
  ✗ "Market segmentation is important for targeting"    (no example)
  ✗ "Pricing affects demand"                            (no example)

BEST COMPONENTS FOR EXAMPLES:
  • icard  — "EXAMPLE — STARBUCKS" / "CASE STUDY — BOEING 737 MAX" / "WORKED EXAMPLE"
  • formula — walk through a calculation with specific numbers
  • sbox   — single colored box with the example story
  • barchart — show real numbers across categories
  • linechart — show real trends over time

Example slide with 3 concrete examples:
{
  "tag":"Ch. 6 — Price Elasticity","tagColor":"p",
  "title":"When lowering price grows revenue (and when it doesn't)",
  "body":[
    {"type":"grid2","boxes":[
      {"color":"t","title":"High elasticity","body":"Price cut → revenue up"},
      {"color":"c","title":"Low elasticity","body":"Price cut → revenue down"}
    ]},
    {"type":"icard","title":"EXAMPLE — NETFLIX 2023","body":"Raised prices from $9.99 to $15.49 (+55%). Lost only 2% of subscribers. **Low elasticity** — revenue grew 12%."},
    {"type":"icard","title":"EXAMPLE — WALMART GROCERY","body":"Cut bread prices 20% in 2019. Volume rose 35%. **High elasticity** — revenue grew 8% even at thinner margins."}
  ],
  "narration":"Price elasticity tells us how sensitive customers are to price changes. Consider two real cases from opposite ends of the spectrum. Netflix raised prices 55 percent in 2023 and only lost 2 percent of subscribers — that's low elasticity, and their revenue grew 12 percent. Walmart did the opposite with grocery staples — they cut bread prices 20 percent in 2019 and saw volume rise 35 percent. Same principle, opposite outcomes. The lesson? You have to test your market's elasticity before moving price."
}

Notice: TWO icard examples, grid2 comparison, and narration that walks through specific numbers. This is the standard.

═══════════════════════════════════════════════════════════════
HARD QUOTA — GRAPHS ARE MANDATORY (not optional)
═══════════════════════════════════════════════════════════════

The deck MUST include AT LEAST TWO graph components across all slides,
chosen from: barchart, linechart, piechart, metrics, progress. This
applies EVEN IF the topic seems non-quantitative.

If the topic is conceptual (e.g. "Brand Identity", "Leadership Styles",
"Collaboration"), you MUST find at least 2 numeric angles and visualize
them. Examples:

  Topic: "CVP Analysis" or "Break-Even Analysis"
    → barchart of "Break-even volume across 3 scenarios (base/optimistic/pessimistic)"
    → linechart showing "Revenue vs Total Cost as volume increases" (the classic CVP graph)
    → metrics cards: "BEP = 1,000 units | CM = $6/unit | Fixed Costs = $48K"
    → progress bars: "Margin of Safety: 35% | Operating Leverage: 2.8x"

  Topic: "Cost Accounting" or "Variance Analysis"
    → barchart comparing "Budget vs Actual by cost category"
    → metrics cards: "Price Variance: -$2,400 | Volume Variance: +$3,600"

  Topic: "Brand Identity"
    → barchart of "Top 10 most valuable brands 2024"
    → metrics cards of "Apple's brand value: $516B, +9%"

  Topic: "Market Segmentation"
    → piechart of "US beverage market share by segment"
    → barchart of "Segment growth rates 2023–2025"

  Topic: "Revenue / Pricing"
    → linechart of "Price elasticity: demand curve at different price points"
    → barchart of "Revenue by pricing strategy (premium vs economy)"

USE REAL OR PLAUSIBLE ILLUSTRATIVE DATA. It's better to have an
approximate graph than none at all. Round numbers are fine. Prefer
real numbers when the course materials provide them.

GRAPH QUOTA:
  - Minimum 2 graphs for conceptual topics
  - Minimum 3 graphs for quantitative/accounting/finance topics
    (CVP, break-even, variance, budgeting, pricing, revenue)
  - For CVP/break-even specifically: you MUST include a linechart
    showing cost-volume-profit relationships AND a barchart or
    metrics card showing the break-even result with specific numbers

Recommended placement:
  - Slide 2 or 3: a big-picture graph (barchart, linechart) that sets
    context with real data
  - Mid-deck: worked example with formula + supporting graph
  - Slide near the end: metrics cards summarizing key takeaways

═══════════════════════════════════════════════════════════════
OTHER RULES
═══════════════════════════════════════════════════════════════
1. Each slide must have 3-4 body components. At least 1 MUST be an example (icard/formula/sbox with named company or specific numbers).
2. Narration is 80-120 words — natural, conversational, walks through each example.
3. When discussing any calculation, include a formula component AND an icard "WORKED EXAMPLE" with real numbers.
4. When comparing 2 things, use grid2 + 2 example icards. When comparing 3, use grid3 or segments + examples.
5. When discussing numeric data, use a graph component (barchart/linechart/piechart/metrics/progress) — never dump numbers into bullets or sboxes.
6. Ground content in the course materials below. If the materials lack specific examples, use accurate real-world examples from your knowledge of the topic.
7. Use real company names, real years, real dollar amounts whenever possible.
8. Keep component body text concise — ~12-15 words per box.
9. Use **bold** in body text (the renderer will strip ** markers).

COURSE MATERIALS:
${context || "No materials loaded — use general knowledge of the topic."}${langInstruction}`;

    // Scale max_tokens with slide count so larger decks don't truncate.
    // Budget ~1500 tokens per slide (narration + body components) + 2K overhead.
    // Capped at 32K for safety (streaming handles long generations fine).
    const maxClaudeTokens = Math.min(32000, Math.max(8192, slideCount * 1500 + 2000));
    console.log(`[rich-video] Calling Claude (max_tokens=${maxClaudeTokens})`);
    const claudeStart = Date.now();
    const raw = await askClaude(
      systemPrompt,
      `Generate the ${slideCount}-slide rich narrated presentation on: "${topic.trim()}"`,
      maxClaudeTokens
    );
    console.log(
      `[rich-video] Claude done in ${Math.round((Date.now() - claudeStart) / 1000)}s, output chars=${raw?.length || 0}`
    );

    console.log("[rich-video] Claude responded", {
      rawLength: raw?.length || 0,
      startsWith: (raw || "").slice(0, 80),
      endsWith: (raw || "").slice(-80),
    });

    // ── Robust JSON recovery ──
    // Claude occasionally produces slightly broken JSON (unescaped
    // quotes in narration, trailing commas, truncated output). The
    // recoverDeckJson helper walks the slides array and extracts
    // every valid slide it can, so a single bad slide doesn't lose
    // the entire deck.
    const parsed: { deckTitle?: string; subtitle?: string; slides: Slide[] } | null =
      recoverDeckJson(raw) as any;

    if (!parsed?.slides?.length) {
      console.error("[rich-video] Unrecoverable Claude output", {
        length: raw?.length || 0,
        preview: (raw || "").slice(0, 500),
      });
      return NextResponse.json(
        {
          error:
            "Claude returned unparseable JSON. Please try again — this usually works on retry. If it keeps failing, try a different topic.",
        },
        { status: 500 }
      );
    }

    console.log("[rich-video] Recovered slide deck", {
      slidesGenerated: parsed.slides.length,
      deckTitle: parsed.deckTitle,
    });

    // ── PHASE 1 ONLY: save slide data to DB, return videoId ──
    // The actual rendering (PNG + TTS + FFmpeg) happens in a SEPARATE
    // request to /api/ai/rich-video/render so each request stays
    // well under Railway's HTTP proxy timeout (~5 min).
    const video = await prisma.video.create({
      data: {
        courseId,
        title: parsed.deckTitle || topic.trim(),
        description:
          parsed.subtitle ||
          `Rich ${parsed.slides.length}-slide narrated video (rendering…)`,
        url: "pending",   // will be updated by Phase 2
        sourceType: "presentation",
        lang,
        slidesData: JSON.stringify({
          deckTitle: parsed.deckTitle,
          subtitle: parsed.subtitle,
          slides: parsed.slides,
          accentColor,
          courseName,
        }),
      },
    });

    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "podcast_script",
      inputText: systemPrompt.slice(0, 500),
      outputText: raw.slice(0, 500),
    });

    return NextResponse.json({
      videoId: video.id,
      slideCount: parsed.slides.length,
      phase: "slides_ready",
    });
  } catch (e: any) {
    console.error("[rich-video] ERROR:", {
      message: e?.message,
      anthropic: e?.error?.error?.message,
      stack: e?.stack?.split("\n").slice(0, 3),
    });
    const detail =
      e?.error?.error?.message || e?.message || "Rich video generation failed";
    return NextResponse.json(
      { error: `Rich video generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
