import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { prefIndustry: true, prefExamples: true, prefLevel: true, prefFont: true, prefReadingMode: true },
  });

  return NextResponse.json({
    industry: user?.prefIndustry || "",
    examples: user?.prefExamples || "balanced",
    level: user?.prefLevel || "manager",
    font: user?.prefFont || "",
    readingMode: user?.prefReadingMode || "",
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { industry, examples, level, font, readingMode } = await req.json();

  await prisma.user.update({
    where: { id: userId },
    data: {
      prefIndustry: industry || null,
      prefExamples: examples || null,
      prefLevel: level || null,
      prefFont: font || null,
      prefReadingMode: readingMode || null,
    },
  });

  return NextResponse.json({ ok: true });
}
