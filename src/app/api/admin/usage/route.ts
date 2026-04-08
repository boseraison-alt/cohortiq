import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const days = parseInt(req.nextUrl.searchParams.get("days") || "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Total cost
  const totals = await prisma.usageLog.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true, ttsChars: true },
    _count: true,
  });

  // Cost by action
  const byAction = await prisma.usageLog.groupBy({
    by: ["action"],
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true },
    _count: true,
  });

  // Cost by user
  const byUser = await prisma.usageLog.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true },
    _count: true,
  });

  // Get user names
  const userIds = byUser.map((u) => u.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap: Record<string, any> = {};
  for (const u of users) userMap[u.id] = u;

  // Daily costs (last N days)
  const dailyLogs = await prisma.usageLog.findMany({
    where: { createdAt: { gte: since } },
    select: { costUsd: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const dailyCosts: Record<string, number> = {};
  for (const l of dailyLogs) {
    const day = l.createdAt.toISOString().slice(0, 10);
    dailyCosts[day] = (dailyCosts[day] || 0) + l.costUsd;
  }

  return NextResponse.json({
    period: `${days} days`,
    totals: {
      cost: totals._sum.costUsd || 0,
      calls: totals._count,
      inputTokens: totals._sum.inputTokens || 0,
      outputTokens: totals._sum.outputTokens || 0,
      ttsChars: totals._sum.ttsChars || 0,
    },
    byAction: byAction.map((a) => ({
      action: a.action,
      cost: a._sum.costUsd || 0,
      calls: a._count,
    })),
    byUser: byUser.map((u) => ({
      ...userMap[u.userId],
      cost: u._sum.costUsd || 0,
      calls: u._count,
    })),
    dailyCosts,
  });
}
