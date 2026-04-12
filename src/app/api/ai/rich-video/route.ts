import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";
import { generateSpeech, splitIntoChunks } from "@/lib/tts";
import { renderSlideToPng } from "@/lib/slides";
import { buildRichSlideSvg } from "@/lib/richSlides";
import { compositeVideo } from "@/lib/ffmpeg";
import { getUploadDir, getUploadUrl } from "@/lib/uploads";
import { mkdir } from "fs/promises";
import path from "path";
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

    const { courseId, topic, numSlides = 12, lang = "en" } = await req.json();
    if (!courseId || !topic?.trim()) {
      return NextResponse.json(
        { error: "courseId and topic are required" },
        { status: 400 }
      );
    }

    const slideCount = Math.min(20, Math.max(5, Number(numSlides) || 12));

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
  "narration": "120-180 words of natural spoken narration for this slide — written for a single clear narrator voice. Walk through the concept conversationally. Do NOT read the bullet points verbatim. Explain, connect, and add insight."
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
OTHER RULES
═══════════════════════════════════════════════════════════════
1. Each slide must have 3-4 body components. At least 1 MUST be an example (icard/formula/sbox with named company or specific numbers).
2. Narration is 120-180 words — natural, conversational, walks through each example.
3. When discussing any calculation, include a formula component AND an icard "WORKED EXAMPLE" with real numbers.
4. When comparing 2 things, use grid2 + 2 example icards. When comparing 3, use grid3 or segments + examples.
5. When discussing numeric data, use a graph component (barchart/linechart/piechart/metrics/progress).
6. Ground content in the course materials below. If the materials lack specific examples, use accurate real-world examples from your knowledge of the topic.
7. Use real company names, real years, real dollar amounts whenever possible.
8. Keep component body text concise — ~12-15 words per box.
9. Use **bold** in body text (the renderer will strip ** markers).

COURSE MATERIALS:
${context || "No materials loaded — use general knowledge of the topic."}${langInstruction}`;

    const raw = await askClaude(
      systemPrompt,
      `Generate the ${slideCount}-slide rich narrated presentation on: "${topic.trim()}"`,
      16000
    );

    console.log("[rich-video] Claude responded", {
      rawLength: raw?.length || 0,
      startsWith: (raw || "").slice(0, 80),
    });

    // Parse JSON
    let parsed: { deckTitle?: string; subtitle?: string; slides: Slide[] };
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) {
        return NextResponse.json(
          { error: `Claude returned non-JSON output. First 300 chars: ${raw.slice(0, 300)}` },
          { status: 500 }
        );
      }
      parsed = JSON.parse(raw.slice(start, end + 1));
    }

    if (!parsed?.slides || !Array.isArray(parsed.slides) || !parsed.slides.length) {
      return NextResponse.json({ error: "No slides generated" }, { status: 500 });
    }

    // ── Render each slide: SVG → PNG + TTS audio ──
    const totalSlides = parsed.slides.length;
    const slideMedia: { png: Buffer; mp3: Buffer }[] = [];

    for (let i = 0; i < totalSlides; i++) {
      const slide = parsed.slides[i];

      // Render SVG → PNG using existing resvg-js pipeline
      const svg = buildRichSlideSvg(slide, i, totalSlides, accentColor, courseName);
      const png = await renderSlideToPng(svg);

      // Generate TTS audio with the SAME "onyx" voice used by existing videos
      const narrationText = slide.narration ||
        `${slide.title}. ${(slide.body || []).map((c: any) =>
          c.type === "bullets" ? c.items?.map((i: any) => i.text).join(". ") :
          c.type === "quote" ? c.text :
          c.type === "sbox" ? `${c.box?.title}. ${c.box?.body}` :
          c.type === "formula" ? c.text : ""
        ).join(". ")}`;

      const chunks = splitIntoChunks(narrationText, 4000);
      const audioBuffers: Buffer[] = [];
      for (const chunk of chunks) {
        const buf = await generateSpeech(chunk, "onyx");
        audioBuffers.push(buf);
      }
      const mp3 = Buffer.concat(audioBuffers);

      slideMedia.push({ png, mp3 });
      console.log(`[rich-video] Rendered slide ${i + 1}/${totalSlides}`);
    }

    // ── Composite into MP4 ──
    const uploadDir = getUploadDir("videos");
    await mkdir(uploadDir, { recursive: true });

    const safeTopic = (topic || "rich_presentation")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const fileName = `rich_${safeTopic}_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, fileName);

    const { fileSize, slideDurations } = await compositeVideo(slideMedia, outputPath, {
      cinematic: true,
    });

    // Build enriched slide data — include both rich components and legacy fields
    // so the existing AnnotatedVideoPlayer can still render the right-side panel.
    const enrichedSlides = parsed.slides.map((s: Slide, i: number) => ({
      // Legacy fields used by AnnotatedVideoPlayer
      title: s.title,
      points: (s.body || [])
        .flatMap((c: any) => {
          if (c.type === "bullets") return (c.items || []).map((i: any) => i.text);
          if (c.type === "sbox") return [`${c.box?.title}: ${c.box?.body}`];
          if (c.type === "grid2" || c.type === "grid3") return (c.boxes || []).map((b: any) => `${b.title}: ${b.body}`);
          if (c.type === "quote") return [`"${c.text}"`];
          if (c.type === "formula") return [c.text];
          if (c.type === "icard") return [`${c.title}: ${c.body}`];
          return [];
        })
        .slice(0, 8),
      narration: s.narration || "",
      icon: "",
      formulas: (s.body || [])
        .filter((c: any) => c.type === "formula")
        .map((c: any) => c.text),
      duration: slideDurations[i] ?? 30,
      // Rich fields — kept so the data round-trips correctly
      tag: s.tag,
      tagColor: s.tagColor,
      body: s.body,
    }));

    // Save as Video row
    const video = await prisma.video.create({
      data: {
        courseId,
        title: parsed.deckTitle || topic.trim(),
        description:
          parsed.subtitle ||
          `Rich ${totalSlides}-slide narrated video`,
        url: getUploadUrl("videos", fileName),
        sourceType: "presentation",
        fileName,
        fileSize,
        lang,
        slidesData: JSON.stringify(enrichedSlides),
      },
    });

    // Log TTS usage
    const totalChars = parsed.slides.reduce(
      (acc: number, s: Slide) => acc + (s.narration?.length || 0),
      0
    );
    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "narration",
      ttsChars: totalChars,
    });

    return NextResponse.json({
      video,
      videoUrl: getUploadUrl("videos", fileName),
      slideCount: totalSlides,
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
