import { prisma } from "./db";

// Cost rates (approximate)
const RATES = {
  claude_input: 3 / 1_000_000,    // $3 per 1M input tokens
  claude_output: 15 / 1_000_000,   // $15 per 1M output tokens
  tts_chars: 15 / 1_000_000,       // $15 per 1M characters
};

// Rough token estimation: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function logUsage({
  userId,
  courseId,
  action,
  inputText,
  outputText,
  ttsChars = 0,
}: {
  userId: string;
  courseId?: string;
  action: string;
  inputText?: string;
  outputText?: string;
  ttsChars?: number;
}) {
  const inputTokens = inputText ? estimateTokens(inputText) : 0;
  const outputTokens = outputText ? estimateTokens(outputText) : 0;

  const costUsd =
    inputTokens * RATES.claude_input +
    outputTokens * RATES.claude_output +
    ttsChars * RATES.tts_chars;

  await prisma.usageLog.create({
    data: {
      userId,
      courseId: courseId || null,
      action,
      inputTokens,
      outputTokens,
      ttsChars,
      costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, // 6 decimal precision
    },
  });

  return { inputTokens, outputTokens, ttsChars, costUsd };
}

export async function getUserUsageSummary(userId: string) {
  const logs = await prisma.usageLog.findMany({
    where: { userId },
    select: { action: true, costUsd: true, createdAt: true },
  });

  const totalCost = logs.reduce((s, l) => s + l.costUsd, 0);
  const byAction: Record<string, { count: number; cost: number }> = {};

  for (const l of logs) {
    if (!byAction[l.action]) byAction[l.action] = { count: 0, cost: 0 };
    byAction[l.action].count++;
    byAction[l.action].cost += l.costUsd;
  }

  return { totalCost, totalCalls: logs.length, byAction };
}
