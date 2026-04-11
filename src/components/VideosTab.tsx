"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { t, type Lang } from "@/lib/i18n";
import ThumbsRating from "@/components/ThumbsRating";

// ── Types ───────────────────────────────────────────────────────────────────

interface Video {
  id: string;
  title: string;
  description: string | null;
  url: string;
  sourceType: string;
  fileName: string | null;
  fileSize: number | null;
  lang: string;
  slidesData?: string | null;
  createdAt: string;
}

interface SlideData {
  title: string;
  points: string[];
  narration: string;
  icon?: string;
  formulas?: string[];
  duration?: number;
}

interface Props {
  courseId: string;
  color: string;
  name: string;
  lang?: Lang;
}

type GenPhase = "idle" | "slides" | "video" | "done";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
  return null;
}

function getYtThumb(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return yt ? `https://img.youtube.com/vi/${yt[1]}/mqdefault.jpg` : null;
}

function getVideoType(url: string, sourceType: string) {
  if (sourceType === "slidedeck") return "slidedeck";
  if (sourceType === "xpilot") return "xpilot";
  if (sourceType === "heygen") return "heygen";
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/vimeo\.com/.test(url)) return "vimeo";
  if (sourceType === "tutorial") return "tutorial";
  if (sourceType === "presentation") return "presentation";
  if (sourceType === "narration") return "narration";
  if (url.startsWith("/uploads/") || url.startsWith("/api/uploads/")) return "file";
  return "external";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function folderLabel(date: Date): string {
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

function folderKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isExternal(v: Video): boolean {
  return v.sourceType === "url";
}

// ── Folder structure ─────────────────────────────────────────────────────────

interface Folder {
  key: string;
  label: string;
  icon: string;
  videos: Video[];
}

// Language folder metadata for non-English videos
const LANG_FOLDERS: Record<string, { label: string; nativeLabel: string; flag: string }> = {
  en: { label: "English",   nativeLabel: "English",  flag: "🇺🇸" },
  ja: { label: "Japanese",  nativeLabel: "日本語",   flag: "🇯🇵" },
  es: { label: "Spanish",   nativeLabel: "Español",  flag: "🇪🇸" },
  fr: { label: "French",    nativeLabel: "Français", flag: "🇫🇷" },
  zh: { label: "Chinese",   nativeLabel: "中文",     flag: "🇨🇳" },
};

function buildFolders(videos: Video[], lang: Lang = "en"): Folder[] {
  const folders: Folder[] = [];

  // ── All Videos (always first) ──
  folders.push({ key: "__all__", label: t("vid.all", lang), icon: "🎬", videos });

  // ── Tutorial folder (pinned second) ──
  const tutorials = videos.filter((v) => v.sourceType === "tutorial");
  if (tutorials.length) {
    folders.push({ key: "__tutorial__", label: t("vid.tutorial", lang), icon: "🎓", videos: tutorials });
  }

  // ── Language folders (all AI-generated videos, grouped by language) ──
  const byLang = new Map<string, Video[]>();
  for (const v of videos) {
    const vLang = v.lang || "en";
    if (!isExternal(v) && v.sourceType !== "tutorial" && LANG_FOLDERS[vLang]) {
      if (!byLang.has(vLang)) byLang.set(vLang, []);
      byLang.get(vLang)!.push(v);
    }
  }
  // English first, then other languages alphabetically
  const langKeys = Array.from(byLang.keys()).sort((a, b) => {
    if (a === "en") return -1;
    if (b === "en") return 1;
    return a.localeCompare(b);
  });
  for (const lk of langKeys) {
    const meta = LANG_FOLDERS[lk];
    folders.push({
      key: `__lang__${lk}`,
      label: meta.nativeLabel,
      icon: meta.flag,
      videos: byLang.get(lk)!,
    });
  }

  // ── External links ──
  const external = videos.filter(isExternal);
  if (external.length) {
    folders.push({ key: "__external__", label: t("vid.external", lang), icon: "🔗", videos: external });
  }

  return folders;
}

// ── VideoCard ────────────────────────────────────────────────────────────────

function VideoCard({
  video, color, isActive, onClick, lang = "en", courseId, onDelete,
}: {
  video: Video; color: string; isActive: boolean; onClick: () => void; lang?: Lang; courseId: string; onDelete?: () => void;
}) {
  const type = getVideoType(video.url, video.sourceType);
  const ytThumb = getYtThumb(video.url);
  const videoRef = useRef<HTMLVideoElement>(null);

  const typeLabel: Record<string, string> = {
    youtube: t("vid.type.youtube", lang),
    vimeo: t("vid.type.vimeo", lang),
    tutorial: t("vid.tutorial", lang),
    presentation: t("vid.type.presentation", lang),
    narration: t("vid.type.narration", lang),
    file: t("vid.type.file", lang),
    external: t("vid.type.external", lang),
    slidedeck: "SLIDE DECK",
    xpilot: "X-PILOT",
    heygen: "HEYGEN",
  };

  const typeEmoji: Record<string, string> = {
    youtube: "▶️", vimeo: "🎥", tutorial: "🎓", presentation: "🖥️", narration: "🎤", file: "📹", external: "🎬", slidedeck: "📘", xpilot: "🎞", heygen: "👤",
  };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="group text-left rounded-xl overflow-hidden border transition-all hover:scale-[1.01] hover:shadow-lg w-full cursor-pointer"
      style={{
        borderColor: isActive ? color : "var(--color-border)",
        background: isActive ? color + "10" : "var(--color-bg-card)",
        boxShadow: isActive ? `0 0 0 2px ${color}40` : undefined,
      }}
    >
      <div className="relative w-full overflow-hidden" style={{ height: 140, background: "var(--color-bg-raised)" }}>
        {ytThumb ? (
          <img src={ytThumb} alt={video.title} className="w-full h-full object-cover" />
        ) : (type === "file" || type === "presentation") && video.url.endsWith(".mp4") ? (
          <video
            ref={videoRef} src={video.url} className="w-full h-full object-cover"
            muted preload="metadata"
            onMouseEnter={() => videoRef.current?.play()}
            onMouseLeave={() => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; } }}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-4xl">
            {typeEmoji[type] || "🎬"}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shadow-lg"
            style={{ background: color, color: "#fff" }}>▶</div>
        </div>
        <span className="absolute top-2 left-2 text-[13px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: color + "CC", color: "#fff" }}>
          {typeLabel[type] || type}
        </span>
        {/* Language badge — shown for non-English videos */}
        {video.lang && video.lang !== "en" && LANG_FOLDERS[video.lang] && (
          <span className="absolute top-2 right-2 text-sm leading-none"
            title={LANG_FOLDERS[video.lang].label}>
            {LANG_FOLDERS[video.lang].flag}
          </span>
        )}

        {/* Delete button — top-right overlay, only for non-external videos */}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete video"
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] transition-all hover:bg-red-500 hover:text-white z-10 opacity-0 group-hover:opacity-40 hover:!opacity-100"
            style={{ background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.7)" }}
          >
            🗑
          </button>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold leading-tight line-clamp-2 mb-1" style={{ color: "var(--color-text)" }}>
          {video.title.replace(/^(Presentation|Narration): ?/, "")}
        </p>
        {video.description && (
          <p className="text-[13px] text-muted leading-relaxed line-clamp-1 mb-1">{video.description}</p>
        )}
        <div className="flex items-center justify-between mt-1">
          {video.fileSize ? (
            <span className="text-[13px] text-muted">{formatBytes(video.fileSize)}</span>
          ) : <span />}
          <span className="text-[13px] text-muted">{new Date(video.createdAt).toLocaleDateString()}</span>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <ThumbsRating
            courseId={courseId}
            contentType="video"
            contentId={video.id}
            contentTitle={video.title}
            color={color}
          />
        </div>
      </div>
    </div>
  );
}

