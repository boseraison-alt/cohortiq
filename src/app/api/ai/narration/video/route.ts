import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logUsage } from "@/lib/usage";
import { generateSpeech, splitIntoChunks } from "@/lib/tts";
import { buildSlideSvg, renderSlideToPng } from "@/lib/slides";
import { compositeVideo } from "@/lib/ffmpeg";
import { getUploadDir, getUploadUrl } from "@/lib/uploads";
import { mkdir } from "fs/promises";
import path from "path";

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
    const slideMedia: { png: Buffer; mp3: Buffer }[] = [];

    // Process each slide: render image + generate audio
    for (let i = 0; i < totalSlides; i++) {
      const slide = slides[i] as SlideData;

      // Render slide SVG → PNG
      const svg = buildSlideSvg(slide, i, totalSlides, accentColor, courseName);
      const png = await renderSlideToPng(svg);

      // Generate TTS audio for narration
      const narrationChunks = splitIntoChunks(slide.narration, 4000);
      const audioBuffers: Buffer[] = [];
      for (const chunk of narrationChunks) {
        const buf = await generateSpeech(chunk, "onyx");
        audioBuffers.push(buf);
      }
      const mp3 = Buffer.concat(audioBuffers);

      slideMedia.push({ png, mp3 });
    }

    // Composite all slides into a single MP4 video
    const uploadDir = getUploadDir("videos");
    await mkdir(uploadDir, { recursive: true });

    const safeTopic = (topic || "presentation")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const fileName = `presentation_${safeTopic}_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, fileName);

    const { fileSize, slideDurations } = await compositeVideo(slideMedia, outputPath, {
      cinematic: false,
    });

    // Enrich slides with per-slide audio durations for annotation timeline
    const enrichedSlides = slides.map((s: SlideData, i: number) => ({
      title: s.title,
      points: s.points,
      narration: s.narration,
      icon: s.icon,
      formulas: s.formulas,
      duration: slideDurations[i] ?? 30,
    }));

    // Save as Video record
    const video = await prisma.video.create({
      data: {
        courseId,
        title: topic || "Study Material",
        description: `AI-generated ${totalSlides}-slide presentation (${duration} min)`,
        url: getUploadUrl("videos", fileName),
        sourceType: "presentation",
        fileName,
        fileSize,
        lang,
        slidesData: JSON.stringify(enrichedSlides),
      },
    });

    // Log TTS usage
    const totalChars = slides.reduce((s: number, sl: SlideData) => s + sl.narration.length, 0);
    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "narration",
      ttsChars: totalChars,
    });

    return NextResponse.json({ video, videoUrl: getUploadUrl("videos", fileName) });
  } catch (e: any) {
    console.error("[narration/video]", e.message);
    return NextResponse.json({ error: e.message || "Video generation failed" }, { status: 500 });
  }
}
