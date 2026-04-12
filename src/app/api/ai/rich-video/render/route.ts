import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logUsage } from "@/lib/usage";
import { generateSpeech, splitIntoChunks } from "@/lib/tts";
import { renderSlideToPng } from "@/lib/slides";
import { buildRichSlideSvg } from "@/lib/richSlides";
import { compositeVideo } from "@/lib/ffmpeg";
import { getUploadDir, getUploadUrl } from "@/lib/uploads";
import { mkdir } from "fs/promises";
import path from "path";
import type { Slide } from "@/lib/slideDeckTemplate";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Rich Video — Phase 2: Render
 *
 * Takes a videoId (created by Phase 1 with url="pending"),
 * reads the saved slide JSON, renders PNG + TTS + FFmpeg,
 * and updates the Video row with the final MP4 URL.
 *
 * Separated from Phase 1 so each HTTP request stays well
 * under Railway's proxy timeout (~5 min).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoId } = await req.json();
    if (!videoId) {
      return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }

    // Load the pending video with its slide data
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video || !video.slidesData) {
      return NextResponse.json({ error: "Video not found or has no slide data" }, { status: 404 });
    }

    let deckData: {
      deckTitle?: string;
      subtitle?: string;
      slides: Slide[];
      accentColor: string;
      courseName: string;
    };
    try {
      deckData = JSON.parse(video.slidesData);
    } catch {
      return NextResponse.json({ error: "Slide data is malformed" }, { status: 500 });
    }

    if (!deckData?.slides?.length) {
      return NextResponse.json({ error: "No slides in saved data" }, { status: 500 });
    }

    const { slides, accentColor, courseName } = deckData;
    const totalSlides = slides.length;

    // ── Render all slides to PNG (serial) ──
    console.log(`[rich-video/render] Rendering ${totalSlides} PNG slides`);
    const pngStart = Date.now();
    const pngs: Buffer[] = [];
    for (let i = 0; i < totalSlides; i++) {
      const slide = slides[i];
      try {
        const svg = buildRichSlideSvg(slide, i, totalSlides, accentColor, courseName);
        pngs.push(await renderSlideToPng(svg));
      } catch (err: any) {
        throw new Error(`Slide ${i + 1}/${totalSlides} render failed: ${err?.message}`);
      }
    }
    console.log(`[rich-video/render] PNGs done in ${Math.round((Date.now() - pngStart) / 1000)}s`);

    // ── Generate TTS audio (concurrency=3) ──
    console.log(`[rich-video/render] Generating TTS (concurrency=3)`);
    const ttsStart = Date.now();
    const mp3s: Buffer[] = new Array(totalSlides);
    let nextIdx = 0;

    const workers = Array.from({ length: Math.min(3, totalSlides) }, async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= totalSlides) return;
        const slide = slides[i];

        const narrationText =
          slide.narration ||
          `${slide.title}. ${(slide.body || [])
            .map((c: any) =>
              c.type === "bullets" ? c.items?.map((it: any) => it.text).join(". ") :
              c.type === "quote" ? c.text :
              c.type === "sbox" ? `${c.box?.title}. ${c.box?.body}` :
              c.type === "formula" ? c.text :
              c.type === "icard" ? `${c.title}. ${c.body}` : ""
            )
            .filter(Boolean)
            .join(". ")}`;

        if (!narrationText.trim()) {
          throw new Error(`Slide ${i + 1}/${totalSlides} has empty narration.`);
        }

        try {
          const textChunks = splitIntoChunks(narrationText, 4000);
          const audioBuffers: Buffer[] = [];
          for (const chunk of textChunks) {
            audioBuffers.push(await generateSpeech(chunk, "onyx"));
          }
          mp3s[i] = Buffer.concat(audioBuffers);
        } catch (err: any) {
          throw new Error(`Slide ${i + 1}/${totalSlides} TTS failed: ${err?.message}`);
        }
      }
    });

    await Promise.all(workers);
    console.log(`[rich-video/render] TTS done in ${Math.round((Date.now() - ttsStart) / 1000)}s`);

    // ── Composite into MP4 ──
    const slideMedia = pngs.map((png, i) => ({ png, mp3: mp3s[i] }));
    const uploadDir = getUploadDir("videos");
    await mkdir(uploadDir, { recursive: true });

    const safeTopic = (video.title || "rich")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const fileName = `rich_${safeTopic}_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, fileName);

    console.log(`[rich-video/render] Compositing FFmpeg`);
    const ffStart = Date.now();
    let fileSize: number;
    let slideDurations: number[];
    try {
      const result = await compositeVideo(slideMedia, outputPath, { cinematic: true });
      fileSize = result.fileSize;
      slideDurations = result.slideDurations;
    } catch (err: any) {
      throw new Error(`FFmpeg composition failed: ${err?.message}`);
    }
    console.log(`[rich-video/render] FFmpeg done in ${Math.round((Date.now() - ffStart) / 1000)}s`);

    // ── Update the Video row with the final MP4 ──
    const enrichedSlides = slides.map((s: Slide, i: number) => ({
      title: s.title,
      points: (s.body || [])
        .flatMap((c: any) => {
          if (c.type === "bullets") return (c.items || []).map((it: any) => it.text);
          if (c.type === "sbox") return [`${c.box?.title}: ${c.box?.body}`];
          if (c.type === "grid2" || c.type === "grid3") return (c.boxes || []).map((b: any) => `${b.title}: ${b.body}`);
          if (c.type === "quote") return [`"${c.text}"`];
          if (c.type === "formula") return [c.text];
          if (c.type === "icard") return [`${c.title}: ${c.body}`];
          return [];
        })
        .slice(0, 8),
      narration: s.narration || "",
      icon: "",
      formulas: (s.body || []).filter((c: any) => c.type === "formula").map((c: any) => c.text),
      duration: slideDurations[i] ?? 30,
      tag: s.tag,
      tagColor: s.tagColor,
      body: s.body,
    }));

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: {
        url: getUploadUrl("videos", fileName),
        fileName,
        fileSize,
        description: deckData.subtitle || `Rich ${totalSlides}-slide narrated video`,
        slidesData: JSON.stringify(enrichedSlides),
      },
    });

    const totalChars = slides.reduce((acc: number, s: Slide) => acc + (s.narration?.length || 0), 0);
    await logUsage({
      userId: (session.user as any).id,
      courseId: video.courseId,
      action: "narration",
      ttsChars: totalChars,
    });

    return NextResponse.json({
      video: updated,
      videoUrl: getUploadUrl("videos", fileName),
      phase: "complete",
    });
  } catch (e: any) {
    console.error("[rich-video/render] ERROR:", {
      message: e?.message,
      stack: e?.stack?.split("\n").slice(0, 3),
    });
    return NextResponse.json(
      { error: `Video rendering failed: ${e?.message || "unknown error"}` },
      { status: 500 }
    );
  }
}
