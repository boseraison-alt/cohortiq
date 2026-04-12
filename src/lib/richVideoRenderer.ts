/**
 * Full background pipeline for rich narrated videos.
 *
 * Runs entirely outside HTTP request handlers (fire-and-forget).
 * This avoids Railway's proxy timeout permanently.
 *
 * Pipeline: Claude → JSON recovery → PNG → TTS → FFmpeg → DB update
 *
 * The client polls /api/ai/rich-video/status?videoId=X until
 * the video's url changes from "pending" to the actual MP4 path,
 * or to "error" if something failed.
 */

import { prisma } from "@/lib/db";
import { askClaude } from "@/lib/claude";
import { buildContext } from "@/lib/chunks";
import { logUsage } from "@/lib/usage";
import { getUserPrefsPrompt } from "@/lib/preferences";
import { recoverDeckJson } from "@/lib/jsonRecovery";
import { generateSpeech, splitIntoChunks } from "@/lib/tts";
import { renderSlideToPng } from "@/lib/slides";
import { buildRichSlideSvg } from "@/lib/richSlides";
import { compositeVideo } from "@/lib/ffmpeg";
import { getUploadDir, getUploadUrl } from "@/lib/uploads";
import { mkdir } from "fs/promises";
import path from "path";
import type { Slide } from "@/lib/slideDeckTemplate";

// We import the prompt builder dynamically to keep this file focused
// on orchestration. The prompt is large — see the inline string below.

interface GenerateParams {
  videoId: string;
  userId: string;
  courseId: string;
  topic: string;
  slideCount: number;
  lang: string;
}

/**
 * Full end-to-end generation: Claude slides → PNG → TTS → FFmpeg → DB update.
 * Runs in background (fire-and-forget from the route handler).
 */
export async function generateRichVideoFull(params: GenerateParams): Promise<void> {
  const { videoId, userId, courseId, topic, slideCount, lang } = params;

  try {
    console.log(`[bg-gen] Starting full generation for ${videoId}: "${topic}" (${slideCount} slides)`);

    // ── Step 1: Build prompt + call Claude ──
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { name: true, color: true },
    });
    const courseName = course?.name || "Course";
    const accentColor = course?.color || "#C9956B";

    const chunks = await prisma.chunk.findMany({
      where: { courseId },
      select: { title: true, text: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
      take: 30,
    });
    const context = chunks.length ? buildContext(chunks) : "";

    const prefs = await getUserPrefsPrompt(userId);

    const LANG_NAMES: Record<string, string> = {
      en: "English", ja: "Japanese", es: "Spanish", fr: "French", zh: "Mandarin Chinese",
    };
    const langName = LANG_NAMES[lang] ?? "English";
    const langInstruction = lang === "en" ? "" :
      `\n\nLANGUAGE: Generate ALL content AND narration in ${langName}.`;

    const systemPrompt = buildPrompt(prefs, courseName, topic, slideCount, context, langInstruction);

    const maxClaudeTokens = Math.min(32000, Math.max(8192, slideCount * 1500 + 2000));
    console.log(`[bg-gen] Calling Claude (max_tokens=${maxClaudeTokens})`);
    const claudeStart = Date.now();

    const raw = await askClaude(
      systemPrompt,
      `Generate the ${slideCount}-slide rich narrated presentation on: "${topic}"`,
      maxClaudeTokens
    );

    console.log(`[bg-gen] Claude done in ${Math.round((Date.now() - claudeStart) / 1000)}s, chars=${raw?.length || 0}`);

    // ── Step 2: Parse Claude output ──
    const parsed = recoverDeckJson(raw) as { deckTitle?: string; subtitle?: string; slides: Slide[] } | null;
    if (!parsed?.slides?.length) {
      throw new Error("Claude returned unparseable JSON");
    }
    console.log(`[bg-gen] Parsed ${parsed.slides.length} slides`);

    // ── Step 3: Render PNGs (serial) ──
    const totalSlides = parsed.slides.length;
    console.log(`[bg-gen] Rendering ${totalSlides} PNGs`);
    const pngs: Buffer[] = [];
    for (let i = 0; i < totalSlides; i++) {
      const svg = buildRichSlideSvg(parsed.slides[i], i, totalSlides, accentColor, courseName);
      pngs.push(await renderSlideToPng(svg));
    }

    // ── Step 4: TTS (concurrency=2) ──
    console.log(`[bg-gen] Generating TTS`);
    const mp3s: Buffer[] = new Array(totalSlides);
    let nextIdx = 0;
    const workers = Array.from({ length: Math.min(2, totalSlides) }, async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= totalSlides) return;
        const slide = parsed.slides[i];
        const narrationText = slide.narration ||
          `${slide.title}. ${(slide.body || [])
            .map((c: any) =>
              c.type === "bullets" ? c.items?.map((it: any) => it.text).join(". ") :
              c.type === "quote" ? c.text :
              c.type === "sbox" ? `${c.box?.title}. ${c.box?.body}` :
              c.type === "formula" ? c.text :
              c.type === "icard" ? `${c.title}. ${c.body}` : ""
            ).filter(Boolean).join(". ")}` || slide.title;

        const textChunks = splitIntoChunks(narrationText, 4000);
        const audioBuffers: Buffer[] = [];
        for (const chunk of textChunks) {
          audioBuffers.push(await generateSpeech(chunk, "onyx"));
        }
        mp3s[i] = Buffer.concat(audioBuffers);
      }
    });
    await Promise.all(workers);

    // ── Step 5: FFmpeg composite ──
    const slideMedia = pngs.map((png, i) => ({ png, mp3: mp3s[i] }));
    const uploadDir = getUploadDir("videos");
    await mkdir(uploadDir, { recursive: true });

    const safeTopic = topic.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_").slice(0, 40);
    const fileName = `rich_${safeTopic}_${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, fileName);

    console.log(`[bg-gen] FFmpeg compositing`);
    const { fileSize, slideDurations } = await compositeVideo(slideMedia, outputPath, { cinematic: true });

    // ── Step 6: Update DB ──
    const enrichedSlides = parsed.slides.map((s: Slide, i: number) => ({
      title: s.title,
      points: (s.body || []).flatMap((c: any) => {
        if (c.type === "bullets") return (c.items || []).map((it: any) => it.text);
        if (c.type === "sbox") return [`${c.box?.title}: ${c.box?.body}`];
        if (c.type === "grid2" || c.type === "grid3") return (c.boxes || []).map((b: any) => `${b.title}: ${b.body}`);
        if (c.type === "quote") return [`"${c.text}"`];
        if (c.type === "formula") return [c.text];
        if (c.type === "icard") return [`${c.title}: ${c.body}`];
        return [];
      }).slice(0, 8),
      narration: s.narration || "",
      icon: "",
      formulas: (s.body || []).filter((c: any) => c.type === "formula").map((c: any) => c.text),
      duration: slideDurations[i] ?? 30,
      tag: s.tag, tagColor: s.tagColor, body: s.body,
    }));

    await prisma.video.update({
      where: { id: videoId },
      data: {
        title: parsed.deckTitle || topic,
        url: getUploadUrl("videos", fileName),
        fileName,
        fileSize,
        description: parsed.subtitle || `Rich ${totalSlides}-slide narrated video`,
        slidesData: JSON.stringify(enrichedSlides),
      },
    });

    const totalChars = parsed.slides.reduce((acc: number, s: Slide) => acc + (s.narration?.length || 0), 0);
    await logUsage({ userId, courseId, action: "narration", ttsChars: totalChars });

    console.log(`[bg-gen] ✅ Video ${videoId} complete: ${fileName} (${fileSize} bytes)`);
  } catch (err: any) {
    console.error(`[bg-gen] ❌ Video ${videoId} failed:`, err?.message);
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: {
          url: "error",
          description: `Generation failed: ${(err?.message || "unknown").slice(0, 200)}`,
        },
      });
    } catch {}
  }
}

// ── The rich video prompt (moved here so the route file stays minimal) ──

function buildPrompt(
  prefs: string,
  courseName: string,
  topic: string,
  slideCount: number,
  context: string,
  langInstruction: string
): string {
  return `${prefs}You are creating a rich narrated slide presentation for "${courseName}".

