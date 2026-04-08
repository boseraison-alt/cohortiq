import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const perf = await prisma.performance.findMany({
    where: { courseId: params.id, userId },
    select: { topic: true, question: true, correct: true, score: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(perf);
}
