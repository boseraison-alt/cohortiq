import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaudeChat } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { courseId, topic, messages, action } = await req.json();

  const chunks = await prisma.chunk.findMany({
    where: { courseId },
    select: { title: true, text: true, chunkIndex: true },
    take: 60,
  });

  if (!chunks.length) {
    return NextResponse.json({ error: "No materials found" }, { status: 400 });
  }

  // Filter chunks relevant to the topic
  const topicChunks = chunks.filter(
    (c) =>
      c.title.toLowerCase().includes(topic.toLowerCase()) ||
      c.text.toLowerCase().includes(topic.toLowerCase())
  );
  const ctx = buildContext(topicChunks.length >= 3 ? topicChunks : chunks);
  const courseName =
    (await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }))?.name ||
    "Course";

  if (action === "score") {
    // Generate final readiness score based on the conversation
    const conversationText = messages
      .map((m: any) => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`)
      .join("\n\n");

    const system = `You are an expert evaluator assessing a student's conceptual understanding of "${topic}" from ${courseName}.
You have access to the course materials below. Judge the student's explanations against what the materials actually say.

COURSE MATERIALS:
${ctx}

Your task: analyze the conversation and produce a JSON score report. Return ONLY valid JSON, no other text.`;

    const userMsg = `Here is the Feynman teaching session conversation:

${conversationText}

Produce a JSON report in exactly this format:
{
  "overallScore": <0-100>,
  "readinessLevel": "<Beginner|Developing|Proficient|Mastery>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "subTopicScores": [
    { "topic": "<sub-topic name>", "score": <0-100> }
  ],
  "nextSteps": "<1-2 sentence recommendation>",
  "summary": "<2-3 sentence overall assessment>"
}`;

    const raw = await askClaudeChat(system, [{ role: "user", content: userMsg }], 1024);

    await logUsage({ userId, courseId, action: "feynman_score" });

    try {
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : raw);
      return NextResponse.json({ score: parsed });
    } catch {
      return NextResponse.json({ error: "Failed to parse score" }, { status: 500 });
    }
  }

  // Regular conversation turn — AI acts as curious student
  const system = `You are playing the role of a curious, intelligent student who knows nothing about "${topic}". You are asking ${courseName} student to teach you this concept using the Feynman Technique.

Your behavior rules:
1. NEVER explain the concept yourself — you are the student being taught, not the teacher.
2. Ask ONE focused follow-up question per turn. Do not overwhelm with multiple questions.
3. If the explanation is unclear, ask for simpler language or a real-world example.
4. If something is subtly wrong (based on the course materials), gently surface it: "Hmm, I thought I heard something different about X — can you clarify?"
5. If a key concept from the materials is missing from their explanation, ask about it naturally.
6. Stay warm, curious, and never condescending. The student should feel safe being wrong.
7. After 4+ turns of good explanation, you may say you're starting to understand and ask them to connect it to a related concept.
8. Keep responses concise — 2-4 sentences max, then your question.

COURSE MATERIALS (use these to know what's correct and what key concepts should be covered):
${ctx}

IMPORTANT: You are a student. Never give away answers. Only probe, clarify, and ask.`;

    const reply = await askClaudeChat(system, messages, 512);

  await logUsage({ userId, courseId, action: "feynman_chat" });

  return NextResponse.json({ reply });
}
