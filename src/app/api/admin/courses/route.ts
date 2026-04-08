import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const COLORS = [
  "#C9956B", "#6BA39E", "#A76BA3", "#6B85BF", "#BF7E65",
  "#7E9E5F", "#C47A7A", "#5E96AD", "#9B8360", "#7080B8",
];

// GET: List all courses across all users
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const courses = await prisma.course.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { materials: true, chunks: true, weeks: true } },
      materials: { select: { wordCount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = courses.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    createdAt: c.createdAt.toISOString(),
    user: c.user,
    _count: c._count,
    totalWords: c.materials.reduce((s, m) => s + m.wordCount, 0),
    pendingMaterials: c.materials.filter((m) => m.status === "pending").length,
    approvedMaterials: c.materials.filter((m) => m.status === "approved").length,
  }));

  return NextResponse.json(result);
}

// POST: Create a course for any user
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { name, userId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const count = await prisma.course.count({ where: { userId } });

  const course = await prisma.course.create({
    data: {
      name: name.trim(),
      color: COLORS[count % COLORS.length],
      userId,
    },
  });

  // Create default weeks 1-15
  await prisma.week.createMany({
    data: Array.from({ length: 15 }, (_, i) => ({
      courseId: course.id,
      number: i + 1,
      label: `Week ${i + 1}`,
    })),
  });

  return NextResponse.json(course);
}
