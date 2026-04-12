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

// Anthropic SDK refuses non-streaming requests whose max_tokens implies
// the response could take longer than 10 minutes. Streaming is required
// for large outputs, so we always stream and collect the result.
export async function askClaude(
  system: string,
  userMessage: string,
  maxTokens = 4096
): Promise<string> {
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

// Multi-turn chat with conversation history (supports vision content blocks)
// Uses streaming for compatibility with large max_tokens values.
export async function askClaudeChat(
  system: string,
  messages: ClaudeMessage[],
  maxTokens = 4096
): Promise<string> {
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
}
