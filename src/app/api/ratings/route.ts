import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST — submit or update a rating
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { courseId, contentType, contentId, contentTitle, rating, feedback } = await req.json();

  if (!courseId || !contentType || !contentId || !rating) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["up", "down"].includes(rating)) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }
  if (!["podcast", "video"].includes(contentType)) {
    return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
  }
  if (feedback && typeof feedback === "string" && feedback.length > 2000) {
    return NextResponse.json({ error: "Feedback too long" }, { status: 400 });
  }

  const record = await prisma.contentRating.upsert({
    where: { userId_contentType_contentId: { userId, contentType, contentId } },
    update: { rating, feedback: feedback || null, contentTitle: contentTitle || null },
    create: { userId, courseId, contentType, contentId, contentTitle: contentTitle || null, rating, feedback: feedback || null },
  });

  return NextResponse.json(record);
}

// GET — fetch current user's rating for a specific piece of content
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const contentType = searchParams.get("contentType");
  const contentId = searchParams.get("contentId");

  if (!contentType || !contentId) return NextResponse.json({ rating: null });

  // Get user's own rating
  const userRating = await prisma.contentRating.findUnique({
    where: { userId_contentType_contentId: { userId, contentType, contentId } },
    select: { rating: true, feedback: true },
  });

  // Get aggregate counts
  const counts = await prisma.contentRating.groupBy({
    by: ["rating"],
    where: { contentType, contentId },
    _count: { rating: true },
  });

  const up = counts.find((c) => c.rating === "up")?._count.rating ?? 0;
  const down = counts.find((c) => c.rating === "down")?._count.rating ?? 0;

  return NextResponse.json({ userRating, up, down });
}
