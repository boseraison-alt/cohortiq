import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") || "pending";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const [materials, total] = await Promise.all([
    prisma.material.findMany({
      where: { status },
      select: {
        id: true,
        title: true,
        wordCount: true,
        sourceType: true,
        status: true,
        createdAt: true,
        content: true,
        course: { select: { id: true, name: true, user: { select: { name: true, email: true } } } },
        week: { select: { number: true, label: true } },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
    }),
    prisma.material.count({ where: { status } }),
  ]);

  // Truncate content for preview (don't send full text in list)
  const result = materials.map((m) => ({
    ...m,
    contentPreview: m.content.slice(0, 500) + (m.content.length > 500 ? "…" : ""),
    content: undefined,
  }));

  return NextResponse.json({ items: result, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}
