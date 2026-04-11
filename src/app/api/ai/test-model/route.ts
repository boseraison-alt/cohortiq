import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

/**
 * Diagnostic route — tries several Claude model IDs in sequence and reports
 * which one actually works. Useful when narration/slidedeck fail with generic
 * errors to determine if the problem is the model ID or something else.
 */

function getApiKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.length > 10) return fromEnv;
  try {
    const envFile = readFileSync(join(process.cwd(), ".env"), "utf8");
    const match = envFile.match(/^ANTHROPIC_API_KEY=["']?([^"'\r\n]+)/m);
    if (match?.[1]) return match[1];
  } catch {}
  return "";
}

const MODELS_TO_TEST = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514",
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not found" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });
  const results: { model: string; ok: boolean; error?: string; response?: string }[] = [];

  for (const model of MODELS_TO_TEST) {
    try {
      const r = await client.messages.create({
        model,
        max_tokens: 30,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      });
      const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      results.push({ model, ok: true, response: text });
    } catch (e: any) {
      const errMsg =
        e?.error?.error?.message ||
        e?.message ||
        String(e);
      results.push({ model, ok: false, error: errMsg.slice(0, 200) });
    }
  }

  return NextResponse.json({
    keyPresent: !!apiKey,
    keyLength: apiKey.length,
    keyPrefix: apiKey.slice(0, 10) + "...",
    results,
  });
}
