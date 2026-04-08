"use client";

import { useState, useEffect } from "react";

interface Task {
  id: string;
  type: "flashcards" | "practice" | "review" | "podcast" | "rest";
  topic: string | null;
  count?: number;
  durationMin: number;
  note: string;
}

interface DayPlan {
  day: number;
  theme: string;
  focus: string;
  urgency: "high" | "medium" | "low";
  tasks: Task[];
}

interface Plan {
  planTitle: string;
  summary: string;
  days: DayPlan[];
}

interface TopicStat {
  topic: string;
  accuracy: number;
  attempts: number;
}

interface Props {
  courseId: string;
  color: string;
  name: string;
  onNavigate?: (tab: string, topic?: string) => void;
}

const TASK_CONFIG = {
  flashcards: { icon: "🃏", label: "Flashcards", bg: "#7B6CF615", border: "#7B6CF640", text: "#7B6CF6" },
  practice:   { icon: "📝", label: "Practice",   bg: "#C9956B15", border: "#C9956B40", text: "#C9956B" },
  review:     { icon: "📖", label: "Review",      bg: "#10A37F15", border: "#10A37F40", text: "#10A37F" },
  podcast:    { icon: "🎙", label: "Podcast",     bg: "#3B82F615", border: "#3B82F640", text: "#3B82F6" },
  rest:       { icon: "😴", label: "Rest",        bg: "#6B728015", border: "#6B728040", text: "#6B7280" },
};

const URGENCY_COLOR = { high: "#EF5350", medium: "#FF9800", low: "#10A37F" };

