import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildSlideDeckHtml } from "@/lib/slideDeckTemplate";

export const dynamic = "force-dynamic";

/**
 * Serve a saved slide deck as a complete interactive HTML document.
 * Pulls the JSON slide data out of the Video.slidesData column,
 * runs it through the template, and returns HTML.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const video = await prisma.video.findUnique({
    where: { id: params.videoId },
    include: { course: { select: { name: true } } },
  });

  if (!video || !video.slidesData) {
    return NextResponse.json({ error: "Slide deck not found" }, { status: 404 });
  }

  let data: { deckTitle?: string; subtitle?: string; slides?: any[] };
  try {
    data = JSON.parse(video.slidesData);
  } catch {
    return NextResponse.json(
      { error: "Slide deck data is malformed" },
      { status: 500 }
    );
  }

  if (!data?.slides?.length) {
    return NextResponse.json({ error: "No slides in deck" }, { status: 500 });
  }

  const html = buildSlideDeckHtml({
    courseName: video.course?.name || "Course",
    deckTitle: data.deckTitle || video.title,
    subtitle: data.subtitle,
    slides: data.slides,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