Topic: "${topic}"
Slide count: ${slideCount}

Return ONLY valid JSON. No markdown fences.

CRITICAL JSON RULES:
- Escape double quotes inside strings with backslash.
- Use single quotes for inner quotations: 'like this' not "like this".
- No trailing commas. No text outside the JSON.

STRUCTURE:
{"deckTitle":"string","subtitle":"string","slides":[...]}

Each slide: {"tag":"label","tagColor":"p|t|c|a|g|b|r","title":"title","body":[components],"narration":"80-120 words spoken text"}

COMPONENTS (use 2-3 per slide, VARY across slides):

grid2: {"type":"grid2","boxes":[{"color":"t","title":"A","body":"..."},{"color":"p","title":"B","body":"..."}]}
grid3: {"type":"grid3","boxes":[{"color":"b","title":"1","body":"..."},{"color":"p","title":"2","body":"..."},{"color":"t","title":"3","body":"..."}]}
sbox: {"type":"sbox","box":{"color":"a","title":"Key","body":"..."}}
quote: {"type":"quote","text":"memorable insight","color":"a"}
formula: {"type":"formula","text":"BEP = Fixed Costs / (Price - VC)"}
icard: {"type":"icard","title":"EXAMPLE","body":"Specific case with numbers"}
table: {"type":"table","headers":["A","B"],"rows":[{"cells":["x","y"]}]}
bullets: {"type":"bullets","items":[{"text":"point","color":"t"}]}
barchart: {"type":"barchart","title":"Title","bars":[{"label":"Q1","value":125,"color":"t"}]}
linechart: {"type":"linechart","title":"Title","series":[{"label":"Rev","color":"t","points":[[2020,100],[2025,250]]}]}
piechart: {"type":"piechart","title":"Share","slices":[{"label":"A","value":45,"color":"p"}]}
metrics: {"type":"metrics","items":[{"label":"Revenue","value":"$12M","delta":"+23%","color":"g"}]}
progress: {"type":"progress","title":"Funnel","items":[{"label":"Awareness","percent":85,"color":"t"}]}

RULES:
1. Every slide must have a concrete example (real company, real numbers).
2. Quantitative topics (CVP, break-even, variance, pricing): at least 3 graph components.
3. For CVP/break-even: MUST include a linechart AND metrics/barchart.
4. Narration is 80-120 words, conversational, walks through examples.
5. Use **bold** in body text.

COURSE MATERIALS:
${context || "No materials — use general knowledge."}${langInstruction}`;
}
