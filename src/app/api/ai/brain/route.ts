import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { retrieveRelevantChunks } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id;
    const { question } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }

    // Get all courses (same visibility as the main courses endpoint)
    const courses = await prisma.course.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { createdAt: "asc" },
    });

    if (!courses.length) {
      return NextResponse.json({ error: "No courses found" }, { status: 404 });
    }

    // For each course, fetch and score chunks against the query
    const CHUNKS_PER_COURSE = 12;
    const courseContexts: { courseId: string; courseName: string; color: string; chunkCount: number; context: string }[] = [];

    for (const course of courses) {
      const allChunks = await prisma.chunk.findMany({
        where: { courseId: course.id },
        select: { id: true, title: true, text: true, chunkIndex: true },
        orderBy: { chunkIndex: "asc" },
      });

      if (!allChunks.length) continue;

      const relevant = retrieveRelevantChunks(allChunks, question, CHUNKS_PER_COURSE);
      if (!relevant.length) continue;

      // Build course section with labeled header
      const byTitle: Record<string, typeof relevant> = {};
      for (const c of relevant) {
        if (!byTitle[c.title]) byTitle[c.title] = [];
        byTitle[c.title].push(c);
      }
      const context = Object.entries(byTitle)
        .map(([title, chs]) =>
          `  ── ${title} ──\n${chs.sort((a, b) => a.chunkIndex - b.chunkIndex).map((c) => c.text).join("\n")}`
        )
        .join("\n\n");

      courseContexts.push({
        courseId: course.id,
        courseName: course.name,
        color: course.color,
        chunkCount: relevant.length,
        context,
      });
    }

    if (!courseContexts.length) {
      return NextResponse.json({ error: "No course materials found to search across." }, { status: 404 });
    }

    // Build the combined cross-course context
    const combinedContext = courseContexts
      .map((cc) => `╔══════════════════════════════════════\n║ COURSE: ${cc.courseName}\n╚══════════════════════════════════════\n\n${cc.context}`)
      .join("\n\n\n");

    const prefs = await getUserPrefsPrompt(userId);
    const systemPrompt = `${prefs}You are CohortIQ's cross-course "Master Mind" — an AI that synthesizes knowledge across an entire MBA curriculum. You have access to materials from ${courseContexts.length} course${courseContexts.length > 1 ? "s" : ""}: ${courseContexts.map((c) => `"${c.courseName}"`).join(", ")}.

## YOUR ROLE
- Find the **connections and intersections** between courses — this is your unique value
- When concepts from multiple courses relate, explicitly bridge them: "In Accounting, [X] → In Marketing, this means [Y]"
- Cite which course each insight comes from using [Course Name] tags
- If a concept only appears in one course, answer from that course and note there's no direct parallel in others
- Be direct, insightful, and synthesis-focused — not just a summary

## CURRICULUM CONTEXT
${combinedContext.slice(0, 16000)}

## ANSWER GUIDELINES
- Lead with the cross-course synthesis if applicable
- Use clear structure: headers for each course section if needed
- Aim for 3-5 paragraphs
- End with a "Key Takeaway" that ties everything together`;

    const answer = await askClaude(systemPrompt, question.trim(), 4096);

    // Log usage against the first course (no courseId for cross-course)
    await logUsage({
      userId: (session.user as any).id,
      courseId: courseContexts[0].courseId,
      action: "qa",
      inputText: systemPrompt + question,
      outputText: answer,
    });

    const sourcesOut = courseContexts.map((cc) => ({
      courseId: cc.courseId,
      courseName: cc.courseName,
      color: cc.color,
      chunkCount: cc.chunkCount,
    }));

    // Save to search history
    await prisma.brainSearchHistory.create({
      data: {
        userId,
        question: question.trim(),
        answer,
        sources: JSON.stringify(sourcesOut.map((s) => ({ courseName: s.courseName, color: s.color }))),
      },
    }).catch(() => {});

    return NextResponse.json({ answer, sources: sourcesOut });
  } catch (e: any) {
    console.error("[brain]", e.message);
    return NextResponse.json({ error: e.message || "Brain search failed" }, { status: 500 });
  }
}
