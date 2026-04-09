"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { t, type Lang } from "@/lib/i18n";
import ThumbsRating from "@/components/ThumbsRating";

interface Props {
  courseId: string;
  color: string;
  name: string;
  autoGenerate?: boolean;
  customContext?: string;
  lang?: Lang;
}

interface PodLine { host: string; text: string; }
interface AudioSegment { audio: string; host: string; lineIndices: number[]; }

export default function PodcastTab({ courseId, color, name, autoGenerate, customContext, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);
  const [duration, setDuration] = useState(10);
  const [style, setStyle] = useState<"conversation" | "lecture">("conversation");
  const [topic, setTopic] = useState("");
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [script, setScript] = useState<PodLine[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState<"idle" | "script" | "audio">("idle");
  const [progress, setProgress] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Audio state
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentLine, setCurrentLine] = useState(-1);
  const [currentSegIdx, setCurrentSegIdx] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playElapsed, setPlayElapsed] = useState(0); // seconds elapsed while playing
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);
  const currentSegIdxRef = useRef(-1);
  const playbackRateRef = useRef(1);
  const playElapsedRef = useRef(0);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Abort
  const abortRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);

  // Timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [saved, setSaved] = useState<any[]>([]);
  const [activePodcastId, setActivePodcastId] = useState<string | null>(null);
  const [savedAudioUrl, setSavedAudioUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/podcasts`).then((r) => r.json()).then(setSaved).catch(() => {});
    fetch(`/api/courses/${courseId}/topics`).then((r) => r.json()).then((d) => setAvailableTopics(d.topics || [])).catch(() => {});
  }, [courseId]);

  // Auto-generate when triggered from chat
  const hasAutoTriggered = useRef(false);
  useEffect(() => {
    if (autoGenerate && !hasAutoTriggered.current && !generating) {
      hasAutoTriggered.current = true;
      generatePodcast();
    }
  }, [autoGenerate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentLine >= 0 && scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-line="${currentLine}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLine]);

  // Estimated times (rough): script ~15s per 5min segment, audio ~20s per 5min segment
  const segments = Math.ceil(duration / 5);
  const estimatedScriptSec = segments * 15;
  const estimatedAudioSec = segments * 20;
  const estimatedTotalSec = estimatedScriptSec + estimatedAudioSec;

  const startTimer = useCallback(() => {
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { stopTimer(); stopPlayTimer(); };
  }, [stopTimer]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
  };

  // Combined generate: script → auto audio
  const generatePodcast = async (overrides?: { duration?: number; style?: string; topic?: string }) => {
    const useDuration = overrides?.duration ?? duration;
    const useStyle = overrides?.style ?? style;
    const useTopic = overrides?.topic ?? topic.trim();

    const controller = new AbortController();
    abortRef.current = controller;
    abortedRef.current = false;

    setGenerating(true);
    setScript(null);
    setAudioSegments([]);
    setPhase("script");
    setProgress("Writing podcast script with Claude…");
    startTimer();

    let generatedScript: PodLine[] | null = null;

    try {
      // Phase 1: Generate script
      const res = await fetch("/api/ai/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          duration: useDuration,
          style: useStyle,
          topic: useTopic || undefined,
          customContext: customContext || undefined,
          lang,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      generatedScript = data.script;
      setScript(data.script);
      setSaved((p) => [{ id: data.id, duration: useDuration, topic: useTopic || null, audioUrl: null, createdAt: new Date().toISOString(), script: data.script }, ...p]);

      if (abortedRef.current) throw new DOMException("Aborted", "AbortError");

      // Phase 2: Generate audio automatically
      setPhase("audio");
      setProgress("Generating audio with OpenAI TTS…");

      const audioRes = await fetch("/api/ai/podcast/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: data.script, podcastId: data.id }),
        signal: controller.signal,
      });
      const audioData = await audioRes.json();
      if (audioData.error) throw new Error(audioData.error);

      setAudioSegments(audioData.segments);
      setSavedAudioUrl(null);
      // Update saved entry with audioUrl once available
      if (audioData.audioUrl) {
        setSaved((p) => p.map((pod) => pod.id === data.id ? { ...pod, audioUrl: audioData.audioUrl } : pod));
      }
      setProgress("");
      setPhase("idle");
    } catch (e: any) {
      if (e.name === "AbortError") {
        setProgress("Generation cancelled.");
        // Keep the script if we already got it
        if (!generatedScript) setScript(null);
        setTimeout(() => setProgress(""), 2000);
      } else {
        alert("Error: " + e.message);
        setProgress("");
      }
      setPhase("idle");
    }

    stopTimer();
    setGenerating(false);
    abortRef.current = null;
  };

  const abortGeneration = () => {
    abortedRef.current = true;
    abortRef.current?.abort();
  };

  // Regenerate audio only (for saved scripts)
  const regenerateAudio = async () => {
    if (!script?.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    abortedRef.current = false;

    setGenerating(true);
    setPhase("audio");
    setProgress("Generating audio with OpenAI TTS…");
    startTimer();

    try {
      const res = await fetch("/api/ai/podcast/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, style }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAudioSegments(data.segments);
      setProgress("");
    } catch (e: any) {
      if (e.name === "AbortError") {
        setProgress("Audio generation cancelled.");
        setTimeout(() => setProgress(""), 2000);
      } else {
        alert("Error generating audio: " + e.message);
        setProgress("");
      }
    }

    stopTimer();
    setPhase("idle");
    setGenerating(false);
    abortRef.current = null;
  };

  // ── Playback elapsed timer ───────────────────────────────────────────────
  const startPlayTimer = () => {
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    playTimerRef.current = setInterval(() => {
      playElapsedRef.current += playbackRateRef.current;
      setPlayElapsed(playElapsedRef.current);
    }, 1000);
  };
  const stopPlayTimer = () => {
    if (playTimerRef.current) { clearInterval(playTimerRef.current); playTimerRef.current = null; }
  };

  // Play audio segments sequentially
  const playAudio = (fromIdx = 0) => {
    if (!audioSegments.length) return;
    playingRef.current = true;
    setPlaying(true);
    setPaused(false);
    if (fromIdx === 0) { playElapsedRef.current = 0; setPlayElapsed(0); }
    startPlayTimer();
    playSegment(fromIdx);
  };

  const playSegment = (idx: number) => {
    if (idx >= audioSegments.length || !playingRef.current) {
      stopPlayTimer();
      setPlaying(false);
      setCurrentLine(-1);
      setCurrentSegIdx(-1);
      currentSegIdxRef.current = -1;
      playingRef.current = false;
      return;
    }

    const seg = audioSegments[idx];
    if (!seg.audio) { playSegment(idx + 1); return; }

    currentSegIdxRef.current = idx;
    setCurrentSegIdx(idx);
    setCurrentLine(seg.lineIndices[0]);

    const audio = new Audio(`data:audio/mp3;base64,${seg.audio}`);
    audio.playbackRate = playbackRateRef.current;
    audioRef.current = audio;
    audio.onended = () => playSegment(idx + 1);
    audio.onerror = () => playSegment(idx + 1);
    audio.play().catch(() => playSegment(idx + 1));
  };

  const stopAudio = () => {
    stopPlayTimer();
    playingRef.current = false;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setPaused(false);
    setCurrentLine(-1);
    setCurrentSegIdx(-1);
    currentSegIdxRef.current = -1;
    playElapsedRef.current = 0;
    setPlayElapsed(0);
  };

  const togglePause = () => {
    if (!audioRef.current) return;
    if (paused) {
      audioRef.current.play();
      setPaused(false);
      startPlayTimer();
    } else {
      audioRef.current.pause();
      setPaused(true);
      stopPlayTimer();
    }
  };

  const skipForward = () => {
    const next = currentSegIdxRef.current + 1;
    if (next < audioSegments.length) {
      audioRef.current?.pause();
      audioRef.current = null;
      playSegment(next);
    }
  };

  const skipBack = () => {
    const prev = Math.max(0, currentSegIdxRef.current - 1);
    audioRef.current?.pause();
    audioRef.current = null;
    playSegment(prev);
  };

  const changeSpeed = (rate: number) => {
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const loadSaved = (pod: any) => {
    setScript(pod.script as PodLine[]);
    setAudioSegments([]);
    setActivePodcastId(pod.id);
    setSavedAudioUrl(pod.audioUrl || null);
    stopAudio();
  };

  const estimatedChars = script?.reduce((s, l) => s + l.text.length, 0) || 0;
  const estimatedCost = (estimatedChars / 1_000_000) * 15;

  // Progress percentage
  const getProgressPct = () => {
    if (!generating) return 0;
    if (phase === "script") return Math.min(95, (elapsed / estimatedScriptSec) * 50);
    if (phase === "audio") return 50 + Math.min(48, (elapsed / estimatedAudioSec) * 48);
    return 0;
  };

  const getTimeRemaining = () => {
    if (phase === "script") {
      const rem = Math.max(0, estimatedTotalSec - elapsed);
      return rem > 0 ? `~${formatTime(rem)} remaining` : "Almost done…";
    }
    if (phase === "audio") {
      const audioElapsed = elapsed - estimatedScriptSec;
      const rem = Math.max(0, estimatedAudioSec - audioElapsed);
      return rem > 0 ? `~${formatTime(rem)} remaining` : "Almost done…";
    }
    return "";
  };

  const progressPct = getProgressPct();

  return (
    <div className="h-full flex flex-col">
      {/* Generation progress bar — full width, shown while generating */}
      {generating && (
        <div className="px-5 py-3 border-b border-border bg-bg-card shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative w-5 h-5 shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-border-light" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: color }} />
            </div>
            <span className="text-xs font-medium" style={{ color }}>
              {phase === "script" ? T("pod.step1") : T("pod.step2")}
            </span>
            <span className="text-[12px] text-muted">{formatTime(elapsed)} {T("pod.elapsed")}</span>
            <button onClick={abortGeneration}
              className="ml-auto rounded-lg px-4 py-1.5 text-xs font-semibold text-[#EF5350] bg-[#EF5350]/15 border border-[#EF5350]/30 hover:bg-[#EF5350]/25 transition-all">
              {T("pod.abort")}
            </button>
          </div>
          <div className="w-full bg-bg-raised rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${color}, ${color}AA)` }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[12px] text-muted">{progress}</span>
            <span className="text-[12px] text-muted">{getTimeRemaining()}</span>
          </div>
        </div>
      )}

      {/* Audio controls bar — after generation complete */}
      {script && !generating && (
        <div className="border-b border-border bg-bg-card shrink-0">
          {/* Saved podcast full-width audio player */}
          {savedAudioUrl && !audioSegments.length ? (
            <div className="px-5 py-3">
              <audio
                key={savedAudioUrl}
                src={savedAudioUrl}
                controls
                className="w-full"
                style={{ height: 40 }}
              />
            </div>
          ) : !audioSegments.length ? (
            <div className="px-5 py-2.5 flex items-center gap-3">
              <button onClick={regenerateAudio}
                className="rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1.5 text-white"
                style={{ background: "#10A37F" }}>
                {T("pod.gen_audio")}
              </button>
              <span className="text-[12px] text-muted ml-auto">
                {estimatedChars.toLocaleString()} chars · ~${estimatedCost.toFixed(2)}
              </span>
            </div>
          ) : (() => {
            // Estimate total duration: TTS ~14 chars/sec at 1x
            const totalSec = Math.round(estimatedChars / 14);
            const remainSec = Math.max(0, Math.round((totalSec - playElapsed) / playbackRate));
            const pct = totalSec > 0 ? Math.min(100, (playElapsed / totalSec) * 100) : 0;
            const fmtSec = (s: number) => {
              const m = Math.floor(s / 60); const sec = s % 60;
              return `${m}:${String(sec).padStart(2, "0")}`;
            };
            return (
              <div className="px-5 py-3">
                {/* ── Progress bar — always visible ── */}
                <div className="mb-3">
                  <div className="h-2.5 bg-bg-raised rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${pct}%`, background: "#10A37F" }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[13px] text-muted tabular-nums">{fmtSec(Math.round(playElapsed))}</span>
                    {playing && (
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: "#10A37F" }}>
                        -{fmtSec(remainSec)}
                      </span>
                    )}
                    <span className="text-[13px] text-muted tabular-nums">{fmtSec(totalSec)}</span>
                  </div>
                </div>

                {/* ── Transport controls ── */}
                <div className="flex items-center gap-2">
                  {/* Skip back */}
                  {playing && (
                    <button onClick={skipBack}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm bg-bg-raised border border-border-light text-muted-light shrink-0 hover:bg-bg-card transition-all"
                      title="Previous segment">
                      ⏮
                    </button>
                  )}

                  {/* Big play / pause button */}
                  {!playing ? (
                    <button onClick={() => playAudio(0)}
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white text-lg shrink-0 shadow-md hover:opacity-90 transition-all"
                      style={{ background: "#10A37F" }}>
                      ▶
                    </button>
                  ) : (
                    <button onClick={togglePause}
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white text-lg shrink-0 shadow-md hover:opacity-90 transition-all"
                      style={{ background: "#10A37F" }}>
                      {paused ? "▶" : "⏸"}
                    </button>
                  )}

                  {/* Skip forward */}
                  {playing && (
                    <button onClick={skipForward}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm bg-bg-raised border border-border-light text-muted-light shrink-0 hover:bg-bg-card transition-all"
                      title="Next segment">
                      ⏭
                    </button>
                  )}

                  {/* Stop */}
                  {playing && (
                    <button onClick={stopAudio}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm bg-bg-raised border border-border-light text-muted-light shrink-0 hover:bg-bg-card transition-all"
                      title="Stop">
                      ⏹
                    </button>
                  )}

                  {/* Speed selector */}
                  <div className="flex items-center gap-0.5 ml-2">
                    {[1, 1.25, 1.5, 2].map((r) => (
                      <button key={r} onClick={() => changeSpeed(r)}
                        className="px-2.5 py-1.5 rounded-lg text-[13px] font-bold transition-all"
                        style={{
                          background: playbackRate === r ? "#10A37F20" : "transparent",
                          color: playbackRate === r ? "#10A37F" : "var(--color-muted)",
                          border: `1px solid ${playbackRate === r ? "#10A37F40" : "transparent"}`,
                        }}>
                        {r}×
                      </button>
                    ))}
                  </div>

                  {/* Info — right side */}
                  <div className="ml-auto flex items-center gap-3 text-[13px] text-muted">
                    {playing && currentSegIdx >= 0 && (
                      <span className="tabular-nums">
                        {currentSegIdx + 1}/{audioSegments.length} segs
                      </span>
                    )}
                    <span>~{Math.round(totalSec / 60)}min · {T("pod.voices")}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Saved list */}
        {saved.length > 0 && (
          <div className="w-52 border-r border-border overflow-y-auto px-2 py-2 shrink-0">
            <p className="text-[12px] text-muted uppercase tracking-wider px-2 mb-2">{T("common.saved")}</p>
            {saved.map((p) => {
              const isActive = activePodcastId === p.id;
              return (
                <div key={p.id}
                  className="rounded-lg mb-1.5 border transition-all overflow-hidden"
                  style={{
                    borderColor: isActive ? color + "60" : "var(--color-border)",
                    background: isActive ? color + "08" : "var(--color-bg-card)",
                  }}>
                  <div onClick={() => loadSaved(p)}
                    className="px-3 py-2 cursor-pointer hover:bg-bg-raised/50 transition-all">
                    <p className="text-xs font-semibold truncate" style={{ color: isActive ? color : "var(--color-muted-light)" }}>
                      {p.topic || T("pod.entire_course")}
                    </p>
                    <p className="text-[12px] text-muted mt-0.5">
                      {p.duration} min · {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                    {p.audioUrl && (
                      <p className="text-[13px] mt-0.5" style={{ color: "#10A37F" }}>▶ audio saved</p>
                    )}
                  </div>
                  <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
                    <ThumbsRating
                      courseId={courseId}
                      contentType="podcast"
                      contentId={p.id}
                      contentTitle={p.topic || name}
                      color={color}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {!script && !generating && (
            <div className="text-center text-muted py-10">

              <div className="text-3xl mb-3">🎙</div>
              <p className="font-serif text-lg text-muted-light">{T("pod.title")}</p>
              <p className="text-xs mt-2 max-w-md mx-auto leading-relaxed">{T("pod.desc")}</p>

              {/* Topic selector */}
              <div className="mt-6 max-w-lg mx-auto text-left">
                <p className="text-xs text-muted mb-2 text-center uppercase tracking-wider">{T("pod.topic")}</p>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={generating}
                  placeholder={T("pod.topic_ph")}
                  className="w-full bg-bg-card border border-border-light rounded-xl px-4 py-3 text-sm outline-none transition-all text-center"
                  style={{ color: "var(--color-text)" }}
                />
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                  {/* "Entire Course" preset — always first */}
                  <button
                    onClick={() => setTopic("")}
                    disabled={generating}
                    className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all border flex items-center gap-1"
                    style={{
                      background: topic === "" ? color + "20" : "var(--color-bg)",
                      borderColor: topic === "" ? color : "var(--color-border)",
                      color: topic === "" ? color : "var(--color-muted)",
                    }}
                    title={T("pod.entire_course_tip")}
                  >
                    📚 {T("pod.entire_course")}
                  </button>
                  {availableTopics.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      disabled={generating}
                      className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all border"
                      style={{
                        background: topic === t ? color + "20" : "var(--color-bg)",
                        borderColor: topic === t ? color : "var(--color-border)",
                        color: topic === t ? color : "var(--color-muted)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {topic && (
                  <div className="mt-2 text-center">
                    <button onClick={() => setTopic("")} className="text-[12px] text-muted hover:text-muted-light">
                      {T("pod.clear_topic")}
                    </button>
                  </div>
                )}
              </div>

              {/* Style selector cards */}
              <div className="mt-6 flex gap-4 justify-center max-w-lg mx-auto">
                {/* Conversation card */}
                <button
                  onClick={() => setStyle("conversation")}
                  className="flex-1 text-left rounded-xl p-4 border-2 transition-all"
                  style={{
                    borderColor: style === "conversation" ? color : "var(--color-border)",
                    background: style === "conversation" ? color + "12" : "var(--color-bg-card)",
                  }}
                >
                  <p className="text-base mb-1">💬</p>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{T("pod.conversation")}</p>
                  <p className="text-[13px] text-muted mt-1 leading-relaxed">{T("pod.conv_desc")}</p>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color }}>PROF · Onyx</span>
                      <span className="text-[12px] text-muted">{T("pod.explains")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-[#6BA39E]">ALEX · Nova</span>
                      <span className="text-[12px] text-muted">{T("pod.asks")}</span>
                    </div>
                  </div>
                  {style === "conversation" && (
                    <p className="mt-3 text-[12px] font-semibold" style={{ color }}>{T("pod.selected")}</p>
                  )}
                </button>

                {/* Lecture card */}
                <button
                  onClick={() => setStyle("lecture")}
                  className="flex-1 text-left rounded-xl p-4 border-2 transition-all"
                  style={{
                    borderColor: style === "lecture" ? color : "var(--color-border)",
                    background: style === "lecture" ? color + "12" : "var(--color-bg-card)",
                  }}
                >
                  <p className="text-base mb-1">🎓</p>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{T("pod.lecture")}</p>
                  <p className="text-[13px] text-muted mt-1 leading-relaxed">{T("pod.lec_desc")}</p>
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color }}>PROF · Onyx</span>
                      <span className="text-[12px] text-muted">{T("pod.solo")}</span>
                    </div>
                  </div>
                  {style === "lecture" && (
                    <p className="mt-3 text-[12px] font-semibold" style={{ color }}>{T("pod.selected")}</p>
                  )}
                </button>
              </div>

              {/* Duration selector */}
              <div className="mt-5 flex items-center justify-center gap-3">
                <span className="text-xs text-muted">{T("pod.duration")}</span>
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {Array.from({ length: 12 }, (_, i) => (i + 1) * 5).map((n) => (
                    <button
                      key={n}
                      onClick={() => setDuration(n)}
                      disabled={generating}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: duration === n ? color : "var(--color-bg-raised)",
                        color: duration === n ? "#fff" : "var(--color-muted)",
                        border: `1px solid ${duration === n ? color : "var(--color-border)"}`,
                      }}
                    >
                      {n}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <div className="mt-6">
                <button
                  onClick={() => generatePodcast()}
                  className="rounded-xl px-8 py-3 text-sm font-semibold text-bg transition-all hover:opacity-90"
                  style={{ background: color }}
                >
                  {T("pod.generate")}
                </button>
              </div>

              {/* Pricing note */}
              <p className="mt-4 text-[12px] text-muted">
                OpenAI TTS ~$0.015 per 1K chars · 10 min ≈ $0.15 · 30 min ≈ $0.45
              </p>
            </div>
          )}

          {/* Show generating placeholder with animated dots */}
          {generating && !script && (
            <div className="text-center py-14">
              <div className="text-3xl mb-3 animate-pulse">🎙</div>
              <p className="font-serif text-lg text-muted-light">{T("pod.writing")}</p>
              <p className="text-xs text-muted mt-2">{T("pod.writing_desc")}</p>
            </div>
          )}

          {script?.map((line, i) => (
            <div key={i} data-line={i}
              className="flex gap-3 mb-2 px-3 py-2.5 rounded-lg transition-all"
              style={{
                background: currentLine === i ? color + "15" : "transparent",
                border: currentLine === i ? `1px solid ${color}30` : "1px solid transparent",
              }}>
              <span className="text-[12px] font-bold tracking-wider min-w-[38px] pt-0.5"
                style={{ color: line.host === "PROF" ? color : "#6BA39E" }}>
                {line.host}
              </span>
              <span className="text-sm leading-relaxed" style={{ color: "var(--color-muted-light)" }}>{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
