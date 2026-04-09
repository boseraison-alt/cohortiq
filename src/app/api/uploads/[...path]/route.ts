import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mov": "video/quicktime",
};

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const uploadsDir = process.env.UPLOADS_DIR;
  if (!uploadsDir) {
    // Not using volume — files are served from public/ by Next.js
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Sanitize path segments to prevent directory traversal
  const segments = params.path.map((s) => s.replace(/\.\./g, "").replace(/[^a-zA-Z0-9._-]/g, "_"));
  const filePath = path.join(uploadsDir, ...segments);

  // Ensure the resolved path is still within UPLOADS_DIR
  if (!filePath.startsWith(path.resolve(uploadsDir))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
