import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify course exists (all authenticated users can access any course)
  const course = await prisma.course.findFirst({
    where: { id: params.id },
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { title, content, weekId, sourceType } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 });

  const wordCount = content.trim().split(/\s+/).length;

  // Create material with "pending" status — no chunks until admin approves
  const material = await prisma.material.create({
    data: {
      courseId: params.id,
      weekId: weekId || null,
      title: title?.trim() || `Note – ${new Date().toLocaleDateString()}`,
      content: content.trim(),
      wordCount,
      sourceType: sourceType || "pasted",
      status: "pending",
    },
  });

  return NextResponse.json({
    id: material.id,
    title: material.title,
    wordCount,
    sourceType: material.sourceType,
    status: "pending",
    createdAt: material.createdAt.toISOString(),
    weekId: material.weekId,
    message: "Material submitted for admin approval.",
  });
}
