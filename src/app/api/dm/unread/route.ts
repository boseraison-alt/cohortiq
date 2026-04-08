import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — return unread message counts grouped by sender
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = (session.user as any).id;

  const unread = await prisma.directMessage.groupBy({
    by: ["fromUserId"],
    where: { toUserId: me, read: false },
    _count: { id: true },
  });

  // Also get latest message per conversation for preview
  const counts: Record<string, number> = {};
  for (const u of unread) {
    counts[u.fromUserId] = u._count.id;
  }

  return NextResponse.json({ counts });
}
