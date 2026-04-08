import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const material = await prisma.material.findFirst({
    where: { id: params.mid, courseId: params.id },
    select: { id: true, title: true, content: true, wordCount: true, sourceType: true, createdAt: true, weekId: true },
  });

  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(material);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekId } = await req.json();

  const material = await prisma.material.update({
    where: { id: params.mid },
    data: { weekId: weekId || null },
  });

  return NextResponse.json(material);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; mid: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Delete chunks first
  await prisma.chunk.deleteMany({ where: { materialId: params.mid } });
  await prisma.material.deleteMany({ where: { id: params.mid, courseId: params.id } });

  return NextResponse.json({ ok: true });
}
