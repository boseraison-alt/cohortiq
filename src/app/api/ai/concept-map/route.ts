import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id;
    const { courseId } = await req.json();
    if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });

    // Get all chunks ordered by index for full course context
    const allChunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
    });

    // Sample evenly across the course
    const step = Math.max(1, Math.floor(allChunks.length / 20));
    const sampled = allChunks.filter((_, i) => i % step === 0).slice(0, 20);

    const chunkContext = sampled
      .map((c) => `[${c.title}]\n${c.text.slice(0, 500)}`)
      .join("\n\n---\n\n");

    const prefs = await getUserPrefsPrompt(userId);
    const systemPrompt = `${prefs}You are building a hierarchical study guide for the course "${course?.name || "course"}".

Analyze the course materials below and create a TREE structure organized by chapter/topic.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences:
{
  "title": "${course?.name || "Course"}",
  "branches": [
    {
      "id": "b1",
      "label": "Chapter or Topic Title",
      "summary": "2-3 sentence overview of this chapter/topic and why it matters",
      "children": [
        {
          "id": "b1-1",
          "label": "Key Concept Name",
          "summary": "1-2 sentence explanation of this concept",
          "children": [
            {
              "id": "b1-1-1",
              "label": "Sub-detail",
              "summary": "Brief explanation",
              "children": []
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Organize by chapter/topic as they appear in the course (maintain course order)
- Each chapter should have 3-6 key concept children
- Key concepts can have 0-3 sub-detail children (only if meaningful)
- Every node MUST have a summary (1-3 sentences explaining the concept)
- Keep labels short (2-6 words)
- IDs must be unique and hierarchical (b1, b1-1, b1-1-1)
- Total: 5-10 top-level branches, 30-50 nodes total
- Focus on the most important concepts students need to know`;

    const raw = await askClaude(systemPrompt, chunkContext, 4096);

    // Extract JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse mind map JSON");
    const tree = JSON.parse(jsonMatch[0]);

    await logUsage({
      userId,
      courseId,
      action: "concept_map",
      inputTokens: 0,
      outputTokens: 0,
      ttsChars: 0,
      costUsd: 0,
    });

    return NextResponse.json(tree);
  } catch (e: any) {
    console.error("[concept-map]", e.message);
    return NextResponse.json({ error: e.message || "Failed to generate mind map" }, { status: 500 });
  }
}
