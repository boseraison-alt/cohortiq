/**
 * HeyGen integration — generates instructor-led videos with AI avatars.
 *
 * Best suited for course intros, concept explanations, motivation /
 * soft-skills lessons where a human presenter adds value.
 */

export interface HeyGenConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface GenerateAvatarVideoRequest {
  title: string;
  script: string;
  avatarId: string;
  voiceId: string;
  backgroundUrl?: string;
  backgroundColor?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "720p" | "1080p" | "4k";
}

export interface VideoResult {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}

export const HEYGEN_DEFAULTS = {
  avatars: {
    professional_male: "Ethan_Casual_Sitting_public",
    professional_female: "Angela_Casual_Sitting_public",
    friendly_male: "Tyler_Casual_public",
    friendly_female: "Lily_Casual_public",
  },
  voices: {
    en_male: "en-US-ChristopherNeural",
    en_female: "en-US-JennyNeural",
    en_uk_male: "en-GB-RyanNeural",
    en_uk_female: "en-GB-SoniaNeural",
  },
} as const;

export class HeyGenClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: HeyGenConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.heygen.com/v2";
  }

  async generateVideo(request: GenerateAvatarVideoRequest): Promise<{ videoId: string }> {
    const payload = {
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: request.avatarId,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: request.script,
            voice_id: request.voiceId,
            speed: 1.0,
          },
          background: request.backgroundUrl
            ? { type: "image", url: request.backgroundUrl }
            : { type: "color", value: request.backgroundColor || "#1a1a2e" },
        },
      ],
      dimension: {
        width: request.aspectRatio === "9:16" ? 720 : 1920,
        height: request.aspectRatio === "9:16" ? 1280 : 1080,
      },
      title: request.title,
    };

    const response = await fetch(`${this.baseUrl}/video/generate`, {
      method: "POST",
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`HeyGen API error: ${err.message || response.statusText}`);
    }
    const data = await response.json();
    return { videoId: data.data.video_id };
  }

  async getVideoStatus(videoId: string): Promise<VideoResult> {
    const response = await fetch(
      `${this.baseUrl}/video_status.get?video_id=${videoId}`,
      { headers: { "X-Api-Key": this.apiKey } }
    );
    if (!response.ok) throw new Error(`Failed to get HeyGen status for ${videoId}`);
    const data = await response.json();
    return {
      id: videoId,
      status: data.data.status,
      videoUrl: data.data.video_url,
      thumbnailUrl: data.data.thumbnail_url,
      duration: data.data.duration,
      error: data.data.error,
    };
  }

  async waitForCompletion(
    videoId: string,
    options?: {
      pollInterval?: number;
      timeout?: number;
      onProgress?: (status: string) => void;
    }
  ): Promise<VideoResult> {
    const pollInterval = options?.pollInterval || 10000;
    const timeout = options?.timeout || 900000; // 15 min — HeyGen is slow
    const startTime = Date.now();

    while (true) {
      const status = await this.getVideoStatus(videoId);
      options?.onProgress?.(status.status);
      if (status.status === "completed") return status;
      if (status.status === "failed") {
        throw new Error(`HeyGen generation failed: ${status.error}`);
      }
      if (Date.now() - startTime > timeout) {
        throw new Error("HeyGen generation timed out");
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }
  }
}

/**
 * Convert raw lesson content into a natural spoken script for an avatar.
 */
export function formatScriptForAvatar(
  lessonContent: string,
  options?: { addIntro?: boolean; addOutro?: boolean; lessonTitle?: string }
): string {
  let script = "";

  if (options?.addIntro) {
    script += "Hi there! Welcome back to CohortIQ. ";
    if (options.lessonTitle) {
      script += `Today, we're going to learn about ${options.lessonTitle}. `;
    }
    script += "Let's dive in!\n\n";
  }

  script += lessonContent
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/^[-•]\s/gm, "Next, ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (options?.addOutro) {
    script += `\n\nAnd that covers ${options?.lessonTitle || "this topic"}. `;
    script += "Great job making it through! If you have questions, drop them in the chat. ";
    script += "See you in the next lesson!";
  }

  return script;
}

export async function generateHeyGenVideo(
  lesson: { title: string; content: string; subject: string },
  apiKey: string,
  options?: {
    instructor?: keyof typeof HEYGEN_DEFAULTS.avatars;
    voice?: keyof typeof HEYGEN_DEFAULTS.voices;
    onProgress?: (status: string) => void;
  }
): Promise<{ videoUrl: string; thumbnailUrl?: string; duration?: number }> {
  const client = new HeyGenClient({ apiKey });
  const script = formatScriptForAvatar(lesson.content, {
    addIntro: true,
    addOutro: true,
    lessonTitle: lesson.title,
  });
  const { videoId } = await client.generateVideo({
    title: lesson.title,
    script,
    avatarId: HEYGEN_DEFAULTS.avatars[options?.instructor || "professional_female"],
    voiceId: HEYGEN_DEFAULTS.voices[options?.voice || "en_female"],
    backgroundColor: "#1a1a2e",
    aspectRatio: "16:9",
    resolution: "1080p",
  });
  const result = await client.waitForCompletion(videoId, {
    onProgress: options?.onProgress,
  });
  return {
    videoUrl: result.videoUrl!,
    thumbnailUrl: result.thumbnailUrl,
    duration: result.duration,
  };
}
