import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const history = await prisma.brainSearchHistory.findMany({
    where: { userId },
    select: { id: true, question: true, answer: true, sources: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(
    history.map((h) => ({
      ...h,
      sources: h.sources ? JSON.parse(h.sources) : [],
    }))
  );
}
