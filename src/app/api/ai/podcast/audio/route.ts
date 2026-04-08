import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logUsage } from "@/lib/usage";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Voice assignments
const VOICES: Record<string, "onyx" | "nova"> = {
  PROF: "onyx",  // deep, authoritative
  ALEX: "nova",  // warm, conversational
};

interface ScriptLine {
  host: string;
  text: string;
}

interface Segment {
  host: string;
  text: string;
  lineIndices: number[];
}

// Merge consecutive same-speaker lines to reduce API calls
function mergeLines(lines: ScriptLine[]): Segment[] {
  const segments: Segment[] = [];
  let current: Segment | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (current && current.host === line.host) {
      current.text += " " + line.text;
      current.lineIndices.push(i);
    } else {
      if (current) segments.push(current);
      current = { host: line.host, text: line.text, lineIndices: [i] };
    }
  }
  if (current) segments.push(current);
  return segments;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { script, style = "conversation", podcastId } = await req.json() as { script: ScriptLine[]; style?: string; podcastId?: string };

  if (!script?.length) {
    return NextResponse.json({ error: "No script provided" }, { status: 400 });
  }

  // Merge consecutive same-speaker lines into segments
  const segments = mergeLines(script);

  // Generate audio for each segment in parallel (batches of 5 to avoid rate limits)
  const audioSegments: { index: number; audio: string; host: string; lineIndices: number[] }[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (seg, batchIdx) => {
        const globalIdx = i + batchIdx;
        try {
          const voice = style === "lecture" ? "onyx" : (VOICES[seg.host] || "nova");
          const response = await openai.audio.speech.create({
            model: "tts-1",
            voice,
            input: seg.text,
            response_format: "mp3",
          });

          const buffer = Buffer.from(await response.arrayBuffer());
          const base64 = buffer.toString("base64");

          return {
            index: globalIdx,
            audio: base64,
            host: seg.host,
            lineIndices: seg.lineIndices,
          };
        } catch (err: any) {
          console.error(`TTS error for segment ${globalIdx}:`, err.message);
          return {
            index: globalIdx,
            audio: "",
            host: seg.host,
            lineIndices: seg.lineIndices,
          };
        }
      })
    );

    audioSegments.push(...results);
  }

  // Sort by index to maintain order
  audioSegments.sort((a, b) => a.index - b.index);

  // Log TTS usage
  const totalChars = script.reduce((s: number, l: ScriptLine) => s + l.text.length, 0);
  await logUsage({
    userId: (session!.user as any).id,
    action: "podcast_audio",
    ttsChars: totalChars,
  });

  // Save concatenated MP3 to disk and update podcast record
  let audioUrl: string | null = null;
  if (podcastId) {
    try {
      const buffers = audioSegments
        .sort((a, b) => a.index - b.index)
        .filter((s) => s.audio)
        .map((s) => Buffer.from(s.audio, "base64"));
      if (buffers.length) {
        const combined = Buffer.concat(buffers);
        const uploadDir = path.join(process.cwd(), "public", "uploads", "podcasts");
        await mkdir(uploadDir, { recursive: true });
        const fileName = `podcast_${podcastId}.mp3`;
        await writeFile(path.join(uploadDir, fileName), combined);
        audioUrl = `/uploads/podcasts/${fileName}`;
        await prisma.podcast.update({
          where: { id: podcastId },
          data: { audioUrl },
        });
      }
    } catch (e: any) {
      console.error("[podcast/audio] save error:", e.message);
      // Non-fatal — segments still returned for in-memory playback
    }
  }

  return NextResponse.json({
    segments: audioSegments.map((s) => ({
      audio: s.audio,
      host: s.host,
      lineIndices: s.lineIndices,
    })),
    audioUrl,
    totalSegments: audioSegments.length,
    totalLines: script.length,
  });
}
