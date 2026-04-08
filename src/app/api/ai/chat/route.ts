import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askClaudeChat, type ClaudeMessage } from "@/lib/claude";
import { retrieveRelevantChunks, buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { courseId, sessionId, message, devilsAdvocate, imageBase64, imageMediaType } = await req.json();

  if (!courseId || (!message?.trim() && !imageBase64)) {
    return NextResponse.json({ error: "courseId and message or image required" }, { status: 400 });
  }

  // Get relevant chunks for RAG context
  const allChunks = await prisma.chunk.findMany({
    where: { courseId },
    select: { id: true, title: true, text: true, chunkIndex: true },
    orderBy: { chunkIndex: "asc" },
  });

  const queryText = message?.trim() || "explain the key concepts";
  const relevantChunks = allChunks.length
    ? retrieveRelevantChunks(allChunks, queryText, 30)
    : [];
  const context = buildContext(relevantChunks);

  const courseName = (await prisma.course.findUnique({
    where: { id: courseId },
    select: { name: true },
  }))?.name || "Course";

  // Get or create session
  let chatSession: any;
  let priorMessages: { role: "user" | "assistant"; content: string }[] = [];

  if (sessionId) {
    chatSession = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 40, // last 40 messages (20 turns)
        },
      },
    });
    if (!chatSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    priorMessages = chatSession.messages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  } else {
    // Create new session with auto-title
    const msgText = message?.trim() || "Photo";
    const title = msgText.slice(0, 80) + (msgText.length > 80 ? "…" : "");
    chatSession = await prisma.chatSession.create({
      data: { courseId, userId, title },
    });
  }

  // Detect podcast intent BEFORE calling Claude
  const msgForIntent = message?.trim() || "";
  const podcastIntent = /\b(create|make|generate|build|produce|record)\b.{0,30}\b(podcast|audio|episode)\b/i.test(msgForIntent)
    || /\b(podcast|audio episode)\b.{0,20}\b(on|about|covering|for)\b/i.test(msgForIntent);

  // Build messages array for Claude
  const prefs = await getUserPrefsPrompt(userId);
  const devilsAdvocateBlock = devilsAdvocate ? `DEVIL'S ADVOCATE MODE (active):
Do NOT simply answer the user's questions. Your role is to challenge their thinking:
- Question their assumptions and push back on their conclusions
- Identify logical gaps, overlooked risks, or alternative interpretations
- Respond like a rigorous MBA professor or boardroom critic
- Use the Socratic method — answer questions with sharper questions
- Only concede a point after the user has defended it with evidence or reasoning
- Keep pressure professional and intellectually respectful, never dismissive
This mode is intentional — the student wants to be challenged, not validated.

` : "";
  const systemPrompt = `${prefs}${devilsAdvocateBlock}You are an expert study assistant for the course "${courseName}". Your role is to help students develop genuine understanding — not just recall facts, but grasp why concepts matter and how they connect.

RESPONSE PHILOSOPHY — always follow these:
- Lead with the "why" before the "what". Explain why this concept exists, what problem it solves, or what gap it fills — before defining it.
- Ground every answer in the course materials. Explicitly reference them: say "the sources emphasize..." or "the course materials illustrate this with..." or "according to the readings...". Students should see that your answers come from their actual materials.
- Build a logical argument, not an exhaustive list. Each paragraph should earn its place by advancing understanding. Avoid padding, repetition, or listing every subtopic just to seem thorough.
- Explain the tension or conflict where relevant. The best educational answers expose what's counterintuitive, what common mistakes people make, or what competing approaches exist and why one is preferred.
- Use one well-chosen example to illuminate the concept — not five. A single concrete example explained deeply is more educational than many examples listed briefly.
- Always include a real-world application section. After explaining the concept from the course materials, ground it in a real business scenario — a recognizable company, industry decision, or management situation that a practicing executive would encounter. Show how the concept plays out in practice, what decision it informs, and what would go wrong without it. This is what makes theory stick.
- For calculations or problem-solving: show the steps AND explain the reasoning behind each step. The "why" of each step matters as much as the math.
- Be concise but never shallow. Depth comes from insight and connection, not from length. A focused 300-word answer is often better than an exhaustive 800-word one.
- End with a connecting sentence that places the concept in the broader course context — how does it relate to the bigger picture of the course?

COMPREHENSIVE COVERAGE — critical rules for broad questions:
- When asked to explain a chapter, topic, or section: identify EVERY learning objective, key concept, and major idea in the provided materials. Address each one. Do not skip minor topics just because a major theme dominates.
- Include ALL key formulas, equations, and quantitative frameworks mentioned in the materials. Show each formula, define every variable, and explain when to use it.
- Cover ALL key distinctions and comparisons (e.g., "variable vs fixed," "direct vs indirect") — these are exam favorites.
- Provide at least one concrete example or calculation per major concept.
- If the materials mention specific frameworks, models, or methodologies, explain each one — do not summarize them into a single paragraph.
- SELF-CHECK: Before finishing your answer, mentally scan the provided materials and ask yourself: "Have I addressed every major concept, formula, and distinction in these materials?" If you missed something, add it.

FOLLOW-UP QUESTIONS:
- After your answer, always append exactly this block with 3-4 follow-up questions on separate lines (no extra text before or after the block):
---FOLLOW_UP---
1. [first follow-up question]
2. [second follow-up question]
3. [third follow-up question]
4. [fourth follow-up question]
---END_FOLLOW_UP---
Make the questions progressively deeper — the first a natural next step, the last a stretch question linking to a broader concept or real-world implication. They should feel like a curious professor guiding the student deeper, not a generic FAQ list.

FORMATTING: Do NOT use markdown asterisks for bold (no **text**) or italic (no *text*). Do NOT use ## or # for headers. Use CAPS for section titles if needed, numbered lists, dashes for bullets, and clear paragraph breaks.

COURSE MATERIALS:
${context || "No materials loaded yet."}`;

  const userContent: ClaudeMessage["content"] = imageBase64
    ? [
        ...(message?.trim() ? [{ type: "text" as const, text: message.trim() }] : []),
        { type: "image" as const, source: { type: "base64" as const, media_type: imageMediaType || "image/jpeg", data: imageBase64 } },
      ]
    : message.trim();

  const claudeMessages: ClaudeMessage[] = [
    ...priorMessages,
    { role: "user", content: userContent },
  ];

  try {
    let answer: string;

    let followUps: string[] = [];

    if (podcastIntent) {
      // For podcast requests, give a brief acknowledgment and flag the action
      answer = "Switching to the Podcast tab now and generating your podcast automatically. This will write the script with Claude and then produce the audio — it will be ready to play in a few minutes!";
    } else {
      const raw = await askClaudeChat(systemPrompt, claudeMessages, 4096);

      // Extract follow-up questions block before stripping
      const followUpMatch = raw.match(/---FOLLOW_UP---\s*([\s\S]*?)\s*---END_FOLLOW_UP---/);
      if (followUpMatch) {
        followUps = followUpMatch[1]
          .split("\n")
          .map((l) => l.replace(/^\d+\.\s*/, "").trim())
          .filter(Boolean);
      }

      // Strip follow-up block + markdown formatting from answer
      answer = raw
        .replace(/---FOLLOW_UP---[\s\S]*?---END_FOLLOW_UP---/g, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold** → plain
        .replace(/\*(.+?)\*/g, "$1")        // *italic* → plain
        .replace(/^#{1,6}\s+/gm, "")        // ## headers → plain
        .replace(/`(.+?)`/g, "$1")          // `code` → plain
        .trim();
    }

    // Save both messages (images not persisted — store text label only)
    const savedUserContent = message?.trim() || (imageBase64 ? "[Photo attached]" : "");
    await prisma.chatMessage.createMany({
      data: [
        { sessionId: chatSession.id, role: "user", content: savedUserContent },
        { sessionId: chatSession.id, role: "assistant", content: answer },
      ],
    });

    // Update session timestamp
    await prisma.chatSession.update({
      where: { id: chatSession.id },
      data: { updatedAt: new Date() },
    });

    // Log usage (only if we called Claude)
    if (!podcastIntent) {
      await logUsage({
        userId,
        courseId,
        action: "chat",
        inputText: systemPrompt + message,
        outputText: answer,
      });
    }

    return NextResponse.json({
      sessionId: chatSession.id,
      title: chatSession.title,
      answer,
      followUps,
      hasImage: !!imageBase64,
      chunksSearched: allChunks.length,
      chunksUsed: relevantChunks.length,
      action: podcastIntent ? "generate_podcast" : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  } catch (e: any) {
    console.error("[chat]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
