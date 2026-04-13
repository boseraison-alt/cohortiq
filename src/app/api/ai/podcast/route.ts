import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { courseId, duration, customContext, style = "conversation", topic, lang = "en", materialIds } = await req.json();

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
    : `\n\nLANGUAGE REQUIREMENT: Generate the ENTIRE podcast script in ${langName}. Every line of dialogue — all PROF and ALEX speech — must be written in ${langName}. Do not switch to English at any point.`;

  const courseName = (await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }))?.name || "Course";

  // If customContext provided (e.g. from chat), use it directly instead of RAG
  let baseContext = customContext as string | null;

  if (!baseContext) {
    const chunkWhere: any = { courseId };
    if (materialIds?.length) {
      chunkWhere.materialId = { in: materialIds };
    }
    const chunks = await prisma.chunk.findMany({
      where: chunkWhere,
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
    });

    if (!chunks.length) return NextResponse.json({ error: "No materials found for selected sources" }, { status: 400 });
    baseContext = buildContext(chunks.slice(0, 30));
  }

  const segments = Math.ceil(duration / 5);
  const allLines: { host: string; text: string }[] = [];
  let prevSummary = "";

  for (let seg = 0; seg < segments; seg++) {
    const segMin = Math.min(5, duration - seg * 5);
    // For customContext, use same content for all segments (it's already focused)
    const ctx = baseContext;
    const wordTarget = segMin * 140;

    const contextLabel = customContext ? "CONVERSATION TO PODCAST" : "MATERIALS";
    const isLecture = style === "lecture";
    const topicFocus = topic ? ` focused specifically on the topic: "${topic}"` : "";

    const intro = customContext
      ? `Generate a ${segMin}-minute segment of an educational ${isLecture ? "lecture" : "podcast"} based SPECIFICALLY on the following student conversation and Q&A session from "${courseName}". Cover exactly the questions asked and answers given — do not drift to general course topics.`
      : `Generate a ${segMin}-minute segment of an educational ${isLecture ? "lecture" : "podcast"} for "${courseName}"${topicFocus}. ${topic ? `Stay focused on "${topic}" throughout — use the materials below only as context for this specific topic.` : "Cover the most important concepts from the materials."}`;

    const formatInstructions = isLecture
      ? `Write a single-voice lecture delivered by PROF (deep, authoritative professor voice). Structure it like a real lecture: introduce the topic clearly, build through key concepts with examples and explanations, use signposting phrases like "Let's turn to...", "Notice that...", "The key insight here is...", and wrap up with clear takeaways.

Write ~${wordTarget} words. Every line MUST start with PROF:

Format: PROF: text (one line per thought — keep each line to 1-3 sentences max)`
      : `Write a conversation between:
- PROF: Explains concepts clearly with authority
- ALEX: Asks great questions, makes real-world connections

Write ~${wordTarget} words. Be engaging and conversational. Use analogies.

Format: PROF: text or ALEX: text (one per line)`;

    const prefs = await getUserPrefsPrompt(userId);
    const system = `${prefs}${intro}

${formatInstructions}
${prevSummary ? `\nPrevious segment covered: ${prevSummary}. Continue naturally from where it left off.` : "\nStart with a brief introduction to the topic."}
${seg === segments - 1 ? "\nEnd with clear key takeaways and a memorable closing." : ""}${langInstruction}

${contextLabel}:
${ctx}`;

    try {
      const raw = await askClaude(system, `Generate podcast segment ${seg + 1}.`, 4096);
      const lines = raw
        .split("\n")
        .filter((l) => l.match(/^(PROF|ALEX):/))
        .map((l) => {
          const isProf = l.startsWith("PROF:");
          return { host: isProf ? "PROF" : "ALEX", text: l.slice(l.indexOf(":") + 1).trim() };
        });
      allLines.push(...lines);
      prevSummary += " " + lines.slice(0, 3).map((l) => l.text.slice(0, 50)).join("; ");
    } catch (e: any) {
      allLines.push({ host: "PROF", text: `Error generating segment: ${e.message}` });
    }
  }

  // Save podcast
  const allText = allLines.map(l => l.text).join(" ");
  const session2 = await getServerSession(authOptions);
  await logUsage({
    userId: (session2!.user as any).id,
    courseId,
    action: "podcast_script",
    inputText: `podcast ${duration}min`,
    outputText: allText,
  });

  const podcast = await prisma.podcast.create({
    data: {
      courseId,
      userId: (session2!.user as any).id,
      duration,
      topic: topic || null,
      script: allLines as any,
    },
  });

  return NextResponse.json({ id: podcast.id, script: allLines });
}

// GET saved podcasts
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const userId = (session.user as any).id;
  const podcasts = await prisma.podcast.findMany({
    where: { courseId, userId },
    select: { id: true, duration: true, topic: true, audioUrl: true, createdAt: true, script: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(podcasts);
}
