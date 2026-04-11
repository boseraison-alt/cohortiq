/**
 * CohortIQ Video Tool Router
 *
 * Analyzes lesson content and picks the best external video generation
 * service (X-Pilot for technical / formulas / data, HeyGen for instructor-led,
 * Runway for creative, or a fallback static slideshow).
 *
 * Usage: call `classifyByKeywords(content)` or `classifyWithLLM(content, subject)`.
 */

export type VideoTool = "xpilot" | "heygen" | "runway" | "static";

export interface ContentAnalysis {
  tool: VideoTool;
  confidence: number;
  reason: string;
  fallback?: VideoTool;
}

export interface LessonContent {
  title: string;
  body: string;
  subject: string;
  hasFormulas: boolean;
  hasData: boolean;
  needsPresenter: boolean;
  isCreative: boolean;
}

// ── Rule-based classifier (fast, free) ────────────────────────────────────────

export function classifyContent(content: LessonContent): ContentAnalysis {
  // Priority 1: Formulas / calculations / precise data → X-Pilot
  if (content.hasFormulas || content.hasData) {
    return {
      tool: "xpilot",
      confidence: 0.95,
      reason: "Content contains formulas or data requiring precision",
      fallback: "static",
    };
  }

  // Priority 2: Accounting / finance / statistics → X-Pilot
  const precisionSubjects = ["accounting", "finance", "statistics", "economics", "math"];
  if (precisionSubjects.includes(content.subject.toLowerCase())) {
    return {
      tool: "xpilot",
      confidence: 0.85,
      reason: `${content.subject} requires accurate visualizations`,
      fallback: "static",
    };
  }

  // Priority 3: Needs human presence → HeyGen
  if (content.needsPresenter) {
    return {
      tool: "heygen",
      confidence: 0.9,
      reason: "Content benefits from instructor presence",
      fallback: "xpilot",
    };
  }

  // Priority 4: Creative / brand → Runway
  if (content.isCreative) {
    return {
      tool: "runway",
      confidence: 0.8,
      reason: "Creative content needs cinematic visuals",
      fallback: "heygen",
    };
  }

  return {
    tool: "xpilot",
    confidence: 0.7,
    reason: "Default for educational content",
    fallback: "static",
  };
}

// ── Keyword detection ────────────────────────────────────────────────────────

const TOOL_KEYWORDS: Record<VideoTool, string[]> = {
  xpilot: [
    "formula", "calculate", "equation", "chart", "graph", "ratio",
    "cvp", "break-even", "variance", "budget", "cost", "revenue",
    "roi", "margin", "profit", "loss", "balance sheet", "income statement",
    "funnel", "framework", "process", "cycle", "steps", "workflow",
  ],
  heygen: [
    "introduce", "welcome", "explain", "discuss", "talk about",
    "let me show", "in this lesson", "today we", "instructor",
    "motivation", "mindset", "soft skills", "communication",
  ],
  runway: [
    "brand", "aesthetic", "visual", "creative", "design", "logo",
    "campaign", "advertisement", "mood", "style", "cinematic",
    "story", "narrative", "emotional", "impact",
  ],
  static: [
    "definition", "glossary", "reference", "list of", "terms",
    "reading", "review", "summary",
  ],
};

export function classifyByKeywords(content: string): ContentAnalysis {
  const lower = content.toLowerCase();

  const scores: Record<VideoTool, number> = {
    xpilot: 0, heygen: 0, runway: 0, static: 0,
  };

  for (const [tool, keywords] of Object.entries(TOOL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) scores[tool as VideoTool]++;
    }
  }

  const winner = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  return {
    tool: winner[0] as VideoTool,
    confidence: Math.min(winner[1] / 5, 1),
    reason: `Matched ${winner[1]} keywords for ${winner[0]}`,
  };
}

// ── LLM-based classifier using Claude ─────────────────────────────────────────

const CLASSIFIER_PROMPT = `You are a video tool router for an educational platform.

Analyze the lesson content and return a JSON object selecting the best video generation tool.

TOOLS:
- "xpilot": Formulas, calculations, data charts, process diagrams, technical accuracy
  USE FOR: CVP analysis, break-even, variance, accounting cycles, funnels, frameworks
- "heygen": Instructor-led explanations, personal connection, talking-head style
  USE FOR: Course intros, concept explanations, motivation, soft skills
- "runway": Creative visuals, brand aesthetics, cinematic moments, visual storytelling
  USE FOR: Marketing examples, brand case studies, visual demonstrations
- "static": Simple text/image content that doesn't need animation
  USE FOR: Definitions, simple lists, reading material

DECISION RULES:
1. Content has formulas, calculations, or precise numbers → xpilot
2. Subject is accounting/finance/statistics → xpilot
3. Content benefits from a human explaining → heygen
4. Content is about branding, aesthetics, emotional impact → runway
5. Simple reference material → static

Return ONLY valid JSON:
{ "tool": "xpilot"|"heygen"|"runway"|"static", "confidence": 0.0-1.0, "reason": "brief" }`;

export async function classifyWithLLM(
  lessonContent: string,
  subject: string,
  apiKey: string
): Promise<ContentAnalysis> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 200,
        system: CLASSIFIER_PROMPT,
        messages: [
          {
            role: "user",
            content: `Subject: ${subject}\n\nLesson content:\n${lessonContent.slice(0, 2000)}`,
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data?.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON in classifier response");
    return JSON.parse(match[0]);
  } catch {
    // Fall back to keyword classifier if the LLM call fails
    return classifyByKeywords(lessonContent);
  }
}

// ── Main router ──────────────────────────────────────────────────────────────

export async function routeToVideoTool(
  lessonContent: string,
  subject: string,
  options?: { useLLM?: boolean; anthropicApiKey?: string }
): Promise<{
  tool: VideoTool;
  apiEndpoint: string;
  estimatedCost: string;
  reason: string;
}> {
  const analysis =
    options?.useLLM && options.anthropicApiKey
      ? await classifyWithLLM(lessonContent, subject, options.anthropicApiKey)
      : classifyByKeywords(lessonContent);

  const endpoints: Record<VideoTool, string> = {
    xpilot: "https://api.x-pilot.ai/v1/generate",
    heygen: "https://api.heygen.com/v2/video/generate",
    runway: "https://api.runwayml.com/v1/image_to_video",
    static: "internal://static-generator",
  };

  const costs: Record<VideoTool, string> = {
    xpilot: "$0.03/min (free tier: 3 min/mo)",
    heygen: "$0.10/min",
    runway: "$0.05/sec (~$3/min)",
    static: "Free",
  };

  return {
    tool: analysis.tool,
    apiEndpoint: endpoints[analysis.tool],
    estimatedCost: costs[analysis.tool],
    reason: analysis.reason,
  };
}
