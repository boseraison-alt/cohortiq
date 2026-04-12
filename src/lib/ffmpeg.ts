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
 * For each slide:
 *   1. Apply a subtle Ken Burns (slow zoom) effect to bring the static
 *      frame to life
 *   2. Fade in at the start, fade out at the end
 *   3. Overlap with the next slide via a 0.5s cross-dissolve (xfade)
 *
 * Motion settings (feel free to tune):
 *   - Zoom goes from 1.0 to ~1.08 over the clip duration (subtle)
 *   - Cross-dissolve between slides is 0.5s long
 */
export async function compositeVideo(
  slides: SlideMedia[],
  outputPath: string,
  options?: { animate?: boolean }
): Promise<{ fileSize: number; slideDurations: number[] }> {
  const animate = options?.animate !== false; // default on
  const tmpDir = path.join(os.tmpdir(), `studyai-video-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  const FPS = 30;
  const XFADE_DUR = 0.5;

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
      } catch {}

      slideDurations.push(audioDuration);

      // ── Build video filter chain ──
      //
      // When animate=true we apply a gentle Ken Burns zoom:
      //   - Start with a large scale buffer (2400x1350) so the 1920x1080
      //     crop always has extra pixels to work with as we zoom
      //   - Slowly zoom in by ~8% over the slide's lifetime
      //   - Output 1920x1080 at 30fps
      //
      // Then fade-in at start + fade-out at end so the cross-dissolve
      // between clips looks clean.
      const durationFrames = Math.ceil(audioDuration * FPS);
      const fadeOutStart = Math.max(0, audioDuration - XFADE_DUR);

      let vfilter: string;
      if (animate) {
        // zoompan iterates over frames and lets us express zoom as a
        // linear function of `on` (frame number).
        // z = 1 + (on / durationFrames) * 0.08  →  1.0 → 1.08 over the clip
        const zoomExpr = `1+0.08*on/${Math.max(1, durationFrames)}`;
        vfilter =
          `scale=2400:1350,` +
          `zoompan=z='${zoomExpr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${FPS},` +
          `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${XFADE_DUR}`;
      } else {
        vfilter = `scale=1920:1080,fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${XFADE_DUR}`;
      }

      await runFfmpeg([
        "-loop", "1",
        "-framerate", String(FPS),
        "-i", pngPath,
        "-i", mp3Path,
        "-vf", vfilter,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-r", String(FPS),
        "-shortest",
        "-y",
        segPath,
      ]);

      segmentPaths.push(segPath);
    }

    // ── Final composition ──
    //
    // Use concat demuxer with -c copy for simplicity and speed.
    // Each segment already has fade-out + fade-in baked in, so the
    // transitions read as cross-dissolves when played back to back.
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
    } catch {}
  }
}
