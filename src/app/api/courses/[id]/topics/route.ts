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
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get approved material titles that contain "chapter"
  const materials = await prisma.material.findMany({
    where: { courseId: params.id, status: "approved" },
    select: { title: true },
    orderBy: { createdAt: "asc" },
  });

  // Get unique chunk titles that contain "chapter"
  const chunks = await prisma.chunk.findMany({
    where: { courseId: params.id },
    select: { title: true },
    distinct: ["title"],
    orderBy: { chunkIndex: "asc" },
  });

  const isChapter = (t: string) => /chapter/i.test(t);

  // Only keep titles that include the word "chapter"
  const materialTopics = materials.map((m) => m.title).filter((t) => t && isChapter(t));
  const materialTitleSet = new Set(materialTopics.map((t) => t.toLowerCase()));
  const chunkTopics = chunks
    .map((c) => c.title)
    .filter((t) => t && isChapter(t) && !materialTitleSet.has(t.toLowerCase()));

  // Deduplicate
  const seen = new Set<string>();
  const allTopics: string[] = [];
  for (const t of [...materialTopics, ...chunkTopics]) {
    const key = t.toLowerCase().trim();
    if (!seen.has(key) && t.trim().length > 2) {
      seen.add(key);
      allTopics.push(t.trim());
    }
  }

  // Natural / numerical sort so Chapter 2 comes before Chapter 7, Chapter 10, etc.
  const naturalSort = (a: string, b: string) => {
    const tokenize = (s: string) =>
      s.split(/(\d+)/).map((p) => (isNaN(Number(p)) ? p.toLowerCase() : Number(p)));
    const ta = tokenize(a);
    const tb = tokenize(b);
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
      const av = ta[i] ?? "";
      const bv = tb[i] ?? "";
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  };

  return NextResponse.json({ topics: allTopics.sort(naturalSort).slice(0, 30) });
}
