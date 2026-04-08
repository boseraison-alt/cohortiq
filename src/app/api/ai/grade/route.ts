import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { retrieveRelevantChunks, buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { courseId, question, modelAnswer, userAnswer, topic } = await req.json();

  // Retrieve relevant chunks for context
  const allChunks = await prisma.chunk.findMany({
    where: { courseId },
    select: { id: true, title: true, text: true, chunkIndex: true },
  });

  const relevant = retrieveRelevantChunks(allChunks, question + " " + (topic || ""));
  const ctx = buildContext(relevant);

  const system = `Grade this MBA student's answer. Be constructive and specific.

MATERIALS:
${ctx}

Respond in JSON (no markdown, no backticks):
{"score":"A|B|C|D|F","correct":true|false,"feedback":"specific feedback referencing course materials","missed":["things they missed"]}`;

  const raw = await askClaude(system, `Question: ${question}\nModel answer: ${modelAnswer}\nStudent's answer: ${userAnswer}`);
  const grade = JSON.parse(raw.replace(/```json|```/g, "").trim());

  await logUsage({ userId, courseId, action: "grade", inputText: system, outputText: raw });

  // Record performance
  await prisma.performance.create({
    data: {
      courseId,
      userId,
      topic: topic || "General",
      question: question.slice(0, 200),
      correct: grade.correct,
      score: grade.score,
    },
  });

  return NextResponse.json(grade);
}
