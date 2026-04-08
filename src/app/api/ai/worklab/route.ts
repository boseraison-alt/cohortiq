import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { retrieveRelevantChunks, buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id;
    const { courseId, framework, userData } = await req.json();

    if (!courseId || !framework?.trim() || !userData?.trim()) {
      return NextResponse.json({ error: "courseId, framework, and userData are required" }, { status: 400 });
    }

    const allChunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { id: true, title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
    });

    const relevantChunks = allChunks.length
      ? retrieveRelevantChunks(allChunks, framework.trim(), 12)
      : [];
    const context = buildContext(relevantChunks);

    const courseName = (await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    }))?.name || "Course";

    const prefs = await getUserPrefsPrompt(userId);
    const systemPrompt = `${prefs}You are a study assistant helping a student apply course frameworks to their own professional work context. The student has pasted their own data (anonymized) and wants to see a specific framework applied to it.

Your job:
1. Briefly confirm which framework you're applying and why it fits the data provided
2. Apply the framework step-by-step to the student's specific numbers and scenario — use their actual figures, not generic examples
3. Show your work clearly — each step should reference the student's data directly
4. Provide a conclusion with 2-3 concrete, actionable insights derived from the analysis
5. Note any assumptions you had to make due to missing information

TONE: Be rigorous and analytical, like a management consultant walking through a deliverable. Be concise — no padding.

FORMATTING: No markdown asterisks for bold (no **text**). Use CAPS for section titles. Use numbered steps and dashes for bullets. Clear paragraph breaks.

IMPORTANT DISCLAIMER TO ADD AT END: Always end your response with exactly this line:
"---
Note: This analysis is for educational purposes only and does not constitute professional financial, legal, or business advice. Validate important decisions with qualified professionals."

COURSE MATERIALS (use to ground the framework explanation and cite relevant concepts):
${context || "No course materials available for this course yet."}`;

    const userMessage = `Framework to apply: ${framework.trim()}

My data:
${userData.trim()}`;

    const analysis = await askClaude(systemPrompt, userMessage, 4096);

    await logUsage({
      userId,
      courseId,
      action: "worklab",
      inputText: systemPrompt + userMessage,
      outputText: analysis,
    });

    return NextResponse.json({ analysis });
  } catch (e: any) {
    console.error("[worklab]", e.message);
    return NextResponse.json({ error: e.message || "Analysis failed" }, { status: 500 });
  }
}