function pluralize(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

export default function StudyPlanTab({ courseId, color, name, onNavigate }: Props) {
  const [days, setDays] = useState(7);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [topicStats, setTopicStats] = useState<TopicStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState(1);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  // Load completed tasks from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`study_plan_${courseId}`);
      if (stored) setCompleted(JSON.parse(stored));
    } catch {}
  }, [courseId]);

  const saveCompleted = (next: Record<string, boolean>) => {
    setCompleted(next);
    try { localStorage.setItem(`study_plan_${courseId}`, JSON.stringify(next)); } catch {}
  };

  const toggleTask = (taskId: string) => {
    saveCompleted({ ...completed, [taskId]: !completed[taskId] });
  };

  const generate = async () => {
    setLoading(true);
    setError("");
    setPlan(null);
    setCompleted({});
    try {
      const res = await fetch("/api/ai/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, days }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPlan(data.plan);
      setTopicStats(data.topicStats || []);
      setSelectedDay(1);
      try { localStorage.removeItem(`study_plan_${courseId}`); } catch {}
    } catch (e: any) {
      setError(e.message || "Failed to generate plan");
    }
    setLoading(false);
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const allTasks = plan?.days.flatMap((d) => d.tasks.map((t) => t.id)) || [];
  const completedCount = allTasks.filter((id) => completed[id]).length;
  const progressPct = allTasks.length > 0 ? Math.round((completedCount / allTasks.length) * 100) : 0;
  const currentDay = plan?.days.find((d) => d.day === selectedDay);
  const examDay = plan ? plan.days[plan.days.length - 1] : null;

  const totalMinutes = currentDay?.tasks.reduce((s, t) => s + t.durationMin, 0) || 0;

  // ── Entry screen ──────────────────────────────────────────────────────────────
  if (!plan && !loading) {
    const weakTopics = topicStats.filter((t) => t.accuracy < 70).slice(0, 3);

    return (
      <div className="h-full overflow-y-auto flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">

          {/* Hero */}
          <div className="text-center mb-10">
            <div className="text-5xl mb-4">⏰</div>
            <h1 className="font-serif text-2xl font-bold mb-2" style={{ color }}>
              Procrastinator Mode
            </h1>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--color-muted)" }}>
              No judgment. Just tell us when your exam is — CohortIQ builds a
              personalized day-by-day plan based on your practice history.
            </p>
            {/* Brad Lyons quote */}
            <div className="mx-auto max-w-sm px-5 py-4 rounded-2xl"
              style={{ background: "var(--color-bg-card)", border: `1px solid ${color}30` }}>
              <p className="font-serif text-sm italic leading-relaxed" style={{ color: "var(--color-muted-light)" }}>
                "If you don't know when things are due, how do you know how long to procrastinate?"
              </p>
              <p className="text-[11px] font-semibold mt-2" style={{ color }}>— Brad Lyons</p>
            </div>
          </div>

          {/* Days input */}
          <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--color-bg-card)", border: `1px solid ${color}30` }}>
            <p className="text-sm font-semibold text-center mb-5" style={{ color: "var(--color-muted-light)" }}>
              My exam is in
            </p>

            {/* Pill selector */}
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((n) => (
                <button
                  key={n}
                  onClick={() => setDays(n)}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: days === n ? color : "var(--color-bg-raised)",
                    color: days === n ? "#fff" : "var(--color-muted)",
                    border: `1px solid ${days === n ? color : "var(--color-border)"}`,
                  }}
                >
                  {n} {n === 1 ? "day" : "days"}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="flex items-center justify-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
              <span>or enter</span>
              <input
                type="number"
                min={1} max={90}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                className="w-16 text-center bg-bg-raised border border-border-light rounded-lg px-2 py-1 text-sm outline-none"
                style={{ color: "var(--color-text)" }}
              />
              <span>days</span>
            </div>

            {/* Urgency label */}
            <p className="text-center text-xs mt-3 font-semibold" style={{
              color: days <= 2 ? "#EF5350" : days <= 5 ? "#FF9800" : "#10A37F"
            }}>
              {days === 1 ? "🚨 One day — we can do this." :
               days <= 2 ? "🔥 Crunch time. Focused sprint." :
               days <= 5 ? "⚡ Short runway. Prioritize weak spots." :
               days <= 10 ? "📅 Good amount of time. Solid plan possible." :
               "🌱 Plenty of time. Deep learning approach."}
            </p>
          </div>

          {/* Weak topics preview */}
          {weakTopics.length > 0 && (
            <div className="rounded-xl px-4 py-3 mb-6" style={{ background: "#EF535010", border: "1px solid #EF535030" }}>
              <p className="text-[11px] font-bold text-[#EF5350] mb-2">⚠️ Your plan will prioritize these weak areas:</p>
              <div className="flex flex-wrap gap-1.5">
                {weakTopics.map((t) => (
                  <span key={t.topic} className="text-[11px] px-2 py-0.5 rounded-full bg-[#EF535015] text-[#EF5350] border border-[#EF535030]">
                    {t.topic} — {t.accuracy}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-[#EF5350] text-center mb-4">{error}</p>
          )}

          <button
            onClick={generate}
            className="w-full rounded-2xl py-4 text-base font-bold text-white transition-all hover:opacity-90 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}CC)` }}
          >
            Generate My Study Plan →
          </button>

          <p className="text-[10px] text-center mt-3" style={{ color: "var(--color-muted)" }}>
            Personalized using your {topicStats.length > 0 ? `${topicStats.length}-topic` : ""} practice history
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-2 border-border" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
            style={{ borderTopColor: color }} />
        </div>
        <p className="font-serif text-base" style={{ color: "var(--color-muted-light)" }}>
          Building your {days}-day battle plan…
        </p>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Analyzing practice history · Scheduling weak topics · Spacing repetition
        </p>
      </div>
    );
  }

  // ── Plan view ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header bar */}
      <div className="px-5 py-3 border-b shrink-0 flex items-center gap-4 flex-wrap"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg-card)" }}>
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-sm font-bold truncate" style={{ color }}>
            {plan!.planTitle}
          </h2>
          <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--color-muted)" }}>
            {plan!.summary}
          </p>
        </div>

        {/* Overall progress */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold" style={{ color }}>
              {completedCount}/{allTasks.length} tasks
            </p>
            <p className="text-[9px]" style={{ color: "var(--color-muted)" }}>{progressPct}% done</p>
          </div>
          <div className="w-24 h-2 bg-bg-raised rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: color }} />
          </div>
          <button
            onClick={() => { setPlan(null); setTopicStats([]); }}
            className="text-[10px] px-2 py-1 rounded-lg border transition-all"
            style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
          >
            ↩ New Plan
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* Day sidebar */}
        <div className="w-24 shrink-0 border-r overflow-y-auto py-2"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
          {plan!.days.map((d) => {
            const isActive = d.day === selectedDay;
            const dayTasks = d.tasks.map((t) => t.id);
            const dayDone = dayTasks.every((id) => completed[id]);
            const isExam = d.day === plan!.days.length;

            return (
              <button
                key={d.day}
                onClick={() => setSelectedDay(d.day)}
                className="w-full flex flex-col items-center py-2.5 px-1 transition-all border-l-2"
                style={{
                  borderLeftColor: isActive ? color : "transparent",
                  background: isActive ? color + "12" : "transparent",
                }}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                  style={{ color: isActive ? color : "var(--color-muted)" }}>
                  {isExam ? "EXAM" : `Day ${d.day}`}
                </span>
                <span className="text-base leading-none">
                  {isExam ? "🎯" : dayDone ? "✅" :
                   d.urgency === "high" ? "🔥" :
                   d.urgency === "medium" ? "📚" : "🌱"}
                </span>
                <span className="text-[8px] mt-0.5 text-center leading-tight line-clamp-2"
                  style={{ color: isActive ? color : "var(--color-muted)" }}>
                  {d.theme}
                </span>
              </button>
            );
          })}
        </div>

        {/* Day detail */}
        {currentDay && (
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {/* Day header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: URGENCY_COLOR[currentDay.urgency] + "20",
                      color: URGENCY_COLOR[currentDay.urgency],
                    }}>
                    {currentDay.urgency === "high" ? "🔥 HIGH PRIORITY" :
                     currentDay.urgency === "medium" ? "📅 STEADY" : "🌱 LIGHT DAY"}
                  </span>
                  {examDay && currentDay.day < plan!.days.length && (
                    <span className="text-[10px] text-muted">
                      {plan!.days.length - currentDay.day} day{plan!.days.length - currentDay.day !== 1 ? "s" : ""} to exam
                    </span>
                  )}
                </div>
                <h3 className="font-serif text-lg font-bold" style={{ color: "var(--color-text)" }}>
                  {currentDay.theme}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  Focus: <span className="font-semibold" style={{ color }}>{currentDay.focus}</span>
                  {" · "}{pluralize(totalMinutes, "min")} total
                </p>
              </div>
            </div>

            {/* Tasks */}
            <div className="space-y-3 max-w-2xl">
              {currentDay.tasks.map((task) => {
                const cfg = TASK_CONFIG[task.type];
                const done = !!completed[task.id];

                return (
                  <div
                    key={task.id}
                    className="rounded-xl p-4 border transition-all"
                    style={{
                      background: done ? "var(--color-bg-raised)" : cfg.bg,
                      borderColor: done ? "var(--color-border)" : cfg.border,
                      opacity: done ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleTask(task.id)}
                        className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                        style={{
                          borderColor: done ? cfg.text : cfg.text + "80",
                          background: done ? cfg.text : "transparent",
                        }}
                      >
                        {done && <span className="text-white text-[10px] font-bold">✓</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base">{cfg.icon}</span>
                          <span className="text-xs font-bold" style={{ color: cfg.text }}>
                            {cfg.label}
                          </span>
                          {task.topic && (
                            <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                              — {task.topic}
                            </span>
                          )}
                          <span className="text-[10px] ml-auto" style={{ color: "var(--color-muted)" }}>
                            {task.count ? `${task.count} items · ` : ""}{task.durationMin} min
                          </span>
                        </div>

                        {task.note && (
                          <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: "var(--color-muted-light)" }}>
                            {task.note}
                          </p>
                        )}

                        {/* Action button */}
                        {task.type !== "rest" && task.topic && onNavigate && (
                          <button
                            onClick={() => onNavigate(
                              task.type === "flashcards" ? "cards" :
                              task.type === "podcast" ? "podcast" :
                              task.type === "practice" ? "practice" : "chat",
                              task.topic || undefined
                            )}
                            className="mt-2 text-[10px] font-bold px-3 py-1 rounded-lg transition-all"
                            style={{ background: cfg.text + "20", color: cfg.text, border: `1px solid ${cfg.text}40` }}
                          >
                            Start {cfg.label} →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Day nav */}
            <div className="flex gap-3 mt-6 max-w-2xl">
              {currentDay.day > 1 && (
                <button
                  onClick={() => setSelectedDay(currentDay.day - 1)}
                  className="px-4 py-2 rounded-xl text-xs border transition-all"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
                >
                  ← Day {currentDay.day - 1}
                </button>
              )}
              {currentDay.day < plan!.days.length && (
                <button
                  onClick={() => setSelectedDay(currentDay.day + 1)}
                  className="ml-auto px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                  style={{ background: color }}
                >
                  Day {currentDay.day + 1} →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
