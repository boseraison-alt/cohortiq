import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { courseId, topic, duration = 10, weekIds, materialIds, lang = "en" } = await req.json();
    if (!courseId || !topic?.trim()) {
      return NextResponse.json({ error: "courseId and topic are required" }, { status: 400 });
    }

    const LANG_NAMES: Record<string, string> = {
      en: "English",
      ja: "Japanese",
      es: "Spanish",
      fr: "French",
      zh: "Mandarin Chinese",
    };
    const langName = LANG_NAMES[lang] ?? "English";
    const langInstruction = lang === "en"
      ? ""
      : `\n\nLANGUAGE: Generate ALL content (titles, bullet points, narration text) entirely in ${langName}. Do not mix languages.`;

    const courseName =
      (await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }))?.name ||
      "Course";

    const where: any = { courseId };
    if (materialIds?.length) {
      // Direct material ID filtering (from SourcePicker)
      where.materialId = { in: materialIds };
    } else if (weekIds?.length) {
      // Legacy week-based filtering
      const matIds = await prisma.material.findMany({
        where: { courseId, weekId: { in: weekIds } },
        select: { id: true },
      });
      where.materialId = { in: matIds.map((m: any) => m.id) };
    }

    const chunks = await prisma.chunk.findMany({
      where,
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
    });

    const context = chunks.length ? buildContext(chunks.slice(0, 30)) : "";
    const slideCount = Math.max(4, Math.ceil(duration / 1.5));

    const prefs = await getUserPrefsPrompt((session.user as any).id);
    const systemPrompt = `${prefs}You are an expert educational content creator for the course "${courseName}".
Create a narrated slide presentation as a JSON array.

RULES:
- Return ONLY a valid JSON array — no markdown fences, no commentary, no text before or after the array
- Create exactly ${slideCount} slides
- Each slide object: {"title": "...", "points": ["...", "..."], "narration": "...", "icon": "...", "formulas": [...]}
- title: concise heading, max 50 characters. Break at natural phrase boundaries.
- icon: a single emoji that represents the slide topic (e.g. "📊", "💡", "🎯", "📈", "🔢", "⚖️", "🏗️", "✅")
- points: 3-5 bullet points, each max 80 characters. These appear visually on the slide. Keep them as concise anchors.
- narration: 120-200 words of spoken narration for this slide. Written for a single narrator voice — clear, authoritative, engaging. When discussing formulas, walk through the calculation step by step.
- formulas: OPTIONAL array of formula strings. Include this WHENEVER the slide discusses calculations, formulas, or worked examples. Each string is one line of the formula/calculation panel. Use plain text math notation (e.g. "Break-even = Fixed Costs / CM per Unit", "= $48,000 / $6 = 8,000 units"). Show the general formula first, then the specific calculation with numbers. Omit this field entirely for non-quantitative slides.
- First slide = title/introduction slide (no formulas needed)
- Last slide = summary / key takeaways slide
- Use signposting in narration: "Let's begin with...", "Moving on to...", "To summarize..."
- Explain concepts deeply in narration, keep bullet points as concise visual anchors
- Ground content in the course materials below
- IMPORTANT: Any time a concept involves numbers, calculations, or formulas, you MUST include the formulas field with both the general formula AND a worked example with specific numbers

COURSE MATERIALS:
${context || "No materials loaded — use general knowledge of the topic."}${langInstruction}`;

    const raw = await askClaude(
      systemPrompt,
      `Create a ${duration}-minute narrated slide presentation on: "${topic.trim()}"`,
      8192
    );

    // Parse JSON from Claude response
    let slides;
    try {
      slides = JSON.parse(raw);
    } catch {
      // Try to extract JSON array from response if Claude wrapped it in text
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        slides = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json({ error: "Failed to parse slide structure. Please try again." }, { status: 500 });
      }
    }

    if (!Array.isArray(slides) || !slides.length) {
      return NextResponse.json({ error: "No slides generated" }, { status: 500 });
    }

    // Validate slide structure
    slides = slides.map((s: any) => ({
      title: String(s.title || "Untitled Slide").slice(0, 80),
      points: (Array.isArray(s.points) ? s.points : []).map((p: any) => String(p).slice(0, 120)),
      narration: String(s.narration || ""),
      icon: typeof s.icon === "string" ? s.icon.slice(0, 4) : "",
      formulas: Array.isArray(s.formulas) ? s.formulas.map((f: any) => String(f).slice(0, 120)) : undefined,
    }));

    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "podcast_script",
      inputText: systemPrompt,
      outputText: raw,
    });

    return NextResponse.json({ slides, topic: topic.trim(), duration, courseId, courseName });
  } catch (e: any) {
    // Log rich error info so Railway logs show what actually went wrong
    console.error("[narration/script] ERROR:", {
      message: e?.message,
      name: e?.name,
      status: e?.status,
      type: e?.error?.type,
      anthropicError: e?.error?.error?.message,
      stack: e?.stack?.split("\n").slice(0, 3),
    });

    // Surface the most useful message we can find
    const detail =
      e?.error?.error?.message ||  // Anthropic SDK structured error
      e?.message ||
      e?.toString?.() ||
      "Slide generation failed";

    return NextResponse.json({ error: `Slide generation failed: ${detail}` }, { status: 500 });
  }
}
