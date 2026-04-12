import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateRichVideoFull } from "@/lib/richVideoRenderer";

export const dynamic = "force-dynamic";

/**
 * Rich Video — instant response + full background processing.
 *
 * The HTTP request returns in <1 second. ALL heavy work (Claude,
 * PNG rendering, TTS, FFmpeg) runs in the background on the Node.js
 * process. The client polls /api/ai/rich-video/status for completion.
 *
 * This permanently avoids Railway's HTTP proxy timeout.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId, topic, numSlides = 8, lang = "en" } = await req.json();
    if (!courseId || !topic?.trim()) {
      return NextResponse.json(
        { error: "courseId and topic are required" },
        { status: 400 }
      );
    }

    const slideCount = Math.min(30, Math.max(5, Number(numSlides) || 8));

    // Create a placeholder video row immediately
    const video = await prisma.video.create({
      data: {
        courseId,
        title: topic.trim().slice(0, 200),
        description: `Generating ${slideCount}-slide rich video…`,
        url: "pending",
        sourceType: "presentation",
        lang,
      },
    });

    // Fire-and-forget: everything runs in the background
    generateRichVideoFull({
      videoId: video.id,
      userId: (session.user as any).id,
      courseId,
      topic: topic.trim(),
      slideCount,
      lang,
    }).catch((err) => {
      console.error("[rich-video] Background generation failed:", err?.message);
    });

    // Return IMMEDIATELY — client will poll /status
    return NextResponse.json({
      videoId: video.id,
      slideCount,
      phase: "rendering",
    });
  } catch (e: any) {
    console.error("[rich-video] Route error:", e?.message);
    return NextResponse.json(
      { error: `Failed to start generation: ${e?.message || "unknown"}` },
      { status: 500 }
    );
  }
}
