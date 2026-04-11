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

CRITICAL RULES:
1. Each slide must have 2-3 body components (NOT just bullets).
2. Narration is 120-180 words — natural, conversational, connects ideas.
3. When discussing calculations, ALWAYS include a formula component.
4. When comparing 2 things, use grid2. When comparing 3, use grid3 or segments.
5. Ground content in the course materials below.
6. Keep component body text concise — ~12-15 words per box.
7. Use **bold** in body text (the renderer will strip ** markers).

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

    const { fileSize, slideDurations } = await compositeVideo(slideMedia, outputPath);

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
