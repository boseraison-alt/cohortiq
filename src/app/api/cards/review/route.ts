import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { flashcardId, rating } = await req.json();

  if (!flashcardId || rating === undefined || rating < 0 || rating > 3) {
    return NextResponse.json({ error: "flashcardId and rating (0-3) required" }, { status: 400 });
  }

  // Load existing review record if any
  const existing = await prisma.flashcardReview.findUnique({
    where: { flashcardId_userId: { flashcardId, userId } },
  });

  let interval = existing?.interval ?? 1;
  let easeFactor = existing?.easeFactor ?? 2.5;
  let repetitions = existing?.repetitions ?? 0;

  // Map rating 0-3 to SM-2 quality 0-5
  const q = [0, 3, 4, 5][rating];

  // SM-2 algorithm
  if (q < 3) {
    interval = 1;
    repetitions = 0;
  } else if (repetitions === 0) {
    interval = 1;
    repetitions = 1;
  } else if (repetitions === 1) {
    interval = 6;
    repetitions = 2;
  } else {
    interval = Math.round(interval * easeFactor);
    repetitions += 1;
  }

  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const nextReviewAt = addDays(new Date(), interval);

  await prisma.flashcardReview.upsert({
    where: { flashcardId_userId: { flashcardId, userId } },
    create: { flashcardId, userId, interval, easeFactor, repetitions, lastRating: rating, nextReviewAt },
    update: { interval, easeFactor, repetitions, lastRating: rating, nextReviewAt },
  });

  return NextResponse.json({ nextReviewAt, interval });
}
