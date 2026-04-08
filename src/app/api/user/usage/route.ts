import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const [user, logs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { creditsGranted: true, name: true, email: true },
    }),
    prisma.usageLog.findMany({
      where: { userId },
      select: { action: true, costUsd: true, ttsChars: true, inputTokens: true, outputTokens: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const totalUsed = logs.reduce((s, l) => s + l.costUsd, 0);
  const creditsRemaining = Math.max(0, user.creditsGranted - totalUsed);

  // Breakdown by action
  const byAction: Record<string, { count: number; cost: number }> = {};
  for (const l of logs) {
    if (!byAction[l.action]) byAction[l.action] = { count: 0, cost: 0 };
    byAction[l.action].count++;
    byAction[l.action].cost += l.costUsd;
  }

  return NextResponse.json({
    creditsGranted: user.creditsGranted,
    creditsUsed: totalUsed,
    creditsRemaining,
    totalCalls: logs.length,
    byAction,
    recentLogs: logs.slice(0, 20),
  });
}
