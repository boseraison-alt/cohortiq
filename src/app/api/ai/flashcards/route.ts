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

  const { courseId, numCards, customTopic } = await req.json();

  const chunks = await prisma.chunk.findMany({
    where: { courseId },
    select: { title: true, text: true, chunkIndex: true },
    take: 40,
  });

  if (!chunks.length) return NextResponse.json({ error: "No materials" }, { status: 400 });

  const courseName = (await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }))?.name || "Course";
  const ctx = buildContext(chunks);

  const topicFocus = customTopic
    ? ` Focus EXCLUSIVELY on the topic: "${customTopic}".`
    : " Cover key concepts, frameworks, formulas, distinctions across all material.";

  const prefs = await getUserPrefsPrompt((session.user as any).id);
  const system = `${prefs}Generate EXACTLY ${numCards} flashcards for "${courseName}".${topicFocus}

FLASHCARD RULES:
- Cover EVERY learning objective, formula, key distinction, and important concept in the materials — not just the main themes.
- Include formula cards: front = "What is the formula for X?", back = the formula with variable definitions.
- Include distinction cards: front = "What is the difference between X and Y?", back = clear comparison.
- Include application cards: front = "When would you use X?", back = practical scenario.
- Each card should test a single, specific concept — not a broad topic.
- Back of card should be a complete, self-contained explanation (not just a one-word answer).

MATERIALS:
${ctx}

Respond in JSON (no markdown, no backticks):
[{"front":"question/concept","back":"answer/explanation","topic":"source topic"}]`;

  const raw = await askClaude(system, `Generate ${numCards} flashcards.`);
  const cards = JSON.parse(raw.replace(/```json|```/g, "").trim());

  await logUsage({
    userId: (session!.user as any).id,
    courseId,
    action: "flashcards",
    inputText: system,
    outputText: raw,
  });

  // Save to DB
  const created = await Promise.all(
    cards.map((c: any) =>
      prisma.flashcard.create({
        data: { courseId, front: c.front, back: c.back, topic: c.topic || null },
      })
    )
  );

  return NextResponse.json(created);
}
