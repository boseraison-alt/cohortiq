import { NextRequest, NextResponse } from "next/server";
import { stat, open, readFile } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mov": "video/quicktime",
};

/** Resolve the base directory for uploads.
 *  - If UPLOADS_DIR env var is set (Railway Volume), use that.
 *  - Otherwise fall back to public/uploads in the project root.
 */
function getUploadsBase(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "public", "uploads");
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const uploadsBase = getUploadsBase();

  // Sanitize path segments to prevent directory traversal
  const segments = params.path.map((s) =>
    s.replace(/\.\./g, "").replace(/[^a-zA-Z0-9._-]/g, "_")
  );
  const filePath = path.join(uploadsBase, ...segments);

  // Ensure the resolved path is still within the uploads directory
  if (!filePath.startsWith(path.resolve(uploadsBase))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const fileSize = fileStat.size;

    // ── HTTP Range support (required for video/audio seeking) ──────────────
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;
        const chunkSize = end - start + 1;

        // Read only the requested chunk from disk
        const fh = await open(filePath, "r");
        const buf = Buffer.allocUnsafe(chunkSize);
        await fh.read(buf, 0, chunkSize, start);
        await fh.close();

        return new NextResponse(buf, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSize),
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }

    // ── Full file response ─────────────────────────────────────────────────
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
