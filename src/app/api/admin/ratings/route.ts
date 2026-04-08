import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") || "all"; // "all" | "down" | "saved"

  const where: any = {};
  if (filter === "down") where.rating = "down";
  if (filter === "saved") where.savedForLater = true;

  const ratings = await prisma.contentRating.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Attach user email
  const userIds = [...new Set(ratings.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return NextResponse.json(
    ratings.map((r) => ({ ...r, user: userMap[r.userId] || null }))
  );
}
