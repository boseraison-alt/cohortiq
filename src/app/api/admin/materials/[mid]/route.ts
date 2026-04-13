import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chunkText } from "@/lib/chunks";

// GET full content for review
export async function GET(req: NextRequest, { params }: { params: { mid: string } }) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const material = await prisma.material.findUnique({
    where: { id: params.mid },
    include: {
      course: { select: { name: true, user: { select: { name: true, email: true } } } },
      week: { select: { number: true, label: true } },
    },
  });

  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(material);
}

// PATCH: approve or reject
export async function PATCH(req: NextRequest, { params }: { params: { mid: string } }) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const adminId = (session!.user as any).id;
  const { action, rejectedNote } = await req.json();

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
  }

  const material = await prisma.material.findUnique({ where: { id: params.mid } });
  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "approve") {
    // Update status
    await prisma.material.update({
      where: { id: params.mid },
      data: {
        status: "approved",
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });

    // Create chunks now that it's approved
    const chunks = chunkText(material.content, material.title, material.id);
    if (chunks.length > 0) {
      await prisma.chunk.createMany({
        data: chunks.map((c) => ({
          courseId: material.courseId,
          materialId: material.id,
          title: c.title,
          text: c.text,
          chunkIndex: c.chunkIndex,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      status: "approved",
      chunksCreated: chunks.length,
    });
  } else {
    // Reject
    await prisma.material.update({
      where: { id: params.mid },
      data: {
        status: "rejected",
        rejectedNote: rejectedNote || null,
      },
    });

    return NextResponse.json({ ok: true, status: "rejected" });
  }
}

// DELETE: permanently remove a material and its chunks
export async function DELETE(req: NextRequest, { params }: { params: { mid: string } }) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const material = await prisma.material.findUnique({ where: { id: params.mid } });
  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete chunks first (foreign key dependency)
  await prisma.chunk.deleteMany({ where: { materialId: params.mid } });
  await prisma.material.delete({ where: { id: params.mid } });

  return NextResponse.json({ ok: true, deleted: params.mid });
}
