/**
 * CohortIQ — Tutorial Video Generator
 * Generates a ~2-minute MP4 walkthrough of all CohortIQ features.
 *
 * Run with:
 *   npx tsx scripts/generate-tutorial.ts
 */

import { buildSlideSvg, renderSlideToPng } from "../src/lib/slides";
import { generateSpeech, splitIntoChunks } from "../src/lib/tts";
import { compositeVideo } from "../src/lib/ffmpeg";
import { mkdir } from "fs/promises";
import path from "path";

// ── Branding ────────────────────────────────────────────────────────────────

const COURSE_NAME  = "CohortIQ";
const ACCENT_COLOR = "#C9956B";
const OUTPUT_FILE  = "study-ai-tutorial.mp4";

// ── Slides (~30 s each = ~2 min total) ──────────────────────────────────────

const slides = [
  {
    title: "Welcome to CohortIQ",
    icon: "🎓",
    points: [
      "Your AI-powered learning companion",
      "Upload any course material to get started",
      "Works across any subject or discipline",
      "Available in English, Japanese, French, Spanish & Chinese",
    ],
    narration:
      "Welcome to CohortIQ — your intelligent learning companion. Getting started takes seconds: create a course, upload your materials by pasting text or adding documents, and CohortIQ instantly becomes an expert on your content. The platform works across any subject, from accounting to zoology, and supports five languages so students worldwide can study in their native tongue.",
  },
  {
    title: "Chat with Your Materials",
    icon: "💬",
    points: [
      "Ask anything about your course content",
      "Multi-turn conversations saved automatically",
      "Filter context to specific weeks or topics",
      "Every answer grounded in your actual materials",
    ],
    narration:
      "The Chat tab gives you a direct conversation with your course materials. Ask follow-up questions, request plain-language explanations, or ask it to compare two concepts — and every answer is grounded in your own uploaded content, not generic internet knowledge. Conversations are titled and saved automatically, so you can pick up right where you left off anytime.",
  },
  {
    title: "Practice, Flashcards & Insights",
    icon: "📝",
    points: [
      "Multiple choice, short answer & essay questions",
      "AI grades your answers with detailed feedback",
      "Weighted mode targets your weakest areas",
      "Flashcards for rapid recall practice",
      "Insights dashboard tracks performance over time",
    ],
    narration:
      "The Practice tab generates multiple choice, short answer, and essay questions from your materials in seconds. Submit your answers and receive detailed AI feedback and a score. Weighted mode intelligently focuses on the topics where you struggle most — the more you practice, the smarter the targeting. Flashcards complement this with quick-fire recall, and the Insights dashboard shows exactly where to focus next.",
  },
  {
    title: "Podcasts & Video Presentations",
    icon: "🎬",
    points: [
      "Generate AI study podcasts from your materials",
      "Choose conversation or solo lecture format",
      "AI video presentations with narrated slides",
      "Select topic, duration & language",
      "Everything auto-saved to your video library",
    ],
    narration:
      "Take your studying anywhere with AI-generated podcasts. Choose a two-voice conversational format or a solo lecture — CohortIQ writes the entire script and narrates it with natural-sounding voices. For visual learners, the Videos tab creates full slide presentations with synchronized narration, saved as MP4 files you can replay anytime. Pick your topic, duration, and language, and your content is ready in minutes.",
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎬  CohortIQ Tutorial Video Generator");
  console.log("─".repeat(44));
  console.log(`📋  ${slides.length} slides · ~2 min · voice: onyx\n`);

  const slideMedia: { png: Buffer; mp3: Buffer }[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    console.log(`▶  Slide ${i + 1}/${slides.length}: ${slide.title}`);

    // Render SVG → PNG
    const svg = buildSlideSvg(slide, i, slides.length, ACCENT_COLOR, COURSE_NAME);
    const png = await renderSlideToPng(svg);
    console.log("   ✓ PNG rendered (1920×1080)");

    // Generate TTS narration
    const chunks = splitIntoChunks(slide.narration, 4000);
    const audioBuffers: Buffer[] = [];
    for (const chunk of chunks) {
      audioBuffers.push(await generateSpeech(chunk, "onyx"));
    }
    const mp3 = Buffer.concat(audioBuffers);
    console.log(`   ✓ Audio generated (${(mp3.length / 1024).toFixed(0)} KB)`);

    slideMedia.push({ png, mp3 });
  }

  // Save to public/uploads/videos so it appears in the Videos tab
  const uploadDir = path.join(process.cwd(), "public", "uploads", "videos");
  await mkdir(uploadDir, { recursive: true });
  const outputPath = path.join(uploadDir, OUTPUT_FILE);

  console.log("\n🎞   Compositing final MP4…");
  const { fileSize } = await compositeVideo(slideMedia, outputPath);

  console.log("\n✅  Done!");
  console.log(`   File : public/uploads/videos/${OUTPUT_FILE}`);
  console.log(`   Size : ${(fileSize / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`   URL  : http://localhost:3000/uploads/videos/${OUTPUT_FILE}`);
  console.log("\n💡  Tip: Add it to the Videos tab via Admin → Add Video URL");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
