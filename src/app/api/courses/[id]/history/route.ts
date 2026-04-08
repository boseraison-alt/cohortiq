import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const courseId = params.id;

  // Fetch chat sessions and podcasts in parallel
  const [chatSessions, podcasts] = await Promise.all([
    prisma.chatSession.findMany({
      where: { courseId, userId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.podcast.findMany({
      where: { courseId },
      select: {
        id: true,
        duration: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // Combine into unified history
  const history = [
    ...chatSessions.map((c) => ({
      id: c.id,
      type: "chat" as const,
      title: c.title,
      subtitle: `${c._count.messages} messages`,
      date: c.updatedAt.toISOString(),
    })),
    ...podcasts.map((p) => ({
      id: p.id,
      type: "podcast" as const,
      title: `${p.duration}-min podcast`,
      subtitle: `Generated podcast`,
      date: p.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json(history);
}
