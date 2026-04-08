import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — fetch messages between current user and :userId, mark received as read
export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = (session.user as any).id;
  const them = params.userId;

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { fromUserId: me, toUserId: them },
        { fromUserId: them, toUserId: me },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  // Mark all unread messages FROM them TO me as read
  await prisma.directMessage.updateMany({
    where: { fromUserId: them, toUserId: me, read: false },
    data: { read: true },
  });

  return NextResponse.json({ messages });
}

// POST — send a message to :userId
export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = (session.user as any).id;
  const them = params.userId;
  const { content } = await req.json();

  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const message = await prisma.directMessage.create({
    data: { fromUserId: me, toUserId: them, content: content.trim() },
  });

  return NextResponse.json({ message });
}
