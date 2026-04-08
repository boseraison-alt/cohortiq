import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST — heartbeat: update lastSeen for current user, return all online users
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  // Update lastSeen
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeen: new Date() },
  });

  // Return all users seen in last 2 minutes
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const online = await prisma.user.findMany({
    where: { lastSeen: { gte: cutoff }, id: { not: userId } },
    select: { id: true, name: true, email: true, lastSeen: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ online });
}

// GET — return online users without updating lastSeen
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const online = await prisma.user.findMany({
    where: { lastSeen: { gte: cutoff }, id: { not: userId } },
    select: { id: true, name: true, email: true, lastSeen: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ online });
}
