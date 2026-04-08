import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const COLORS = [
  "#C9956B", "#6BA39E", "#A76BA3", "#6B85BF", "#BF7E65",
  "#7E9E5F", "#C47A7A", "#5E96AD", "#9B8360", "#7080B8",
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // All authenticated users see all courses — admin creates courses that everyone can study
  const courses = await prisma.course.findMany({
    include: {
      _count: { select: { materials: true, chunks: true, weeks: true } },
      materials: { select: { wordCount: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = courses.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    createdAt: c.createdAt.toISOString(),
    _count: c._count,
    totalWords: c.materials.reduce((s, m) => s + m.wordCount, 0),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  if ((session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const count = await prisma.course.count({ where: { userId } });

  const course = await prisma.course.create({
    data: {
      name: name.trim(),
      color: COLORS[count % COLORS.length],
      userId,
    },
  });

  return NextResponse.json(course);
}