// ── Annotated Video Player ───────────────────────────────────────────────────

function AnnotatedVideoPlayer({
  video, color, onClose, courseId, lang = "en",
}: {
  video: Video; color: string; onClose: () => void; courseId: string; lang?: Lang;
}) {
  const T = (key: string) => t(key, lang);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [askSlide, setAskSlide] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  // Parse slides data
  const slides: SlideData[] = video.slidesData ? JSON.parse(video.slidesData) : [];

  // Compute cumulative start times from per-slide durations
  const startTimes = slides.reduce<number[]>((acc, s, i) => {
    if (i === 0) return [0];
    return [...acc, acc[i - 1] + (slides[i - 1].duration ?? 30)];
  }, [0]);

  // Track current slide via timeupdate
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !slides.length) return;
    const onTime = () => {
      const ct = vid.currentTime;
      for (let i = startTimes.length - 1; i >= 0; i--) {
        if (ct >= startTimes[i]) { setActiveSlide(i); break; }
      }
    };
    vid.addEventListener("timeupdate", onTime);
    return () => vid.removeEventListener("timeupdate", onTime);
  }, [startTimes]);

  const seekTo = (i: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTimes[i] ?? 0;
      videoRef.current.play();
    }
  };

  const askAboutSlide = async (i: number) => {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer("");
    try {
      const res = await fetch("/api/ai/annotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          question: question.trim(),
          slideContext: { title: slides[i].title, points: slides[i].points, narration: slides[i].narration, formulas: slides[i].formulas },
        }),
      });
      const data = await res.json();
      setAnswer(data.answer || data.error || "No answer received.");
    } catch {
      setAnswer("Failed to get answer. Please try again.");
    }
    setAsking(false);
  };

  const totalDuration = startTimes.length > 0 && slides.length > 0
    ? startTimes[startTimes.length - 1] + (slides[slides.length - 1].duration ?? 30)
    : 1;

  return (
    <div className="rounded-2xl overflow-hidden border mb-5" style={{ borderColor: color + "30", background: "var(--color-bg-card)" }}>
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-sm font-bold truncate" style={{ color: "var(--color-text)" }}>
            {video.title.replace(/^(Presentation|Narration): ?/, "")}
          </h2>
          {video.description && <p className="text-[13px] text-muted mt-0.5 line-clamp-1">{video.description}</p>}
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <a href={video.url} download={video.fileName || true}
            className="inline-flex items-center gap-1 text-[12px] rounded-lg px-2.5 py-1.5 font-semibold border transition-all"
            style={{ borderColor: color + "40", color, background: color + "10" }}>
            {T("vid.download")}
          </a>
          <button onClick={onClose}
            className="text-muted hover:text-muted-light text-xs px-2 py-1.5 rounded-lg transition-all"
            style={{ background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            ✕ {T("common.close")}
          </button>
        </div>
      </div>

      {/* Main: video + slide panel */}
      <div className="flex" style={{ minHeight: 320 }}>
        {/* Left: video + timeline */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div style={{ aspectRatio: "16/9", maxHeight: 360, background: "#000" }}>
            <video ref={videoRef} src={video.url} controls autoPlay className="w-full h-full" style={{ display: "block" }} />
          </div>
          {/* Slide timeline */}
          <div className="px-3 py-2 border-t" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[13px] text-muted mb-1.5">{T("vid.slides_panel")} — {T("vid.click_to_seek")}</p>
            <div className="flex gap-0.5 w-full">
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => seekTo(i)}
                  title={`${i + 1}. ${s.title}`}
                  className="flex-1 h-7 rounded transition-all flex items-center justify-center"
                  style={{
                    background: i === activeSlide ? color : "var(--color-bg-raised)",
                    border: `1px solid ${i === activeSlide ? color : "var(--color-border)"}`,
                    opacity: i === activeSlide ? 1 : 0.65,
                    minWidth: 0,
                  }}
                >
                  <span className="text-[8px] font-bold leading-none"
                    style={{ color: i === activeSlide ? "#fff" : "var(--color-muted)" }}>
                    {i + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: slide panel */}
        <div className="w-64 shrink-0 border-l overflow-y-auto" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
          <p className="px-3 pt-3 pb-2 text-[12px] font-bold uppercase tracking-widest" style={{ color }}>
            {T("vid.slides_panel")} ({slides.length})
          </p>
          {slides.map((s, i) => (
            <div key={i}>
              <button
                onClick={() => seekTo(i)}
                className="w-full text-left px-3 py-2.5 transition-all border-l-2"
                style={{
                  background: i === activeSlide ? color + "12" : "transparent",
                  borderLeftColor: i === activeSlide ? color : "transparent",
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[13px] font-bold px-1 py-0.5 rounded"
                    style={{ background: color + "20", color }}>{i + 1}</span>
                  <p className="text-[13px] font-semibold leading-tight line-clamp-2" style={{ color: "var(--color-text)" }}>
                    {s.title}
                  </p>
                </div>
                <div className="space-y-0.5 ml-5">
                  {s.points.slice(0, 2).map((p, pi) => (
                    <p key={pi} className="text-[13px] text-muted leading-tight">• {p}</p>
                  ))}
                  {s.points.length > 2 && (
                    <p className="text-[13px] text-muted opacity-50">+{s.points.length - 2} more</p>
                  )}
                </div>
              </button>
              {/* Ask about this slide */}
              <div className="px-3 pb-2">
                {askSlide === i ? (
                  <div className="mt-1">
                    <div className="flex gap-1">
                      <input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder={T("vid.ask_ph")}
                        className="flex-1 bg-bg-card border border-border-light rounded px-2 py-1 text-[12px] outline-none"
                        style={{ color: "var(--color-text)" }}
                        onKeyDown={(e) => e.key === "Enter" && askAboutSlide(i)}
                      />
                      <button
                        onClick={() => askAboutSlide(i)}
                        disabled={asking || !question.trim()}
                        className="px-2 py-1 rounded text-[13px] font-bold text-white disabled:opacity-40"
                        style={{ background: color }}>
                        {asking ? "…" : "Ask"}
                      </button>
                    </div>
                    {asking && <p className="text-[13px] text-muted mt-1 animate-pulse">{T("vid.asking")}</p>}
                    {answer && (
                      <div className="mt-2 bg-bg-card border border-border rounded-lg px-2.5 py-2 text-[12px] leading-relaxed max-h-40 overflow-y-auto"
                        style={{ color: "var(--color-text)" }}>
                        {answer}
                      </div>
                    )}
                    <button onClick={() => { setAskSlide(null); setQuestion(""); setAnswer(""); }}
                      className="text-[13px] text-muted mt-1 hover:text-muted-light">✕ Close</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAskSlide(i); setQuestion(""); setAnswer(""); }}
                    className="text-[13px] font-semibold px-2.5 py-1 rounded-lg border transition-all hover:opacity-80 w-full"
                    style={{ color, borderColor: color + "50", background: color + "12" }}>
                    💬 {T("vid.ask_slide")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Inline player ─────────────────────────────────────────────────────────────

function VideoPlayer({
  video, color, onClose, lang = "en",
}: {
  video: Video; color: string; onClose: () => void; lang?: Lang;
}) {
  const embedUrl = getEmbedUrl(video.url);
  const type = getVideoType(video.url, video.sourceType);
  const isDirectVideo = (type === "file" || type === "presentation" || type === "narration") && video.url.startsWith("/");

  return (
    <div className="rounded-2xl overflow-hidden border mb-5" style={{ borderColor: color + "30", background: "var(--color-bg-card)" }}>
      <div className="flex items-start justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-sm font-bold truncate" style={{ color: "var(--color-text)" }}>
            {video.title.replace(/^(Presentation|Narration): ?/, "")}
          </h2>
          {video.description && (
            <p className="text-[13px] text-muted mt-0.5 line-clamp-1">{video.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          {isDirectVideo && (
            <a href={video.url} download={video.fileName || true}
              className="inline-flex items-center gap-1 text-[12px] rounded-lg px-2.5 py-1.5 font-semibold border transition-all"
              style={{ borderColor: color + "40", color, background: color + "10" }}>
              {t("vid.download", lang)}
            </a>
          )}
          <button onClick={onClose}
            className="text-muted hover:text-muted-light text-xs px-2 py-1.5 rounded-lg transition-all"
            style={{ background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            ✕ {t("common.close", lang)}
          </button>
        </div>
      </div>
      <div style={{ aspectRatio: "16/9", maxHeight: 380, background: "#000" }}>
        {embedUrl ? (
          <iframe src={embedUrl} className="w-full h-full" style={{ display: "block" }}
            allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
        ) : isDirectVideo ? (
          <video src={video.url} controls autoPlay className="w-full h-full" style={{ display: "block" }} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <a href={video.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm rounded-lg px-5 py-3 font-semibold"
              style={{ background: color, color: "#fff" }}>
              🔗 Open Video
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VideosTab({ courseId, color, name, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);

  // ── Library state ──
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [activeFolder, setActiveFolder] = useState("__all__");
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);

  // ── Generation state ──
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(10);
  const [phase, setPhase] = useState<GenPhase>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [genVideo, setGenVideo] = useState<Video | null>(null);

  // ── Rich HTML slide deck generation ──
  const [deckBusy, setDeckBusy] = useState(false);
  const [deckError, setDeckError] = useState("");
  const [deckNumSlides, setDeckNumSlides] = useState(25);

  // ── Rich narrated video (internal: rich SVG slides + onyx TTS + FFmpeg) ──
  const [richBusy, setRichBusy] = useState(false);
  const [richError, setRichError] = useState("");
  const [richNumSlides, setRichNumSlides] = useState(12);
  const [richStatus, setRichStatus] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const libraryRef = useRef<HTMLDivElement>(null);

  const estSlidesSec = Math.max(20, duration * 3);
  const estVideoSec = Math.max(40, duration * 12);

  // ── Load library ──
  const loadVideos = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/videos`);
      const data = await res.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch {}
    setLoadingVideos(false);
  }, [courseId]);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  // ── Timer ──
  useEffect(() => {
    if (phase !== "idle" && phase !== "done") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phase === "idle") setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Progress ──
  useEffect(() => {
    if (phase === "slides") {
      setProgress(Math.min(28, (elapsed / estSlidesSec) * 28));
    } else if (phase === "video") {
      const ve = elapsed - estSlidesSec;
      setProgress(28 + Math.min(70, (ve / estVideoSec) * 70));
    } else if (phase === "done") {
      setProgress(100);
    }
  }, [elapsed, phase, estSlidesSec, estVideoSec]);

  const timeRemaining = () => {
    if (phase === "slides") {
      const rem = Math.max(0, estSlidesSec - elapsed);
      return rem > 0 ? `~${formatTime(rem)} remaining` : "Almost done…";
    }
    if (phase === "video") {
      const rem = Math.max(0, estVideoSec - (elapsed - estSlidesSec));
      return rem > 0 ? `~${formatTime(rem)} remaining` : "Finishing up…";
    }
    return "";
  };

  const abort = () => {
    abortRef.current?.abort();
    setPhase("idle");
    setStatusMsg(""); setErrorMsg(""); setProgress(0); setElapsed(0); setSlides([]);
  };

  const resetGen = () => {
    setPhase("idle"); setTopic(""); setSlides([]); setGenVideo(null);
    setStatusMsg(""); setErrorMsg(""); setProgress(0); setElapsed(0);
  };

  const deleteVideo = async (videoId: string) => {
    if (!confirm("Delete this video? This cannot be undone.")) return;
    await fetch(`/api/courses/${courseId}/videos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
    if (activeVideo?.id === videoId) setActiveVideo(null);
    if (genVideo?.id === videoId) resetGen();
    loadVideos();
  };

  // Generate a rich HTML slide deck (not a video) — produces an interactive
  // color-coded deck using Claude, saved as a sourceType="slidedeck" Video.
  const generateSlideDeck = async () => {
    if (!topic.trim() || deckBusy) return;
    setDeckBusy(true);
    setDeckError("");
    try {
      const res = await fetch("/api/ai/slidedeck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          topic: topic.trim(),
          numSlides: deckNumSlides,
          lang,
        }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        throw new Error(
          res.status === 503 ? "Server temporarily unavailable. Try again in a minute." :
          res.status >= 500 ? `Server error (${res.status})` :
          text.slice(0, 200)
        );
      }
      if (!res.ok) throw new Error(data.error || "Slide deck generation failed");

      // Open the HTML viewer in a new tab
      window.open(data.viewUrl, "_blank", "noopener,noreferrer");

      // Refresh library so the new deck appears
      await loadVideos();
      setTopic("");
    } catch (e: any) {
      setDeckError(e.message || "Failed to generate slide deck");
    }
    setDeckBusy(false);
  };

  // Open a slide deck in a new tab (used when clicking a slidedeck card)
  const openSlideDeck = (videoId: string) => {
    window.open(`/api/slidedeck/${videoId}`, "_blank", "noopener,noreferrer");
  };

  // Generate a rich narrated video using internal pipeline:
  //   Claude → rich SVG slides → resvg-js PNG → OpenAI "onyx" TTS → FFmpeg MP4
  const generateRichVideo = async () => {
    if (!topic.trim() || richBusy) return;
    setRichBusy(true);
    setRichError("");
    setRichStatus("Writing rich slides with Claude...");
    try {
      const res = await fetch("/api/ai/rich-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          topic: topic.trim(),
          numSlides: richNumSlides,
          lang,
        }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        throw new Error(
          res.status === 503 ? "Server temporarily unavailable. Try again in a minute." :
          res.status >= 500 ? `Server error (${res.status})` :
          text.slice(0, 200)
        );
      }
      if (!res.ok) throw new Error(data.error || "Rich video generation failed");

      // Refresh library and focus the new video
      await loadVideos();
      if (data.video) {
        setActiveVideo(data.video);
        setTopic("");
      }
    } catch (e: any) {
      setRichError(e.message || "Failed to generate rich video");
    }
    setRichBusy(false);
    setRichStatus("");
  };

  const generate = async () => {
    if (!topic.trim()) return;
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setPhase("slides");
    setStatusMsg(T("vid.writing"));
    setErrorMsg(""); setProgress(0); setElapsed(0); setSlides([]); setGenVideo(null);
    setActiveVideo(null);

    // Helper — robustly extract an error message even if the response isn't JSON
    const extractError = async (res: Response, fallback: string) => {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        return j.error || fallback;
      } catch {
        // Non-JSON response (e.g. Railway "Service Unavailable", HTML error page)
        if (res.status === 503) return "Server temporarily unavailable — Railway may still be deploying. Try again in 1–2 minutes.";
        if (res.status === 504) return "Request timed out — generation took too long. Try a shorter duration or fewer slides.";
        if (res.status === 502) return "Bad gateway — the server is restarting. Try again shortly.";
        if (res.status >= 500) return `Server error (${res.status}). Please try again in a moment.`;
        return text.slice(0, 200) || fallback;
      }
    };

    try {
      // Phase 1 — Generate structured slides
      const slidesRes = await fetch("/api/ai/narration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, topic: topic.trim(), duration, lang }),
        signal,
      });
      if (!slidesRes.ok) throw new Error(await extractError(slidesRes, "Slide generation failed"));
      const slidesData = await slidesRes.json();
      setSlides(slidesData.slides);

      // Phase 2 — Render video
      setPhase("video");
      setStatusMsg(T("vid.rendering").replace("{count}", String(slidesData.slides.length)));

      const videoRes = await fetch("/api/ai/narration/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slidesData.slides, topic: topic.trim(),
          courseId, duration, accentColor: color, courseName: name, lang,
        }),
        signal,
      });
      if (!videoRes.ok) throw new Error(await extractError(videoRes, "Video generation failed"));
      const videoData = await videoRes.json();

      setGenVideo(videoData.video);
      setPhase("done");
      setStatusMsg(T("vid.ready"));
      await loadVideos();
      setActiveFolder(`__lang__${lang}`);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setPhase("idle");
      setStatusMsg("");
      setErrorMsg(e.message || "Something went wrong. Please try again.");
    }
  };

  const generating = phase === "slides" || phase === "video";

  // ── Folder/library helpers ──
  const folders = buildFolders(videos, lang);
  const currentFolder = folders.find((f) => f.key === activeFolder) || folders[0];
  const folderVideos = currentFolder?.videos ?? [];

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── Left sidebar: folder nav ── */}
      <div className="w-52 shrink-0 flex flex-col border-r overflow-y-auto"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>

        {/* Generate button */}
        <div className="px-3 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <button
            onClick={resetGen}
            className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-bg transition-all"
            style={{ background: color }}
          >
            {T("vid.new_pres")}
          </button>
        </div>

        {/* Folders */}
        <p className="px-4 pt-4 pb-2 text-[12px] font-bold uppercase tracking-widest" style={{ color }}>
          {T("vid.folders")}
        </p>

        {loadingVideos ? (
          <p className="px-4 text-[12px] text-muted py-2">{T("common.loading")}</p>
        ) : folders.map((folder) => {
          const isActive = folder.key === activeFolder;
          return (
            <button key={folder.key}
              onClick={() => { setActiveFolder(folder.key); setActiveVideo(null); }}
              className="flex items-center gap-2.5 px-4 py-2.5 text-left w-full transition-all"
              style={{
                background: isActive ? color + "15" : "transparent",
                borderLeft: isActive ? `3px solid ${color}` : "3px solid transparent",
              }}>
              <span className="text-base leading-none">{folder.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: isActive ? color : "var(--color-muted-light)" }}>
                  {folder.label}
                </p>
                {folder.key !== "__all__" && (
                  <p className="text-[12px] text-muted mt-0.5">
                    {folder.videos.length} video{folder.videos.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              {folder.key !== "__all__" && (
                <span className="text-[13px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0"
                  style={{ background: isActive ? color + "30" : "var(--color-border)", color: isActive ? color : "var(--color-muted)" }}>
                  {folder.videos.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Progress bar — only visible while generating */}
        {generating && (
          <div className="px-5 py-3 border-b shrink-0 bg-bg-card" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="relative w-4 h-4 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-border-light" />
                <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: `${color} transparent transparent transparent` }} />
              </div>
              <p className="text-xs font-semibold" style={{ color }}>{statusMsg}</p>
              <span className="text-[12px] text-muted ml-auto">{timeRemaining()}</span>
              <button onClick={abort}
                className="rounded px-2.5 py-1 text-[12px] font-semibold text-[#EF5350] bg-[#EF5350]/10 border border-[#EF5350]/30 hover:bg-[#EF5350]/20 transition-all ml-2">
                {T("vid.abort")}
              </button>
            </div>
            <div className="h-1 bg-bg-raised rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: color }} />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[13px] text-muted">
                {phase === "slides" ? T("vid.phase1") : T("vid.phase2")}
              </span>
              <span className="text-[13px] text-muted">{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ GENERATION SECTION ══ */}
          <div className="px-5 pt-5 pb-0">

            {/* Error */}
            {errorMsg && (
              <div className="max-w-2xl mb-4 bg-[#EF5350]/10 border border-[#EF5350]/30 rounded-xl px-4 py-3">
                <p className="text-xs text-[#EF5350] font-semibold">Error: {errorMsg}</p>
                <button onClick={() => setErrorMsg("")} className="text-[12px] text-[#EF5350]/70 mt-1 hover:text-[#EF5350]">Dismiss</button>
              </div>
            )}

            {/* Idle — generation form */}
            {phase === "idle" && !genVideo && (
              <div className="max-w-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🎬</span>
                  <div>
                    <p className="font-serif text-base font-bold text-muted-light">{T("vid.gen_title")}</p>
                    <p className="text-[13px] text-muted mt-0.5">
                      {T("vid.gen_subtitle")}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap items-end">
                  <div className="flex-1 min-w-[240px]">
                    <label className="text-[12px] text-muted uppercase tracking-wider block mb-1.5">{T("vid.topic")}</label>
                    <textarea
                      value={topic} onChange={(e) => setTopic(e.target.value)}
                      placeholder={T("vid.topic_ph")}
                      rows={2}
                      className="w-full bg-bg-card border border-border-light rounded-xl px-3 py-2.5 text-sm outline-none transition-all resize-none leading-relaxed"
                      style={{ color: "var(--color-text)" }}
                    />
                  </div>

                  <div>
                    <label className="text-[12px] text-muted uppercase tracking-wider block mb-1.5">{T("vid.duration")}</label>
                    <div className="flex gap-1 flex-wrap">
                      {[5, 10, 15, 20, 25, 30].map((n) => (
                        <button key={n} onClick={() => setDuration(n)}
                          className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: duration === n ? color : "var(--color-bg-raised)",
                            color: duration === n ? "#fff" : "var(--color-muted)",
                            border: `1px solid ${duration === n ? color : "var(--color-border)"}`,
                          }}>
                          {n}m
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={generate} disabled={!topic.trim()}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 shrink-0"
                    style={{ background: color, color: "#fff" }}>
                    {T("vid.generate")}
                  </button>
                </div>

                {/* ── Rich HTML Slide Deck generator ── */}
                <div className="mt-5 pt-5 border-t" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">📘</span>
                    <div className="flex-1">
                      <p className="font-serif text-base font-bold" style={{ color: "var(--color-text)" }}>
                        Generate Rich Slide Deck
                      </p>
                      <p className="text-[13px] text-muted mt-0.5">
                        Interactive HTML deck with color-coded sections, grids, formulas, and tables — reads the topic above.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 flex-wrap items-end">
                    <div>
                      <label className="text-[12px] text-muted uppercase tracking-wider block mb-1.5">Slides</label>
                      <div className="flex gap-1 flex-wrap">
                        {[15, 20, 25, 30, 35].map((n) => (
                          <button key={n} onClick={() => setDeckNumSlides(n)} disabled={deckBusy}
                            className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                            style={{
                              background: deckNumSlides === n ? color : "var(--color-bg-raised)",
                              color: deckNumSlides === n ? "#fff" : "var(--color-muted)",
                              border: `1px solid ${deckNumSlides === n ? color : "var(--color-border)"}`,
                            }}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={generateSlideDeck}
                      disabled={!topic.trim() || deckBusy}
                      className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 shrink-0 flex items-center gap-2"
                      style={{
                        background: deckBusy ? "var(--color-bg-raised)" : color,
                        color: deckBusy ? "var(--color-muted)" : "#fff",
                        border: deckBusy ? `1px solid var(--color-border)` : "none",
                      }}>
                      {deckBusy ? (
                        <>
                          <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${color} transparent transparent transparent` }} />
                          Writing deck…
                        </>
                      ) : (
                        <>📘 Generate Deck</>
                      )}
                    </button>
                  </div>
                  {deckError && (
                    <div className="mt-3 bg-[#EF5350]/10 border border-[#EF5350]/30 rounded-xl px-4 py-2.5">
                      <p className="text-xs text-[#EF5350] font-semibold">Error: {deckError}</p>
                      <button onClick={() => setDeckError("")} className="text-[12px] text-[#EF5350]/70 mt-1 hover:text-[#EF5350]">Dismiss</button>
                    </div>
                  )}
                </div>

                {/* ── Rich narrated video (internal pipeline: rich SVG + onyx TTS + FFmpeg) ── */}
                <div className="mt-5 pt-5 border-t" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">🎞</span>
                    <div className="flex-1">
                      <p className="font-serif text-base font-bold" style={{ color: "var(--color-text)" }}>
                        Generate Rich Narrated Video
                      </p>
                      <p className="text-[13px] text-muted mt-0.5">
                        Same color-coded grids, quotes, formulas, and tables as the HTML deck — rendered as an MP4 with OpenAI "onyx" narration. Takes 3–6 min. No extra API keys needed.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 flex-wrap items-end">
                    <div>
                      <label className="text-[12px] text-muted uppercase tracking-wider block mb-1.5">Slides</label>
                      <div className="flex gap-1 flex-wrap">
                        {[8, 10, 12, 15, 18].map((n) => (
                          <button key={n} onClick={() => setRichNumSlides(n)} disabled={richBusy}
                            className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                            style={{
                              background: richNumSlides === n ? color : "var(--color-bg-raised)",
                              color: richNumSlides === n ? "#fff" : "var(--color-muted)",
                              border: `1px solid ${richNumSlides === n ? color : "var(--color-border)"}`,
                            }}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={generateRichVideo}
                      disabled={!topic.trim() || richBusy}
                      className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 shrink-0 flex items-center gap-2"
                      style={{
                        background: richBusy ? "var(--color-bg-raised)" : color,
                        color: richBusy ? "var(--color-muted)" : "#fff",
                        border: richBusy ? `1px solid var(--color-border)` : "none",
                      }}
                    >
                      {richBusy ? (
                        <>
                          <span
                            className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                            style={{ borderColor: `${color} transparent transparent transparent` }}
                          />
                          Rendering…
                        </>
                      ) : (
                        <>🎞 Generate Rich Video</>
                      )}
                    </button>
                  </div>
                  {richStatus && !richError && (
                    <p className="text-[12px] text-muted mt-2 italic">{richStatus}</p>
                  )}
                  {richError && (
                    <div className="mt-3 bg-[#EF5350]/10 border border-[#EF5350]/30 rounded-xl px-4 py-2.5">
                      <p className="text-xs text-[#EF5350] font-semibold">Error: {richError}</p>
                      <button onClick={() => setRichError("")} className="text-[12px] text-[#EF5350]/70 mt-1 hover:text-[#EF5350]">Dismiss</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generating — slide preview */}
            {slides.length > 0 && generating && (
              <div className="max-w-2xl">
                <p className="text-[12px] text-muted uppercase tracking-wider mb-3">
                  {slides.length} Slides — {phase === "slides" ? T("vid.creating") : T("vid.rend_short")}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {slides.map((s, i) => (
                    <div key={i} className="bg-bg-card border border-border rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[12px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: color + "20", color }}>{i + 1}</span>
                        <p className="text-[13px] font-semibold leading-tight line-clamp-2" style={{ color: "var(--color-text)" }}>{s.title}</p>
                      </div>
                      <div className="space-y-0.5">
                        {s.points.slice(0, 3).map((p, pi) => (
                          <p key={pi} className="text-[12px] text-muted leading-tight">• {p}</p>
                        ))}
                        {s.points.length > 3 && (
                          <p className="text-[12px] text-muted opacity-60">+{s.points.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Done — completed video player */}
            {phase === "done" && genVideo && (
              <div className={genVideo.slidesData ? "max-w-5xl" : "max-w-2xl"}>
                {genVideo.slidesData ? (
                  <AnnotatedVideoPlayer
                    video={genVideo} color={color} courseId={courseId}
                    onClose={resetGen} lang={lang}
                  />
                ) : (
                  <VideoPlayer
                    video={genVideo} color={color}
                    onClose={resetGen} lang={lang}
                  />
                )}
                {slides.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[12px] text-muted uppercase tracking-wider mb-2">{T("vid.slide_outline")}</p>
                    <div className="bg-bg-card border border-border rounded-xl px-4 py-3 max-h-44 overflow-y-auto">
                      {slides.map((s, i) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <p className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{i + 1}. {s.title}</p>
                          <p className="text-[12px] text-muted mt-0.5 ml-3 leading-relaxed">
                            {s.points.join(" · ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={resetGen} className="text-xs text-muted hover:text-muted-light transition-all mb-5">
                  {T("vid.new_pres_link")}
                </button>
              </div>
            )}
          </div>

          {/* ══ LIBRARY SECTION ══ */}
          <div ref={libraryRef} className="px-5 pt-5 pb-6">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-base">{currentFolder?.icon ?? "🎬"}</span>
              <h2 className="font-serif text-sm font-bold" style={{ color }}>
                {currentFolder?.label ?? T("vid.all")}
              </h2>
              {!loadingVideos && (
                <span className="text-[13px] text-muted">
                  {folderVideos.length} video{folderVideos.length !== 1 ? "s" : ""}
                </span>
              )}
              {currentFolder?.key === "__external__" && (
                <span className="ml-auto text-[12px] text-muted italic">{T("vid.external_sub")}</span>
              )}
            </div>

            {/* Active library video player */}
            {activeVideo && (
              activeVideo.slidesData ? (
                <AnnotatedVideoPlayer
                  video={activeVideo} color={color} courseId={courseId}
                  onClose={() => setActiveVideo(null)} lang={lang}
                />
              ) : (
                <VideoPlayer
                  video={activeVideo} color={color}
                  onClose={() => setActiveVideo(null)} lang={lang}
                />
              )
            )}

            {loadingVideos ? (
              <p className="text-muted text-sm py-8 text-center">{T("common.loading")}</p>
            ) : !videos.length ? (
              <div className="flex flex-col items-center py-12 text-muted gap-3">
                <span className="text-3xl">🎬</span>
                <p className="font-serif text-base text-muted-light">{T("vid.empty")}</p>
                <p className="text-xs max-w-sm text-center leading-relaxed">{T("vid.empty_desc")}</p>
              </div>
            ) : folderVideos.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted gap-3">
                <span className="text-2xl">📭</span>
                <p className="text-sm">{T("vid.no_folder")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {folderVideos.map((v) => (
                  <VideoCard
                    key={v.id} video={v} color={color}
                    isActive={activeVideo?.id === v.id}
                    onClick={() => {
                      if (v.sourceType === "slidedeck") {
                        openSlideDeck(v.id);
                      } else {
                        setActiveVideo(activeVideo?.id === v.id ? null : v);
                      }
                    }}
                    lang={lang}
                    courseId={courseId}
                    onDelete={!isExternal(v) ? () => deleteVideo(v.id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
