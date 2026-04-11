/**
 * X-Pilot integration — generates educational videos with animated
 * knowledge visualizations from lesson text.
 *
 * Best suited for accounting / finance / statistics / formulas where
 * precision and animated data-viz matter.
 */

export interface XPilotConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface GenerateVideoRequest {
  title: string;
  content: string;
  subject?: string;
  voiceId?: string;
  language?: string;
  style?: "professional" | "casual" | "academic";
  outputFormat?: "1080p" | "4k";
  includeSubtitles?: boolean;
}

export interface VideoStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}

export class XPilotClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: XPilotConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.x-pilot.ai/v1";
  }

  async generateFromText(request: GenerateVideoRequest): Promise<{ jobId: string }> {
    const response = await fetch(`${this.baseUrl}/videos/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: request.title,
        script: request.content,
        settings: {
          voice: request.voiceId || "en-US-professional-male",
          language: request.language || "en",
          style: request.style || "professional",
          resolution: request.outputFormat || "1080p",
          subtitles: request.includeSubtitles ?? true,
          visualMode: "knowledge-visualization",
          motionBoxStyle: "modern-clean",
        },
        metadata: { subject: request.subject, source: "cohortiq" },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`X-Pilot API error: ${err.message || response.statusText}`);
    }
    const data = await response.json();
    return { jobId: data.job_id };
  }

  async getStatus(jobId: string): Promise<VideoStatus> {
    const response = await fetch(`${this.baseUrl}/videos/${jobId}/status`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`Failed to get X-Pilot status for ${jobId}`);
    const data = await response.json();
    return {
      id: jobId,
      status: data.status,
      progress: data.progress || 0,
      videoUrl: data.video_url,
      thumbnailUrl: data.thumbnail_url,
      duration: data.duration_seconds,
      error: data.error_message,
    };
  }

  async waitForCompletion(
    jobId: string,
    options?: {
      pollInterval?: number;
      timeout?: number;
      onProgress?: (progress: number) => void;
    }
  ): Promise<VideoStatus> {
    const pollInterval = options?.pollInterval || 5000;
    const timeout = options?.timeout || 600000; // 10 min
    const startTime = Date.now();

    while (true) {
      const status = await this.getStatus(jobId);
      options?.onProgress?.(status.progress);
      if (status.status === "completed") return status;
      if (status.status === "failed") {
        throw new Error(`X-Pilot generation failed: ${status.error}`);
      }
      if (Date.now() - startTime > timeout) {
        throw new Error("X-Pilot generation timed out");
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }
  }
}

export async function generateXPilotVideo(
  lesson: { title: string; content: string; subject: string },
  apiKey: string,
  onProgress?: (progress: number) => void
): Promise<{ videoUrl: string; thumbnailUrl?: string; duration?: number }> {
  const client = new XPilotClient({ apiKey });
  const { jobId } = await client.generateFromText({
    title: lesson.title,
    content: lesson.content,
    subject: lesson.subject,
    style: "academic",
    includeSubtitles: true,
  });
  const result = await client.waitForCompletion(jobId, { onProgress });
  return {
    videoUrl: result.videoUrl!,
    thumbnailUrl: result.thumbnailUrl,
    duration: result.duration,
  };
}
