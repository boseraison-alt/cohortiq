import path from "path";

/**
 * Get the filesystem directory for uploads.
 * - If UPLOADS_DIR is set (Railway volume), use that.
 * - Otherwise fall back to public/uploads (local dev).
 */
export function getUploadDir(subfolder: "videos" | "podcasts"): string {
  const base = process.env.UPLOADS_DIR || path.join(process.cwd(), "public", "uploads");
  return path.join(base, subfolder);
}

/**
 * Get the URL path to serve an uploaded file.
 * Always routes through /api/uploads/ so we control serving
 * (supports HTTP Range requests for video/audio streaming, and
 * works whether files are in public/ or a Railway Volume).
 */
export function getUploadUrl(subfolder: "videos" | "podcasts", fileName: string): string {
  return `/api/uploads/${subfolder}/${fileName}`;
}
