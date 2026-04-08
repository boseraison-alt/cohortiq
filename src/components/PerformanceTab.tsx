"use client";

import { useState, useEffect } from "react";
import { t, type Lang } from "@/lib/i18n";

interface Props {
  courseId: string;
  color: string;
  lang?: Lang;
}

interface PerfEntry {
  topic: string;
  question: string;
  correct: boolean;
  score: string;
  createdAt: string;
}

interface MasteryStat {
  topic: string;
  total: number;
  mastered: number;
  due: number;
  isNew: number;
}

export default function PerformanceTab({ courseId, color, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);
  const [perf, setPerf] = useState<PerfEntry[]>([]);
  const [masteryStats, setMasteryStats] = useState<MasteryStat[]>([]);
  const [totalMastered, setTotalMastered] = useState(0);
  const [totalCards, setTotalCards] = useState(0);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/performance`).then((r) => r.json()).then(setPerf).catch(() => {});
    fetch(`/api/courses/${courseId}/flashcard-stats`)
      .then((r) => r.json())
      .then((d) => {
        setMasteryStats(d.stats || []);
        setTotalMastered(d.totalMastered || 0);
        setTotalCards(d.totalCards || 0);
      })
      .catch(() => {});
  }, [courseId]);

  if (!perf.length && !totalCards) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
        <div className="text-3xl">📊</div>
        <p className="font-serif text-lg text-muted-light">No performance data yet</p>
        <p className="text-xs">Take practice tests and grade your answers to build insights.</p>
      </div>
    );
  }

  const topicStats: Record<string, { total: number; correct: number }> = {};
  for (const p of perf) {
    if (!topicStats[p.topic]) topicStats[p.topic] = { total: 0, correct: 0 };
    topicStats[p.topic].total++;
    if (p.correct) topicStats[p.topic].correct++;
  }

  const sorted = Object.entries(topicStats)
    .map(([topic, s]) => ({ topic, ...s, rate: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.rate - b.rate);

  const overall = perf.length
    ? Math.round((perf.filter((p) => p.correct).length / perf.length) * 100)
    : 0;

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Attempts", value: perf.length },
          { label: "Overall Accuracy", value: perf.length ? `${overall}%` : "—" },
          { label: "Topics Covered", value: Object.keys(topicStats).length },
          { label: T("cards.mastered"), value: totalCards ? `${totalMastered}/${totalCards}` : "—" },
        ].map((s, i) => (
          <div key={i} className="bg-bg-card border border-border rounded-xl px-4 py-4">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">{s.label}</p>
            <p className="text-2xl font-bold font-serif" style={{ color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Topic breakdown (practice) */}
      {sorted.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mb-3">Topic Performance</h3>
          {sorted.map((s, i) => (
            <div key={i} className="bg-bg-card border border-border rounded-lg mb-2 px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="flex-1 text-sm font-medium">{s.topic}</span>
                <span className="text-xs font-bold" style={{ color: s.rate >= 70 ? "#4CAF50" : s.rate >= 50 ? "#FFA726" : "#EF5350" }}>
                  {s.rate}%
                </span>
                <span className="text-[10px] text-muted">{s.correct}/{s.total}</span>
              </div>
              <div className="h-1 bg-border rounded overflow-hidden">
                <div className="h-full rounded transition-all" style={{
                  width: `${s.rate}%`,
                  background: s.rate >= 70 ? "#4CAF50" : s.rate >= 50 ? "#FFA726" : "#EF5350",
                }} />
              </div>
            </div>
          ))}
        </>
      )}

      {/* Flashcard Mastery */}
      {masteryStats.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mt-6 mb-1">{T("cards.mastered")} — Flashcard Progress</h3>
          <p className="text-[10px] text-muted mb-3">
            <span className="inline-flex items-center gap-1 mr-3">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#4CAF50" }} /> Mastered (3+ correct)
            </span>
            <span className="inline-flex items-center gap-1 mr-3">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#FFA726" }} /> Learning
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block bg-border" /> New
            </span>
          </p>
          {masteryStats.map((s, i) => {
            const masteredPct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
            const learningPct = s.total ? Math.round(((s.total - s.mastered - s.isNew) / s.total) * 100) : 0;
            const newPct = s.total ? Math.round((s.isNew / s.total) * 100) : 0;
            return (
              <div key={i} className="bg-bg-card border border-border rounded-lg mb-2 px-4 py-3">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex-1 text-sm font-medium">{s.topic}</span>
                  <span className="text-[10px] text-muted">{s.mastered}/{s.total} mastered</span>
                </div>
                <div className="h-2 rounded overflow-hidden flex gap-px" style={{ background: "var(--color-border)" }}>
                  {masteredPct > 0 && <div className="h-full" style={{ width: `${masteredPct}%`, background: "#4CAF50" }} />}
                  {learningPct > 0 && <div className="h-full" style={{ width: `${learningPct}%`, background: "#FFA726" }} />}
                  {newPct > 0 && <div className="h-full" style={{ width: `${newPct}%`, background: "var(--color-border-light)" }} />}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Recent history */}
      {perf.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mt-6 mb-3">Recent Attempts</h3>
          {perf.slice(0, 25).map((p, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border/50 text-xs">
              <span className="font-bold min-w-[18px]" style={{ color: p.correct ? "#4CAF50" : "#EF5350" }}>
                {p.score}
              </span>
              <span className="text-muted-light flex-1 truncate">{p.question}</span>
              <span className="text-muted text-[10px]">{p.topic}</span>
              <span className="text-muted text-[10px]">{new Date(p.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
