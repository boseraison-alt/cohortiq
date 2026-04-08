import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chunkText } from "@/lib/chunks";

// POST: Admin uploads material directly — auto-approved & auto-chunked
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const adminId = (session!.user as any).id;

  // Verify course exists
  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { weeks: { select: { id: true, number: true } } },
  });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { title, content, weekId, sourceType } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const wordCount = content.trim().split(/\s+/).length;

  // Create material as already approved
  const material = await prisma.material.create({
    data: {
      courseId: params.courseId,
      weekId: weekId || null,
      title: title?.trim() || `Note – ${new Date().toLocaleDateString()}`,
      content: content.trim(),
      wordCount,
      sourceType: sourceType || "pasted",
      status: "approved",
      approvedById: adminId,
      approvedAt: new Date(),
    },
  });

  // Auto-chunk
  const chunks = chunkText(material.content, material.title, material.id);
  if (chunks.length > 0) {
    await prisma.chunk.createMany({
      data: chunks.map((c) => ({
        courseId: params.courseId,
        materialId: material.id,
        title: c.title,
        text: c.text,
        chunkIndex: c.chunkIndex,
      })),
    });
  }

  return NextResponse.json({
    id: material.id,
    title: material.title,
    wordCount,
    sourceType: material.sourceType,
    status: "approved",
    chunksCreated: chunks.length,
    createdAt: material.createdAt.toISOString(),
  });
}
