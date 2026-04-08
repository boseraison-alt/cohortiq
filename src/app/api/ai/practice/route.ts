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
  const { courseId, numQuestions, questionType, mode, customTopic } = await req.json();

  const chunks = await prisma.chunk.findMany({
    where: { courseId },
    select: { title: true, text: true, chunkIndex: true },
    take: 60,
  });

  if (!chunks.length) {
    return NextResponse.json({ error: "No materials found" }, { status: 400 });
  }

  const ctx = buildContext(chunks);
  const courseName = (await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }))?.name || "Course";

  const typeInstr =
    questionType === "mcq" ? "multiple-choice (4 options)" :
    questionType === "short" ? "short-answer" :
    questionType === "essay" ? "essay/analytical" :
    "a mix of multiple-choice, short-answer, and essay";

  // Build weakness instruction for weighted mode
  let weakInstr = "";
  if (mode === "weighted") {
    const perfData = await prisma.performance.findMany({
      where: { courseId, userId },
      select: { topic: true, correct: true },
    });

    const topicStats: Record<string, { total: number; wrong: number }> = {};
    for (const p of perfData) {
      if (!topicStats[p.topic]) topicStats[p.topic] = { total: 0, wrong: 0 };
      topicStats[p.topic].total++;
      if (!p.correct) topicStats[p.topic].wrong++;
    }

    const weakTopics = Object.entries(topicStats)
      .map(([topic, s]) => ({ topic, rate: s.wrong / s.total }))
      .filter((x) => x.rate > 0.3)
      .sort((a, b) => b.rate - a.rate);

    if (weakTopics.length > 0) {
      weakInstr = `\n\nIMPORTANT — WEAKNESS TARGETING: The student struggles with these topics: ${weakTopics.map((w) => `"${w.topic}" (${Math.round(w.rate * 100)}% incorrect)`).join(", ")}.\nWeight 60% of questions toward these weak areas. 40% on other material.`;
    }
  }

  if (mode === "cumulative") {
    weakInstr = `\n\nThis is a CUMULATIVE FINAL EXAM REVIEW. Cover ALL materials proportionally. Include questions connecting concepts across topics. Test both breadth and depth.`;
  }

  const topicInstr = customTopic
    ? `\n\nTOPIC FOCUS: The student specifically wants questions on "${customTopic}". All questions MUST be about this topic only.`
    : "";

  const prefs = await getUserPrefsPrompt((session.user as any).id);
  const system = `${prefs}Generate EXACTLY ${numQuestions} ${typeInstr} questions for "${courseName}".${weakInstr}${topicInstr}

MATERIALS:
${ctx}

Respond in EXACT JSON (no markdown, no backticks):
[{"q":"question","type":"mcq|short|essay","topic":"topic from materials","options":["A","B","C","D"],"answer":"model answer","explanation":"why, referencing materials"}]
For non-MCQ omit "options". Make questions progressively harder.`;

  const raw = await askClaude(system, `Generate ${numQuestions} practice questions.`);
  const questions = JSON.parse(raw.replace(/```json|```/g, "").trim());

  await logUsage({
    userId,
    courseId,
    action: "practice",
    inputText: system,
    outputText: raw,
  });

  return NextResponse.json({ questions });
}
