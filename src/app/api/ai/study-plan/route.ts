import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { courseId, days } = await req.json();
    if (!courseId || !days || days < 1 || days > 90) {
      return NextResponse.json({ error: "courseId and days (1–90) required" }, { status: 400 });
    }

    const userId = (session.user as any).id;

    // ── Fetch performance history ─────────────────────────────────────────────
    const perf = await prisma.performance.findMany({
      where: { courseId, userId },
      select: { topic: true, correct: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // ── Aggregate topic accuracy ──────────────────────────────────────────────
    const topicMap = new Map<string, { correct: number; total: number; lastSeen: Date }>();
    for (const p of perf) {
      const existing = topicMap.get(p.topic) || { correct: 0, total: 0, lastSeen: new Date(0) };
      topicMap.set(p.topic, {
        correct: existing.correct + (p.correct ? 1 : 0),
        total: existing.total + 1,
        lastSeen: p.createdAt > existing.lastSeen ? p.createdAt : existing.lastSeen,
      });
    }

    const topicStats = Array.from(topicMap.entries())
      .map(([topic, s]) => ({
        topic,
        accuracy: Math.round((s.correct / s.total) * 100),
        attempts: s.total,
        daysSincePracticed: Math.floor((Date.now() - s.lastSeen.getTime()) / 86400000),
      }))
      .sort((a, b) => a.accuracy - b.accuracy); // weakest first

    // ── Fetch available topics from chunks ────────────────────────────────────
    const chunkTitles = await prisma.chunk.findMany({
      where: { courseId },
      select: { title: true },
      distinct: ["title"],
      orderBy: { chunkIndex: "asc" },
    });
    const naturalSort = (a: string, b: string) => {
      const tok = (s: string) => s.split(/(\d+)/).map((p) => isNaN(Number(p)) ? p.toLowerCase() : Number(p));
      const ta = tok(a); const tb = tok(b);
      for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
        const av = ta[i] ?? ""; const bv = tb[i] ?? "";
        if (av < bv) return -1; if (av > bv) return 1;
      }
      return 0;
    };
    const availableTopics = chunkTitles.map((c) => c.title).sort(naturalSort).slice(0, 40);

    // ── Course name ───────────────────────────────────────────────────────────
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true },
    });

    // ── Build Claude prompt ───────────────────────────────────────────────────
    const weakTopics = topicStats.filter((t) => t.accuracy < 70).slice(0, 10);
    const strongTopics = topicStats.filter((t) => t.accuracy >= 70).slice(0, 5);
    const unpracticed = availableTopics.filter(
      (t) => !topicMap.has(t)
    ).slice(0, 10);

    const topicContext = [
      weakTopics.length
        ? `WEAK TOPICS (prioritize heavily):\n${weakTopics.map((t) => `- ${t.topic}: ${t.accuracy}% accuracy (${t.attempts} attempts, last seen ${t.daysSincePracticed}d ago)`).join("\n")}`
        : "",
      strongTopics.length
        ? `STRONG TOPICS (include for confidence):\n${strongTopics.map((t) => `- ${t.topic}: ${t.accuracy}% accuracy`).join("\n")}`
        : "",
      unpracticed.length
        ? `NEVER PRACTICED (must cover):\n${unpracticed.map((t) => `- ${t}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const noPerfData = topicStats.length === 0;

    const systemPrompt = `You are an expert exam coach creating a personalized ${days}-day study plan for a student preparing for their "${course?.name || "course"}" exam.

${noPerfData ? `The student has no practice history yet. Create a comprehensive plan using these available topics:\n${availableTopics.slice(0, 20).join(", ")}` : topicContext}

STUDY PLAN RULES:
- Day ${days} is EXAM DAY — assign only light review and rest, NO new material
- Days ${Math.max(1, days - 2)}–${days - 1} (if applicable): final review only, no new topics
- Weight weak topics 3x more than strong topics
- Alternate between flashcards (fast recall), practice (deep understanding), and review (reading/podcast)
- Keep daily total study time realistic: ${days <= 3 ? "3–4 hours/day max" : days <= 7 ? "2–3 hours/day" : "1–2 hours/day"}
- For each day assign 2–4 tasks. Use task types: "flashcards", "practice", "review", "podcast", "rest"
- "rest" tasks have no topic — only use on exam eve and exam day

Respond ONLY with valid JSON matching this exact schema:
{
  "planTitle": "string",
  "summary": "string (2 sentences — key focus areas and strategy)",
  "days": [
    {
      "day": 1,
      "theme": "string (e.g. 'Foundation Reset')",
      "focus": "string (main topic of the day)",
      "urgency": "high|medium|low",
      "tasks": [
        {
          "id": "d1-t1",
          "type": "flashcards|practice|review|podcast|rest",
          "topic": "string (or null for rest)",
          "count": 15,
          "durationMin": 20,
          "note": "string (specific tip for this task)"
        }
      ]
    }
  ]
}`;

    const raw = await askClaude(systemPrompt, `Generate the ${days}-day study plan as JSON.`, 4096);

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse study plan JSON");
    const plan = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ plan, topicStats });
  } catch (e: any) {
    console.error("[study-plan]", e.message);
    return NextResponse.json({ error: e.message || "Failed to generate plan" }, { status: 500 });
  }
}
