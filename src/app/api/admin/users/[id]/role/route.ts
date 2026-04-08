import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { role } = await req.json();
  if (role !== "admin" && role !== "member") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Prevent revoking the last admin
  if (role === "member") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { role: true } });
    if (target?.role === "admin" && adminCount <= 1) {
      return NextResponse.json({ error: "Cannot revoke the last admin" }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });

  return NextResponse.json(updated);
}
