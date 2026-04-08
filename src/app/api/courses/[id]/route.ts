import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Any authenticated user can access any course
  const course = await prisma.course.findFirst({
    where: { id: params.id },
    include: {
      weeks: {
        include: { materials: { select: { id: true, title: true, wordCount: true, sourceType: true, createdAt: true, weekId: true, status: true }, orderBy: { createdAt: "asc" } } },
        orderBy: { number: "asc" },
      },
      _count: { select: { chunks: true, materials: true } },
    },
  });

  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Also get unassigned materials (weekId is null)
  const unassigned = await prisma.material.findMany({
    where: { courseId: params.id, weekId: null },
    select: { id: true, title: true, wordCount: true, sourceType: true, createdAt: true, weekId: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ ...course, unassigned });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await prisma.course.deleteMany({
    where: { id: params.id },
  });

  return NextResponse.json({ ok: true });
}
