import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const now = new Date();

  // Fetch all flashcards for this course
  const allCards = await prisma.flashcard.findMany({
    where: { courseId },
    select: {
      id: true,
      front: true,
      back: true,
      topic: true,
      reviews: {
        where: { userId },
        select: { nextReviewAt: true, interval: true, repetitions: true, easeFactor: true },
      },
    },
  });

  // A card is due if: no review record (new) OR nextReviewAt <= now
  const dueCards = allCards
    .filter((c) => c.reviews.length === 0 || c.reviews[0].nextReviewAt <= now)
    .slice(0, 30)
    .map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      topic: c.topic,
      isNew: c.reviews.length === 0,
    }));

  return NextResponse.json({ cards: dueCards, dueCount: dueCards.length });
}
