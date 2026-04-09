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
 * - If UPLOADS_DIR is set, serve via /api/uploads/ route.
 * - Otherwise serve directly from /uploads/ (Next.js public dir).
 */
export function getUploadUrl(subfolder: "videos" | "podcasts", fileName: string): string {
  if (process.env.UPLOADS_DIR) {
    return `/api/uploads/${subfolder}/${fileName}`;
  }
  return `/uploads/${subfolder}/${fileName}`;
}
