import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { classifyByKeywords, classifyWithLLM, type VideoTool } from "@/lib/videoRouter";
import { generateXPilotVideo } from "@/lib/xpilot";
import { generateHeyGenVideo } from "@/lib/heygen";

export const dynamic = "force-dynamic";
export const maxDuration = 900; // 15 minutes — external APIs can be slow

/**
 * Generate a rich, animated narrated video using external services.
 *
 * Flow:
 *  1. Classify the topic (X-Pilot for technical/data, HeyGen for instructor-led)
 *  2. Call the selected service with the lesson content
 *  3. Poll until the video is ready
 *  4. Save as a Video row with sourceType="xpilot" or "heygen"
 *  5. Return the new video row so the frontend can show it
 */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      courseId,
      topic,
      forceTool,          // optional: "xpilot" | "heygen" | "static"
      useLLMRouter,       // optional boolean — use Claude for routing
      lang = "en",
    } = await req.json();

    if (!courseId || !topic?.trim()) {
      return NextResponse.json(
        { error: "courseId and topic are required" },
        { status: 400 }
      );
    }

    // ── Check API keys early so we can give a helpful error ──
    const xpilotKey = process.env.XPILOT_API_KEY || "";
    const heygenKey = process.env.HEYGEN_API_KEY || "";
    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

    // ── Pull course info + materials ──
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });
    const courseName = course?.name || "Course";
    const subject = courseName.toLowerCase();

    const chunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
      take: 20,
    });
    const context = chunks.length ? buildContext(chunks) : "";

    // Build a focused lesson content string: topic header + most relevant chunks
    const lessonContent =
      `Topic: ${topic.trim()}\n\nCourse: ${courseName}\n\n${context}`.slice(0, 12000);

    // ── Route to the right tool ──
    let tool: VideoTool;
    let reason: string;

    if (forceTool) {
      tool = forceTool as VideoTool;
      reason = "Manually selected by user";
    } else {
      const analysis = useLLMRouter && anthropicKey
        ? await classifyWithLLM(lessonContent, subject, anthropicKey)
        : classifyByKeywords(lessonContent);
      tool = analysis.tool;
      reason = analysis.reason;
    }

    console.log("[video-rich] Routing decision", { tool, reason, topic: topic.trim() });

    // ── Check the required API key for the selected tool ──
    if (tool === "xpilot" && !xpilotKey) {
      return NextResponse.json(
        {
          error:
            "X-Pilot not configured. Add XPILOT_API_KEY to your Railway environment variables. Get a key at https://x-pilot.ai",
        },
        { status: 501 }
      );
    }
    if (tool === "heygen" && !heygenKey) {
      return NextResponse.json(
        {
          error:
            "HeyGen not configured. Add HEYGEN_API_KEY to your Railway environment variables. Get a key at https://heygen.com",
        },
        { status: 501 }
      );
    }
    if (tool === "runway") {
      return NextResponse.json(
        {
          error:
            "Runway integration is not yet implemented — Runway requires an image input (different flow). Use forceTool: 'xpilot' or 'heygen' instead.",
        },
        { status: 501 }
      );
    }
    if (tool === "static") {
      return NextResponse.json(
        {
          error:
            "Static generation is handled by the existing video generator. Use the regular Generate button instead.",
        },
        { status: 400 }
      );
    }

    // ── Generate the video ──
    let videoUrl: string;
    let thumbnailUrl: string | undefined;
    let duration: number | undefined;

    try {
      if (tool === "xpilot") {
        const result = await generateXPilotVideo(
          {
            title: topic.trim(),
            content: lessonContent,
            subject,
          },
          xpilotKey
        );
        videoUrl = result.videoUrl;
        thumbnailUrl = result.thumbnailUrl;
        duration = result.duration;
      } else if (tool === "heygen") {
        const result = await generateHeyGenVideo(
          {
            title: topic.trim(),
            content: lessonContent,
            subject,
          },
          heygenKey
        );
        videoUrl = result.videoUrl;
        thumbnailUrl = result.thumbnailUrl;
        duration = result.duration;
      } else {
        throw new Error(`Unexpected tool: ${tool}`);
      }
    } catch (genErr: any) {
      console.error("[video-rich] Generation error", {
        tool,
        message: genErr?.message,
        stack: genErr?.stack?.split("\n").slice(0, 3),
      });
      return NextResponse.json(
        { error: `${tool} generation failed: ${genErr?.message || "unknown"}` },
        { status: 500 }
      );
    }

    // ── Save as a Video row ──
    const video = await prisma.video.create({
      data: {
        courseId,
        title: topic.trim(),
        description: `${tool.toUpperCase()} video (${reason})${duration ? ` — ${Math.round(duration)}s` : ""}`,
        url: videoUrl,
        sourceType: tool, // "xpilot" or "heygen"
        fileName: null,
        fileSize: null,
        lang,
      },
    });

    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "podcast_audio",
      inputText: lessonContent.slice(0, 1000),
      outputText: `${tool} video generated: ${videoUrl}`,
    });

    return NextResponse.json({
      video,
      tool,
      reason,
      thumbnailUrl,
      duration,
    });
  } catch (e: any) {
    console.error("[video-rich] TOP-LEVEL ERROR", {
      message: e?.message,
      stack: e?.stack?.split("\n").slice(0, 3),
    });
    return NextResponse.json(
      { error: `Rich video generation failed: ${e?.message || "unknown error"}` },
      { status: 500 }
    );
  }
}
