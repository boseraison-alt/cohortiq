"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { t, type Lang } from "@/lib/i18n";

interface Props {
  courseId: string;
  color: string;
  name: string;
  lang?: Lang;
}

interface VideoRecord {
  id: string;
  title: string;
  description: string | null;
  url: string;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  sourceType: string;
}

interface SlideData {
  title: string;
  points: string[];
  narration: string;
}

type Phase = "idle" | "slides" | "video" | "done";

function formatBytes(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export default function NarrationTab({ courseId, color, name, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(10);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentVideo, setCurrentVideo] = useState<VideoRecord | null>(null);
  const [history, setHistory] = useState<VideoRecord[]>([]);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const estSlidesSec = Math.max(20, duration * 3);
  const estVideoSec = Math.max(40, duration * 12);
  const estTotalSec = estSlidesSec + estVideoSec;

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/videos`);
      const data = await res.json();
      setHistory(
        (Array.isArray(data) ? data : []).filter(
          (v: any) => v.sourceType === "presentation" || v.sourceType === "narration"
        )
      );
    } catch {}
  }, [courseId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Timer
  useEffect(() => {
    if (phase !== "idle" && phase !== "done") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phase === "idle") setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Progress
  useEffect(() => {
    if (phase === "slides") {
      setProgress(Math.min(28, (elapsed / estSlidesSec) * 28));
    } else if (phase === "video") {
      const videoElapsed = elapsed - estSlidesSec;
      setProgress(28 + Math.min(70, (videoElapsed / estVideoSec) * 70));
    } else if (phase === "done") {
      setProgress(100);
    }
  }, [elapsed, phase, estSlidesSec, estVideoSec]);

  const timeRemaining = () => {
    if (phase === "slides") {
      const rem = Math.max(0, estSlidesSec - elapsed);
      return rem > 0 ? `~${formatTime(rem)} remaining` : "Almost done...";
    }
    if (phase === "video") {
      const videoElapsed = elapsed - estSlidesSec;
      const rem = Math.max(0, estVideoSec - videoElapsed);
      return rem > 0 ? `~${formatTime(rem)} remaining` : "Finishing up...";
    }
    return "";
  };

  const abort = () => {
    abortRef.current?.abort();
    setPhase("idle");
    setStatusMsg("");
    setErrorMsg("");
    setProgress(0);
    setElapsed(0);
    setSlides([]);
  };

  const generate = async () => {
    if (!topic.trim()) return;
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setPhase("slides");
    setStatusMsg("Writing presentation slides...");
    setErrorMsg("");
    setProgress(0);
    setElapsed(0);
    setSlides([]);
    setCurrentVideo(null);

    try {
      // Phase 1 — Generate structured slides
      const slidesRes = await fetch("/api/ai/narration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          topic: topic.trim(),
          duration,
        }),
        signal,
      });
      if (!slidesRes.ok) throw new Error((await slidesRes.json()).error || "Slide generation failed");
      const slidesData = await slidesRes.json();
      setSlides(slidesData.slides);

      // Phase 2 — Render video (images + audio + FFmpeg → MP4)
      setPhase("video");
      setStatusMsg(`Rendering ${slidesData.slides.length}-slide video with narration...`);

      const videoRes = await fetch("/api/ai/narration/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slidesData.slides,
          topic: topic.trim(),
          courseId,
          duration,
          accentColor: color,
          courseName: name,
        }),
        signal,
      });
      if (!videoRes.ok) throw new Error((await videoRes.json()).error || "Video generation failed");
      const videoData = await videoRes.json();

      setCurrentVideo(videoData.video);
      setPhase("done");
      setStatusMsg("Video ready!");
      loadHistory();
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setPhase("idle");
      setStatusMsg("");
      setErrorMsg(e.message || "Something went wrong. Please try again.");
    }
  };

  const generating = phase === "slides" || phase === "video";

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left sidebar — history */}
      <div className="w-56 border-r border-border flex flex-col bg-[#0B0D10] shrink-0">
        <div className="px-3 py-3 border-b border-border">
          <button
            onClick={() => { setPhase("idle"); setSlides([]); setCurrentVideo(null); setTopic(""); setErrorMsg(""); }}
            className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-bg"
            style={{ background: color }}
          >
            + New Presentation
          </button>
        </div>
        <div
          className="px-3 py-2 border-b border-border flex items-center gap-1 cursor-pointer"
          onClick={() => setHistoryCollapsed((v) => !v)}
        >
          <span className="text-[9px] text-muted">{historyCollapsed ? "\u25B6" : "\u25BC"}</span>
          <span className="text-[10px] text-muted uppercase tracking-wider">Previous</span>
          <span className="text-[10px] text-muted ml-auto">{history.length}</span>
        </div>
        {!historyCollapsed && (
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {!history.length && <p className="text-[10px] text-muted text-center py-4">No videos yet</p>}
            {history.map((v) => (
              <div
                key={v.id}
                onClick={() => { setCurrentVideo(v); setPhase("idle"); setSlides([]); }}
                className={`px-3 py-2.5 rounded-lg mb-1 cursor-pointer transition-all ${
                  currentVideo?.id === v.id
                    ? "bg-bg-raised border border-border-light"
                    : "hover:bg-bg-raised/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">{v.sourceType === "presentation" ? "🎬" : "🎤"}</span>
                  <p className="text-xs font-medium text-[#E4DED4] truncate leading-tight flex-1">
                    {v.title.replace(/^(Presentation|Narration): ?/, "")}
                  </p>
                </div>
                <p className="text-[10px] text-muted mt-0.5">
                  {v.fileSize ? formatBytes(v.fileSize) : ""} {"\u00B7"} {new Date(v.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
          <div className="flex-1" />
          {generating && (
            <button onClick={abort}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-[#EF5350] bg-[#EF5350]/15 border border-[#EF5350]/30 hover:bg-[#EF5350]/25 transition-all">
              ✕ Abort
            </button>
          )}
        </div>

        {/* Progress bar */}
        {generating && (
          <div className="px-5 py-3 border-b border-border bg-[#0D0F14]">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative w-5 h-5 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-border-light" />
                <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: `${color} transparent transparent transparent` }} />
              </div>
              <p className="text-xs font-semibold" style={{ color }}>{statusMsg}</p>
              <span className="text-[10px] text-muted ml-auto">{timeRemaining()}</span>
            </div>
            <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: color }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-muted">
                {phase === "slides" ? "Phase 1: Generating slides" : "Phase 2: Rendering video + audio"}
              </span>
              <span className="text-[9px] text-muted">{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* Content area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">

          {/* Error message */}
          {errorMsg && phase === "idle" && (
            <div className="max-w-xl mx-auto mb-5 bg-[#EF5350]/10 border border-[#EF5350]/30 rounded-xl px-4 py-3">
              <p className="text-xs text-[#EF5350] font-semibold">Error: {errorMsg}</p>
              <button onClick={() => setErrorMsg("")} className="text-[10px] text-[#EF5350]/70 mt-1 hover:text-[#EF5350]">Dismiss</button>
            </div>
          )}

          {/* Empty state — input form */}
          {phase === "idle" && !currentVideo && (
            <div className="max-w-xl mx-auto">
              <div className="text-center mb-8">
                <div className="text-4xl mb-3">🎬</div>
                <p className="font-serif text-lg text-muted-light">AI Video Presentation</p>
                <p className="text-xs text-muted mt-2 leading-relaxed max-w-sm mx-auto">
                  Enter a topic and duration. CohortIQ will create a narrated slide presentation (MP4 video) with visual slides and professional voiceover, saved to your Videos folder.
                </p>
              </div>

              <div className="mb-5">
                <label className="text-[10px] text-muted uppercase tracking-wider block mb-2">Topic</label>
                <textarea
                  value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder={`e.g. "Cost-Volume-Profit Analysis" or "Marketing Strategy Frameworks"`}
                  rows={3}
                  className="w-full bg-bg-card border border-border-light rounded-xl px-4 py-3 text-sm text-[#E4DED4] outline-none focus:border-[#555B66] transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="mb-6">
                <label className="text-[10px] text-muted uppercase tracking-wider block mb-2">Duration</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[5, 10, 15, 20, 25, 30].map((n) => (
                    <button key={n} onClick={() => setDuration(n)}
                      className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{ background: duration === n ? color : "#1A1D24", color: duration === n ? "#0B0D10" : "#555B66",
                        border: `1px solid ${duration === n ? color : "#1A1D24"}` }}>
                      {n} min
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={generate} disabled={!topic.trim()}
                className="w-full rounded-xl py-3 text-sm font-semibold text-bg transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: color }}>
                🎬 Generate Video Presentation
              </button>

              <p className="mt-3 text-[10px] text-muted text-center">
                Claude + OpenAI TTS + FFmpeg {"\u00B7"} auto-saved to Videos folder
              </p>
            </div>
          )}

          {/* Slide preview while generating video */}
          {slides.length > 0 && generating && (
            <div className="max-w-2xl mx-auto">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-3">
                {slides.length} Slides — {phase === "slides" ? "Creating..." : "Rendering video..."}
              </p>
              <div className="space-y-2">
                {slides.map((s, i) => (
                  <div key={i} className="bg-bg-card border border-border rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: color + "20", color }}>{i + 1}</span>
                      <p className="text-sm font-semibold text-[#E4DED4]">{s.title}</p>
                    </div>
                    <div className="mt-2 ml-7 space-y-0.5">
                      {s.points.map((p, pi) => (
                        <p key={pi} className="text-[11px] text-muted">• {p}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Done state — video player */}
          {(phase === "done" || (phase === "idle" && currentVideo)) && currentVideo && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">{currentVideo.sourceType === "presentation" ? "🎬" : "🎤"}</div>
                <p className="font-serif text-lg text-muted-light">
                  {currentVideo.title.replace(/^(Presentation|Narration): ?/, "")}
                </p>
                {currentVideo.description && (
                  <p className="text-xs text-muted mt-1">{currentVideo.description}</p>
                )}
              </div>

              {/* Player */}
              <div className="bg-bg-card border border-border rounded-xl overflow-hidden mb-4">
                {currentVideo.sourceType === "presentation" ? (
                  <video controls src={currentVideo.url} className="w-full" style={{ maxHeight: 500 }} />
                ) : (
                  <div className="p-5">
                    <audio controls src={currentVideo.url} className="w-full" style={{ accentColor: color }} />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 justify-center flex-wrap">
                <a href={currentVideo.url} download={currentVideo.fileName || true}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold border transition-all hover:opacity-90"
                  style={{ borderColor: color + "40", color, background: color + "12" }}>
                  ⬇ Download {currentVideo.sourceType === "presentation" ? "MP4" : "MP3"}
                  {currentVideo.fileSize && (
                    <span className="text-[10px] opacity-70">{formatBytes(currentVideo.fileSize)}</span>
                  )}
                </a>
                <button
                  onClick={() => { setCurrentVideo(null); setPhase("idle"); setSlides([]); setTopic(""); }}
                  className="text-xs text-muted hover:text-muted-light transition-all">
                  + New presentation
                </button>
              </div>

              {/* Slides outline */}
              {phase === "done" && slides.length > 0 && (
                <div className="mt-6">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Slide Outline</p>
                  <div className="bg-bg-card border border-border rounded-xl px-5 py-4 max-h-60 overflow-y-auto">
                    {slides.map((s, i) => (
                      <div key={i} className="mb-3 last:mb-0">
                        <p className="text-xs font-semibold text-[#E4DED4]">{i + 1}. {s.title}</p>
                        <p className="text-[10px] text-muted mt-0.5 ml-4">
                          {s.points.join(" • ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
