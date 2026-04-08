import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const pods = await prisma.podcast.findMany({
    where: { courseId: params.id, userId },
    select: { id: true, duration: true, topic: true, audioUrl: true, createdAt: true, script: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pods);
}
