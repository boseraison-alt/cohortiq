import { readFileSync } from "fs";
import { join } from "path";

// Read OpenAI key from process.env, falling back to .env file
// (needed when dev server is spawned from a parent process that overrides env vars)
export function getOpenAIKey(): string {
  const fromEnv = process.env.OPENAI_API_KEY;
  if (fromEnv && fromEnv.length > 10) return fromEnv;
  try {
    const envFile = readFileSync(join(process.cwd(), ".env"), "utf8");
    const match = envFile.match(/^OPENAI_API_KEY=["']?([^"'\r\n]+)/m);
    if (match?.[1]) return match[1];
  } catch {}
  return fromEnv || "";
}

// Generate speech from text using OpenAI TTS API (direct fetch, no SDK)
export async function generateSpeech(
  text: string,
  voice: "onyx" | "nova" = "onyx"
): Promise<Buffer> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY not found");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS error ${res.status}: ${err.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// Split long text into TTS-safe chunks at sentence boundaries
export function splitIntoChunks(text: string, maxChars = 4000): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["']?\s*/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}
