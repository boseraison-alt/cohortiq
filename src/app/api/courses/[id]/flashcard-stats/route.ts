import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const courseId = params.id;

  const now = new Date();

  const cards = await prisma.flashcard.findMany({
    where: { courseId },
    select: {
      id: true,
      topic: true,
      reviews: {
        where: { userId },
        select: { nextReviewAt: true, repetitions: true },
      },
    },
  });

  // Aggregate per topic
  const topicMap = new Map<string, { total: number; mastered: number; due: number; isNew: number }>();

  for (const card of cards) {
    const topic = card.topic || "General";
    const entry = topicMap.get(topic) || { total: 0, mastered: 0, due: 0, isNew: 0 };
    entry.total++;

    if (card.reviews.length === 0) {
      entry.isNew++;
      entry.due++;
    } else {
      const r = card.reviews[0];
      if (r.repetitions >= 3) entry.mastered++;
      else if (r.nextReviewAt <= now) entry.due++;
    }

    topicMap.set(topic, entry);
  }

  const stats = Array.from(topicMap.entries()).map(([topic, s]) => ({ topic, ...s }));
  const totalMastered = stats.reduce((sum, s) => sum + s.mastered, 0);

  return NextResponse.json({ stats, totalMastered, totalCards: cards.length });
}
