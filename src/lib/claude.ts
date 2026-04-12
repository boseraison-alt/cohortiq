import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

// Read API key from process.env, falling back to parsing .env file directly.
// This is needed because if the dev server is launched from a parent process
// that has ANTHROPIC_API_KEY="" in its environment, Next.js dotenv won't
// override it (dotenv never overrides existing env vars).
function getApiKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.length > 10) return fromEnv;

  try {
    const envFile = readFileSync(join(process.cwd(), ".env"), "utf8");
    const match = envFile.match(/^ANTHROPIC_API_KEY=["']?([^"'\r\n]+)/m);
    if (match?.[1]) return match[1];
  } catch {}

  return fromEnv || "";
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const key = getApiKey();
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s

// Retry-able error types from Anthropic (transient, worth retrying)
function isRetryable(err: any): boolean {
  const msg = (err?.message || err?.error?.message || "").toLowerCase();
  const type = err?.error?.type || err?.error?.error?.type || "";
  return (
    type === "overloaded_error" ||
    type === "rate_limit_error" ||
    msg.includes("overloaded") ||
    msg.includes("rate limit") ||
    msg.includes("529") ||
    msg.includes("503") ||
    msg.includes("too many requests")
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Streaming Claude call with automatic retry on transient errors
// (overloaded, rate-limited). Retries up to 3 times with exponential backoff.
export async function askClaude(
  system: string,
  userMessage: string,
  maxTokens = 4096
): Promise<string> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = await getClient().messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMessage }],
        stream: true,
      });

      let text = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          text += event.delta.text;
        }
      }
      return text;
    } catch (err: any) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        const delay = RETRY_DELAYS[attempt] || 30000;
        console.warn(
          `[claude] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${delay / 1000}s:`,
          err?.error?.type || err?.message
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

type ImageContentBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};

type TextContentBlock = {
  type: "text";
  text: string;
};

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string | Array<TextContentBlock | ImageContentBlock>;
};

// Multi-turn chat with conversation history (supports vision content blocks).
// Uses streaming + retry on transient errors.
export async function askClaudeChat(
  system: string,
  messages: ClaudeMessage[],
  maxTokens = 4096
): Promise<string> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = await getClient().messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: messages as any,
        stream: true,
      });

      let text = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          text += event.delta.text;
        }
      }
      return text;
    } catch (err: any) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        const delay = RETRY_DELAYS[attempt] || 30000;
        console.warn(
          `[claude-chat] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${delay / 1000}s:`,
          err?.error?.type || err?.message
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
