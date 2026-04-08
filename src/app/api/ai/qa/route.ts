import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { retrieveRelevantChunks, buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { courseId, question, weekIds } = await req.json();
  if (!question?.trim()) return NextResponse.json({ error: "Question required" }, { status: 400 });

  // Get chunks, optionally filtered by weeks
  const where: any = { courseId };
  if (weekIds?.length) {
    const materialIds = await prisma.material.findMany({
      where: { courseId, weekId: { in: weekIds } },
      select: { id: true },
    });
    where.materialId = { in: materialIds.map((m) => m.id) };
  }

  const allChunks = await prisma.chunk.findMany({
    where,
    select: { id: true, title: true, text: true, chunkIndex: true },
  });

  if (!allChunks.length) {
    return NextResponse.json({ answer: "No materials loaded yet. Add materials first." });
  }

  const relevant = retrieveRelevantChunks(allChunks, question);
  const ctx = buildContext(relevant);

  const courseName = (await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }))?.name || "Course";

  const prefs = await getUserPrefsPrompt((session.user as any).id);
  const system = `${prefs}You are a study assistant for the MBA course "${courseName}". Answer ONLY from the materials below. Reference which material you draw from. If the question cannot be answered from these materials, say: "⚠️ This is not covered in the current materials" and mention what related topics ARE covered.\n\nMATERIALS:\n${ctx}`;

  const answer = await askClaude(system, question);

  await logUsage({
    userId: (session!.user as any).id,
    courseId,
    action: "qa",
    inputText: system + question,
    outputText: answer,
  });

  return NextResponse.json({ answer, chunksSearched: allChunks.length, chunksUsed: relevant.length });
}
