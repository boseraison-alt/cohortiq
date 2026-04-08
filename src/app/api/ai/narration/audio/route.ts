import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logUsage } from "@/lib/usage";
import { generateSpeech, splitIntoChunks } from "@/lib/tts";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { script, topic, courseId, duration = 10 } = await req.json();
    if (!script?.trim() || !courseId) {
      return NextResponse.json({ error: "script and courseId required" }, { status: 400 });
    }

    const chunks = splitIntoChunks(script);
    if (!chunks.length) {
      return NextResponse.json({ error: "Script could not be split into audio chunks" }, { status: 400 });
    }

    // Generate audio for each chunk in batches of 3
    const audioBuffers: Buffer[] = [];
    const BATCH = 3;

    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((text) => generateSpeech(text, "onyx")));
      audioBuffers.push(...results);
    }

    if (!audioBuffers.length) {
      return NextResponse.json({ error: "No audio was generated" }, { status: 500 });
    }

    const combined = Buffer.concat(audioBuffers);

    const uploadDir = path.join(process.env.VERCEL ? "/tmp" : process.cwd() + "/public", "uploads", "videos");
    await mkdir(uploadDir, { recursive: true });

    const safeTopic = (topic || "narration")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const fileName = `narration_${safeTopic}_${Date.now()}.mp3`;
    await writeFile(path.join(uploadDir, fileName), combined);

    const video = await prisma.video.create({
      data: {
        courseId,
        title: `Narration: ${topic || "Presentation"}`,
        description: `AI-generated ${duration}-min narrated presentation`,
        url: `/uploads/videos/${fileName}`,
        sourceType: "narration",
        fileName,
        fileSize: combined.length,
      },
    });

    await logUsage({
      userId: (session.user as any).id,
      courseId,
      action: "podcast_audio",
      ttsChars: script.length,
    });

    return NextResponse.json({ video, audioUrl: `/uploads/videos/${fileName}` });
  } catch (e: any) {
    console.error("[narration/audio]", e);
    return NextResponse.json({ error: e.message || "Audio generation failed" }, { status: 500 });
  }
}
