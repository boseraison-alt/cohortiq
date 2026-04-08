import { prisma } from "@/lib/db";

const EXAMPLE_LABELS: Record<string, string> = {
  maximize_examples: "Maximize real-world examples, case studies, and practical scenarios. Use analogies from the student's industry. Theory should be minimal — teach through stories and examples.",
  balanced: "Use a balanced mix of theory and practical examples. Include real-world scenarios where helpful, but also explain the underlying concepts clearly.",
  maximize_text: "Focus on deep theoretical explanations and academic rigor. Include examples only when essential to illustrate a complex point.",
};

const LEVEL_LABELS: Record<string, string> = {
  "5yo": "Explain like I'm 5 years old — use the simplest possible language, everyday analogies (lemonade stands, piggy banks), and short sentences. No jargon.",
  highschool: "Explain at a high-school level — clear and accessible language, relatable examples, define any technical terms when first used.",
  manager: "Explain at a business manager level — professional language, practical implications, focus on decision-making and business impact.",
  expert: "Explain at an expert level — strategic and concise for senior leaders, use precise terminology, cite frameworks by name, assume deep domain knowledge. Focus on high-level implications, ROI, and nuanced trade-offs. Skip basic definitions.",
  // legacy values kept for backward compatibility
  csuite: "Explain at a C-suite executive level — strategic and concise, focus on high-level business impact, ROI, and competitive advantage. Skip basic definitions.",
  phd: "Explain at an expert/PhD level — use precise academic terminology, cite frameworks by name, assume deep domain knowledge. Be rigorous and nuanced.",
};

/**
 * Build a preference prompt block for a given user.
 * Returns empty string if no preferences are set.
 */
export async function getUserPrefsPrompt(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { prefIndustry: true, prefExamples: true, prefLevel: true },
  });

  if (!user) return "";

  const parts: string[] = [];

  if (user.prefIndustry) {
    parts.push(`- Industry context: ${user.prefIndustry} — always use examples, terminology, and scenarios from the ${user.prefIndustry} industry. Even if the course materials use generic examples, translate them into ${user.prefIndustry}-specific equivalents.`);
  }

  if (user.prefExamples && EXAMPLE_LABELS[user.prefExamples]) {
    parts.push(`- Content style: ${EXAMPLE_LABELS[user.prefExamples]}`);
  }

  if (user.prefLevel && LEVEL_LABELS[user.prefLevel]) {
    parts.push(`- Explanation level: ${LEVEL_LABELS[user.prefLevel]}`);
  }

  if (parts.length === 0) return "";

  return `STUDENT PREFERENCES (apply these to ALL your responses):\n${parts.join("\n")}\n`;
}
