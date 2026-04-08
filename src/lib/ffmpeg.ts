import { execFile } from "child_process";
import { writeFile, mkdir, rm, readFile } from "fs/promises";
import { statSync } from "fs";
import path from "path";
import os from "os";

// Get ffmpeg binary path from ffmpeg-static
function getFfmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("ffmpeg-static") as string;
}

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = getFfmpegPath();
    execFile(ffmpeg, args, { timeout: 180_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`FFmpeg error: ${err.message}\n${stderr?.slice(0, 500)}`));
      } else {
        resolve(stderr || stdout || "");
      }
    });
  });
}

export interface SlideMedia {
  png: Buffer;
  mp3: Buffer;
}

/**
 * Composite an array of slide images + audio into a single MP4 video.
 * Each slide is displayed for the duration of its audio.
 * Adds 0.5s fade-in/fade-out transitions between slides.
 */
export async function compositeVideo(
  slides: SlideMedia[],
  outputPath: string
): Promise<{ fileSize: number; slideDurations: number[] }> {
  const tmpDir = path.join(os.tmpdir(), `studyai-video-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    const segmentPaths: string[] = [];
    const slideDurations: number[] = [];

    for (let i = 0; i < slides.length; i++) {
      const pad = String(i).padStart(3, "0");
      const pngPath = path.join(tmpDir, `slide_${pad}.png`);
      const mp3Path = path.join(tmpDir, `audio_${pad}.mp3`);
      const segPath = path.join(tmpDir, `segment_${pad}.mp4`);

      await writeFile(pngPath, slides[i].png);
      await writeFile(mp3Path, slides[i].mp3);

      // Create video segment with fade-in at start and fade-out at end
      // First pass: probe audio duration
      let audioDuration = 30; // fallback
      try {
        const probeResult = await runFfmpeg([
          "-i", mp3Path,
          "-f", "null", "-",
        ]);
        const durMatch = probeResult.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
        if (durMatch) {
          audioDuration =
            parseInt(durMatch[1]) * 3600 +
            parseInt(durMatch[2]) * 60 +
            parseInt(durMatch[3]) +
            parseInt(durMatch[4]) / 100;
        }
      } catch {
        // Use fallback duration
      }

      slideDurations.push(audioDuration);
      const fadeOut = Math.max(0, audioDuration - 0.5);

      await runFfmpeg([
        "-loop", "1",
        "-i", pngPath,
        "-i", mp3Path,
        "-vf", `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOut.toFixed(2)}:d=0.5`,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-y",
        segPath,
      ]);

      segmentPaths.push(segPath);
    }

    // Write concat file — use forward slashes for Windows FFmpeg compatibility
    const concatContent = segmentPaths
      .map((p) => `file '${p.replace(/\\/g, "/")}'`)
      .join("\n");
    const concatPath = path.join(tmpDir, "concat.txt");
    await writeFile(concatPath, concatContent, "utf8");

    // Concatenate all segments into final MP4
    await runFfmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-c", "copy",
      "-y",
      outputPath,
    ]);

    const stats = statSync(outputPath);
    return { fileSize: stats.size, slideDurations };
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
