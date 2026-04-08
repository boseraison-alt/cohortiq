import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logUsage } from "@/lib/usage";
import { generateSpeech, splitIntoChunks } from "@/lib/tts";

import type { SlideData } from "@/lib/slides";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { slides, topic, courseId, duration = 10, accentColor = "#C9956B", courseName = "Course", lang = "en" } =
      await req.json();

    if (!Array.isArray(slides) || !slides.length || !courseId) {
      return NextResponse.json({ error: "slides array and courseId required" }, { status: 400 });
    }

    const totalSlides = slides.length;

    // Generate TTS audio for each slide narration
    const enrichedSlides: any[] = [];
    let totalChars = 0;

    for (let i = 0; i < totalSlides; i++) {
      const slide = slides[i] as SlideData;
      totalChars += slide.narration.length;

      // Estimate duration from narration length (~150 words/min, ~5 chars/word)
      const estimatedDuration = Math.max(5, Math.round((slide.narration.length / 5 / 150) * 60));

      enrichedSlides.push({
        title: slide.title,
        points: slide.points,
        narration: slide.narration,
        icon: slide.icon,
        formulas: slide.formulas,
        duration: estimatedDuration,
      });
    }

    // Save as Video record — slide presentation view (no MP4 needed)
    const video = await prisma.video.create({
      data: {
        courseId,
        title: topic || "Study Material",
        description: `AI-generated ${totalSlides}-slide presentation (${duration} min)`,
        url: "slides-only",
        sourceType: "presentation",
        lang,
        slidesData: JSON.stringify(enrichedSlides),
      },
    });

    // Log TTS usage
    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "narration",
      ttsChars: totalChars,
    });

    return NextResponse.json({ video });
  } catch (e: any) {
    console.error("[narration/video]", e.message);
    return NextResponse.json({ error: e.message || "Video generation failed" }, { status: 500 });
  }
}
