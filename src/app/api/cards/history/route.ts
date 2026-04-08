import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json([]);

  const reviews = await prisma.flashcardReview.findMany({
    where: { userId, flashcard: { courseId } },
    select: {
      lastRating: true,
      interval: true,
      repetitions: true,
      updatedAt: true,
      flashcard: { select: { front: true, topic: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const RATING_LABELS: Record<number, string> = { 0: "Forgot", 1: "Hard", 2: "Good", 3: "Easy" };

  return NextResponse.json(
    reviews.map((r) => ({
      front: r.flashcard.front,
      topic: r.flashcard.topic,
      rating: r.lastRating,
      ratingLabel: RATING_LABELS[r.lastRating ?? 0] ?? "—",
      interval: r.interval,
      repetitions: r.repetitions,
      date: r.updatedAt,
    }))
  );
}
