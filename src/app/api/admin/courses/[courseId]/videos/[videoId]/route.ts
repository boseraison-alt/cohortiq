import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unlink } from "fs/promises";
import path from "path";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { courseId: string; videoId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const video = await prisma.video.findFirst({
    where: { id: params.videoId, courseId: params.courseId },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete uploaded file from disk if applicable
  if (video.sourceType === "file" && video.url.startsWith("/uploads/")) {
    try {
      const filePath = path.join(process.cwd(), "public", video.url);
      await unlink(filePath);
    } catch {
      // File may already be gone — that's fine
    }
  }

  await prisma.video.delete({ where: { id: params.videoId } });
  return NextResponse.json({ success: true });
}
