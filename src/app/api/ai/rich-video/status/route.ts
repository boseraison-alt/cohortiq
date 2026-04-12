import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Poll for rich video rendering status.
 *
 * Returns:
 *   - { status: "rendering" }  — still in progress
 *   - { status: "complete", video }  — done, includes the video row
 *   - { status: "error", error }  — failed, includes error message
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (video.url === "pending") {
    return NextResponse.json({ status: "rendering" });
  }

  if (video.url === "error") {
    return NextResponse.json({
      status: "error",
      error: video.description || "Rendering failed",
    });
  }

  // url is a real path — rendering is complete
  return NextResponse.json({
    status: "complete",
    video,
  });
}
