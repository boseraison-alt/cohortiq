import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const FEATURE_META: Record<string, { label: string; icon: string; color: string }> = {
  chat:          { label: "Chat Tutor",    icon: "💬", color: "#b8923a" },
  flashcard:     { label: "Flashcards",    icon: "🃏", color: "#2f5fbf" },
  practice:      { label: "Practice Quiz", icon: "🧠", color: "#6b48c8" },
  podcast:       { label: "Podcast",       icon: "🎧", color: "#2a9d6e" },
  narration:     { label: "Videos",        icon: "🎬", color: "#c07030" },
  "concept-map": { label: "Mind Map",      icon: "🗺", color: "#7d7768" },
  "study-plan":  { label: "Study Plan",    icon: "🏆", color: "#b8923a" },
  feynman:       { label: "Feynman Mode",  icon: "🧑‍🏫", color: "#6b48c8" },
  insights:      { label: "Insights",      icon: "📊", color: "#3a9dbf" },
  qa:            { label: "Brain Search",  icon: "🔍", color: "#2f5fbf" },
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
  });

  const lastActivity = await prisma.usageLog.groupBy({
    by: ["userId"],
    _max: { createdAt: true },
    _count: true,
  });

  const lastMap: Record<string, { date: Date | null; calls: number }> = {};
  for (const u of lastActivity) {
    lastMap[u.userId] = { date: u._max.createdAt, calls: u._count };
  }

  const now = Date.now();
  let active = 0, atRisk = 0;
  const atRiskUsers: any[] = [];

  for (const u of users) {
    const la = lastMap[u.id];
    if (!la?.date) { atRisk++; continue; }
    const days = (now - la.date.getTime()) / 86400000;
    if (days < 3) active++;
    if (days >= 5) {
      atRisk++;
      atRiskUsers.push({
        id: u.id,
        name: u.name || u.email.split("@")[0],
        initials: (u.name || u.email).slice(0, 2).toUpperCase(),
        daysInactive: Math.floor(days),
      });
    }
  }
  atRiskUsers.sort((a, b) => b.daysInactive - a.daysInactive);

  const byAction = await prisma.usageLog.groupBy({
    by: ["action"],
    _count: true,
    orderBy: { _count: { action: "desc" } },
  });

  const maxCount = byAction[0]?._count ?? 1;
  const featureRanking = byAction.slice(0, 8).map((a, i) => {
    const meta = FEATURE_META[a.action] || { label: a.action, icon: "⚙️", color: "#7d7768" };
    return { ...meta, action: a.action, count: a._count, pct: Math.round((a._count / maxCount) * 100), rank: i + 1 };
  });

  const since14 = new Date(now - 14 * 86400000);
  const recentLogs = await prisma.usageLog.findMany({
    where: { createdAt: { gte: since14 } },
    select: { createdAt: true },
  });
  const buckets: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const l of recentLogs) {
    const key = l.createdAt.toISOString().slice(0, 10);
    if (key in buckets) buckets[key]++;
  }
  const dailySessions = Object.values(buckets);
  const dayLabels = Object.keys(buckets).map((d) => ["S","M","T","W","T","F","S"][new Date(d).getDay()]);

  // Feature adoption — count distinct users per action using groupBy (no full table scan)
  const adoptionRaw = await prisma.usageLog.groupBy({
    by: ["action", "userId"],
  });
  const usersPerAction: Record<string, Set<string>> = {};
  for (const row of adoptionRaw) {
    if (!usersPerAction[row.action]) usersPerAction[row.action] = new Set();
    usersPerAction[row.action].add(row.userId);
  }
  const adoptionMap: Record<string, number> = {};
  for (const [action, set] of Object.entries(usersPerAction)) adoptionMap[action] = set.size;

  const firstCourse = await prisma.course.findFirst({ select: { name: true }, orderBy: { createdAt: "asc" } });

  return NextResponse.json({
    users: { total: users.length, active, atRisk },
    featureRanking,
    dailySessions,
    dayLabels,
    atRiskUsers: atRiskUsers.slice(0, 5),
    adoptionMap,
    cohortName: firstCourse?.name ?? "Your Cohort",
  });
}
