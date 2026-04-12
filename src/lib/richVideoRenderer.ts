/**
 * Background renderer for rich narrated videos.
 *
 * This runs as a fire-and-forget async process on the server,
 * NOT inside an HTTP request handler. This avoids Railway's proxy
 * timeout entirely — the HTTP response returns immediately, and
 * the heavy rendering (PNG + TTS + FFmpeg) runs in the background.
 *
 * The client polls /api/ai/rich-video/status?videoId=X until
 * the video's url changes from "pending" to the actual MP4 path.
 */

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

export async function renderVideoInBackground(
  videoId: string,
  userId: string
): Promise<void> {
  try {
    console.log(`[bg-render] Starting background render for ${videoId}`);

    // Load the pending video
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video?.slidesData) {
      console.error(`[bg-render] Video ${videoId} not found or no slide data`);
      return;
    }

    let deckData: {
      slides: Slide[];
      accentColor: string;
      courseName: string;
      deckTitle?: string;
      subtitle?: string;
    };
    try {
      deckData = JSON.parse(video.slidesData);
    } catch {
      console.error(`[bg-render] Malformed slide data for ${videoId}`);
      await prisma.video.update({
        where: { id: videoId },
        data: { url: "error", description: "Rendering failed: malformed slide data" },
      });
      return;
    }

    const { slides, accentColor, courseName } = deckData;
    const totalSlides = slides.length;

    // ── Render PNGs (serial) ──
    console.log(`[bg-render] Rendering ${totalSlides} PNGs`);
    const pngs: Buffer[] = [];
    for (let i = 0; i < totalSlides; i++) {
      const svg = buildRichSlideSvg(slides[i], i, totalSlides, accentColor, courseName);
      pngs.push(await renderSlideToPng(svg));
    }
    console.log(`[bg-render] PNGs done`);

    // ── Generate TTS (concurrency=2 to be gentle on memory) ──
    console.log(`[bg-render] Generating TTS`);
    const mp3s: Buffer[] = new Array(totalSlides);
    let nextIdx = 0;
    const workers = Array.from({ length: Math.min(2, totalSlides) }, async () => {
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
            .join(". ")}` || slide.title;

        const textChunks = splitIntoChunks(narrationText, 4000);
        const audioBuffers: Buffer[] = [];
        for (const chunk of textChunks) {
          audioBuffers.push(await generateSpeech(chunk, "onyx"));
        }
        mp3s[i] = Buffer.concat(audioBuffers);
      }
    });
    await Promise.all(workers);
    console.log(`[bg-render] TTS done`);

    // ── FFmpeg composite ──
    const slideMedia = pngs.map((png, i) => ({ png, mp3: mp3s[i] }));
    const uploadDir = getUploadDir("videos");
    await mkdir(uploadDir, { recursive: true });

    const safeTopic = (video.title || "rich")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const fileName = `rich_${safeTopic}_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, fileName);

    console.log(`[bg-render] FFmpeg compositing`);
    const { fileSize, slideDurations } = await compositeVideo(slideMedia, outputPath, {
      cinematic: true,
    });
    console.log(`[bg-render] FFmpeg done, fileSize=${fileSize}`);

    // ── Update DB with final video ──
    const enrichedSlides = slides.map((s: Slide, i: number) => ({
      title: s.title,
      points: (s.body || [])
        .flatMap((c: any) => {
          if (c.type === "bullets") return (c.items || []).map((it: any) => it.text);
          if (c.type === "sbox") return [`${c.box?.title}: ${c.box?.body}`];
          if (c.type === "grid2" || c.type === "grid3")
            return (c.boxes || []).map((b: any) => `${b.title}: ${b.body}`);
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

    await prisma.video.update({
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
      userId,
      courseId: video.courseId,
      action: "narration",
      ttsChars: totalChars,
    });

    console.log(`[bg-render] ✅ Video ${videoId} complete: ${fileName}`);
  } catch (err: any) {
    console.error(`[bg-render] ❌ Video ${videoId} failed:`, err?.message);
    // Mark the video as errored so the client knows to stop polling
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: {
          url: "error",
          description: `Rendering failed: ${(err?.message || "unknown").slice(0, 200)}`,
        },
      });
    } catch {}
  }
}
