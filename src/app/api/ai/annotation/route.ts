import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { courseId, question, slideContext } = await req.json();

    if (!courseId || !question?.trim() || !slideContext) {
      return NextResponse.json({ error: "courseId, question, and slideContext required" }, { status: 400 });
    }

    // Build focused context from the slide
    const slideSection = [
      `## Slide: ${slideContext.title}`,
      "",
      "Key Points:",
      ...(slideContext.points || []).map((p: string) => `- ${p}`),
      "",
      "Narration:",
      slideContext.narration || "",
      slideContext.formulas?.length ? `\nFormulas: ${slideContext.formulas.join(", ")}` : "",
    ].join("\n");

    // Also fetch broader course context for richer answers
    const chunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { text: true, title: true, chunkIndex: true },
      take: 15,
      orderBy: { chunkIndex: "desc" },
    });
    const courseContext = buildContext(chunks);

    const systemPrompt = `You are a helpful study assistant for a university course. A student is watching a video presentation and has a question about a specific slide.

## SLIDE CONTENT (Primary Focus)
${slideSection}

## BROADER COURSE CONTEXT
${courseContext.slice(0, 6000)}

## INSTRUCTIONS
- Answer the student's question about this specific slide
- Use the slide content as the primary source
- Reference broader course materials when helpful for additional context
- Be concise but thorough — aim for 2-4 paragraphs
- If the question is about a formula or calculation on the slide, show worked examples
- Use a friendly, tutoring tone`;

    const answer = await askClaude(systemPrompt, question.trim());

    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "annotation",
      inputText: systemPrompt + question,
      outputText: answer,
    });

    return NextResponse.json({ answer });
  } catch (e: any) {
    console.error("[annotation]", e.message);
    return NextResponse.json({ error: e.message || "Failed to answer" }, { status: 500 });
  }
}
