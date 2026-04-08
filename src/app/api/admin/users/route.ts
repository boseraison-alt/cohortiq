import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      creditsGranted: true,
      _count: { select: { courses: true, performance: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get usage per user
  const usageByUser = await prisma.usageLog.groupBy({
    by: ["userId"],
    _sum: { costUsd: true, inputTokens: true, outputTokens: true, ttsChars: true },
    _count: true,
  });

  const usageMap: Record<string, any> = {};
  for (const u of usageByUser) {
    usageMap[u.userId] = {
      totalCost: u._sum.costUsd || 0,
      totalCalls: u._count,
      inputTokens: u._sum.inputTokens || 0,
      outputTokens: u._sum.outputTokens || 0,
      ttsChars: u._sum.ttsChars || 0,
    };
  }

  // Get last active timestamp per user
  const lastActivity = await prisma.usageLog.groupBy({
    by: ["userId"],
    _max: { createdAt: true },
  });
  const lastActiveMap: Record<string, string | null> = {};
  for (const u of lastActivity) {
    lastActiveMap[u.userId] = u._max.createdAt?.toISOString() ?? null;
  }

  // Get action breakdown per user for top feature
  const actionBreakdown = await prisma.usageLog.groupBy({
    by: ["userId", "action"],
    _count: { action: true },
  });
  const topFeatureMap: Record<string, string> = {};
  const byUser: Record<string, { action: string; count: number }[]> = {};
  for (const row of actionBreakdown) {
    if (!byUser[row.userId]) byUser[row.userId] = [];
    byUser[row.userId].push({ action: row.action, count: row._count.action });
  }
  for (const [uid, actions] of Object.entries(byUser)) {
    const top = actions.sort((a, b) => b.count - a.count)[0];
    topFeatureMap[uid] = top?.action ?? "chat";
  }

  const ACTION_LABELS: Record<string, string> = {
    chat: "Chat Tutor", flashcard: "Flashcards", practice: "Practice Quiz",
    podcast: "Podcast", narration: "Videos", "concept-map": "Mind Map",
    "study-plan": "Study Plan", feynman: "Feynman Mode", qa: "QA",
  };

  const result = users.map((u) => ({
    ...u,
    usage: usageMap[u.id] || { totalCost: 0, totalCalls: 0, inputTokens: 0, outputTokens: 0, ttsChars: 0 },
    lastActive: lastActiveMap[u.id] ?? null,
    topFeature: ACTION_LABELS[topFeatureMap[u.id]] ?? "Chat Tutor",
  }));

  return NextResponse.json(result);
}
