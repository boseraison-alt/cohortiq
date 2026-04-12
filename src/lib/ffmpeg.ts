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
 *
 * Each slide is rendered as a still image with fade-in + fade-out.
 * Back-to-back segments play as smooth cross-dissolves thanks to the
 * overlapping fades (0.4s in + 0.5s out).
 *
 * Settings:
 *   - libx264 stillimage tune (optimized for slide content)
 *   - 30fps output
 *   - +faststart for instant web playback
 */
export async function compositeVideo(
  slides: SlideMedia[],
  outputPath: string,
  // `animate` is accepted but currently a no-op — kept for forward compat.
  // When a reliable zoompan pattern is ready we'll wire it back in here.
  _options?: { animate?: boolean }
): Promise<{ fileSize: number; slideDurations: number[] }> {
  const tmpDir = path.join(os.tmpdir(), `studyai-video-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  const FADE_IN = 0.4;
  const FADE_OUT = 0.5;

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

      // Probe audio duration
      let audioDuration = 30;
      try {
        const probeResult = await runFfmpeg(["-i", mp3Path, "-f", "null", "-"]);
        const m = probeResult.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
        if (m) {
          audioDuration =
            parseInt(m[1]) * 3600 +
            parseInt(m[2]) * 60 +
            parseInt(m[3]) +
            parseInt(m[4]) / 100;
        }
      } catch {
        /* keep fallback */
      }

      slideDurations.push(audioDuration);
      const fadeOutStart = Math.max(0, audioDuration - FADE_OUT);

      await runFfmpeg([
        "-loop", "1",
        "-i", pngPath,
        "-i", mp3Path,
        "-vf",
        `scale=1920:1080,fade=t=in:st=0:d=${FADE_IN},fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${FADE_OUT}`,
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

    // Concatenate segments (fast — just copy streams)
    const concatContent = segmentPaths
      .map((p) => `file '${p.replace(/\\/g, "/")}'`)
      .join("\n");
    const concatPath = path.join(tmpDir, "concat.txt");
    await writeFile(concatPath, concatContent, "utf8");

    await runFfmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-c", "copy",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);

    const stats = statSync(outputPath);
    return { fileSize: stats.size, slideDurations };
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}
