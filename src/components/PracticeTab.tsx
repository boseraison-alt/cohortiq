"use client";

import { useState, useEffect } from "react";
import { t, type Lang } from "@/lib/i18n";

interface Props {
  courseId: string;
  color: string;
  name: string;
  lang?: Lang;
}

interface Question {
  q: string; type: string; topic: string; options?: string[];
  answer: string; explanation?: string;
}

export default function PracticeTab({ courseId, color, name, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [graded, setGraded] = useState<Record<number, any>>({});
  const [grading, setGrading] = useState<Record<number, boolean>>({});

  // Controls
  const [numQ, setNumQ] = useState(5);
  const [qType, setQType] = useState("mixed");
  const [mode, setMode] = useState("weighted");

  // Topic selection
  const [topicMode, setTopicMode] = useState<"random" | "custom">("random");
  const [customTopic, setCustomTopic] = useState("");
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/topics`)
      .then((r) => r.json())
      .then((d) => setAvailableTopics(d.topics || []))
      .catch(() => {});
  }, [courseId]);

  const generate = async () => {
    setGenerating(true);
    setRevealed({}); setAnswers({}); setGraded({});
    try {
      const body: any = {
        courseId,
        numQuestions: numQ,
        questionType: qType,
        mode,
      };
      if (topicMode === "custom" && customTopic.trim()) {
        body.customTopic = customTopic.trim();
      }
      const res = await fetch("/api/ai/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuestions(data.questions);
    } catch (e: any) { alert("Error: " + e.message); }
    setGenerating(false);
  };

  const grade = async (idx: number) => {
    const q = questions[idx];
    const ua = answers[idx];
    if (!ua?.trim()) return;
    setGrading((p) => ({ ...p, [idx]: true }));
    try {
      const res = await fetch("/api/ai/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, question: q.q, modelAnswer: q.answer, userAnswer: ua, topic: q.topic }),
      });
      const g = await res.json();
      setGraded((p) => ({ ...p, [idx]: g }));
    } catch {
      setGraded((p) => ({ ...p, [idx]: { score: "?", feedback: "Grading failed.", correct: false, missed: [] } }));
    }
    setGrading((p) => ({ ...p, [idx]: false }));
  };

  return (
    <div className="h-full flex flex-col">

      {/* ── Controls bar ── */}
      <div className="px-5 py-3 border-b border-border space-y-3">

        {/* Row 1: mode, count, type */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-0.5 bg-bg-card rounded-md p-0.5">
            {([["weighted", "⚡ Weighted"], ["cumulative", "📋 Cumulative"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)}
                className="rounded px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                style={{ background: mode === k ? color : "transparent", color: mode === k ? "#fff" : "var(--color-muted)" }}>
                {l}
              </button>
            ))}
          </div>

          <select value={numQ} onChange={(e) => setNumQ(+e.target.value)}
            className="bg-bg-raised border border-border-light rounded px-2 py-1.5 text-xs"
            style={{ color: "var(--color-text)" }}>
            {[3, 5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n} Q</option>)}
          </select>

          <select value={qType} onChange={(e) => setQType(e.target.value)}
            className="bg-bg-raised border border-border-light rounded px-2 py-1.5 text-xs"
            style={{ color: "var(--color-text)" }}>
            <option value="mixed">{T("prac.mixed")}</option>
            <option value="mcq">{T("prac.mcq")}</option>
            <option value="short">{T("prac.short")}</option>
            <option value="essay">{T("prac.essay")}</option>
          </select>

          <button onClick={generate} disabled={generating || (topicMode === "custom" && !customTopic.trim())}
            className="rounded-lg px-4 py-2 text-xs font-semibold ml-auto transition-all disabled:opacity-50"
            style={{ background: generating ? "var(--color-border-light)" : color, color: "#fff" }}>
            {generating ? T("prac.generating") : T("prac.generate")}
          </button>
        </div>

        {/* Row 2: topic selector */}
        <div className="flex items-start gap-3 flex-wrap">
          <span className="text-[10px] text-muted uppercase tracking-wider mt-2 shrink-0">Topic:</span>

          {/* Random pill */}
          <button
            onClick={() => { setTopicMode("random"); setCustomTopic(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
            style={{
              background: topicMode === "random" ? color + "20" : "var(--color-bg)",
              borderColor: topicMode === "random" ? color : "var(--color-border)",
              color: topicMode === "random" ? color : "var(--color-muted)",
            }}
          >
            🎲 Random — All Material
          </button>

          {/* Custom topic button */}
          <button
            onClick={() => setTopicMode("custom")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
            style={{
              background: topicMode === "custom" ? color + "20" : "var(--color-bg)",
              borderColor: topicMode === "custom" ? color : "var(--color-border)",
              color: topicMode === "custom" ? color : "var(--color-muted)",
            }}
          >
            ✏️ Specific Topic
          </button>

          {/* Topic input + chips — visible only when custom mode */}
          {topicMode === "custom" && (
            <div className="flex-1 min-w-[260px]">
              <input
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Type a topic… e.g. Cost-Volume-Profit Analysis"
                className="w-full bg-bg-raised border border-border-light rounded-lg px-3 py-2 text-xs outline-none transition-all"
                style={{
                  color: "var(--color-text)",
                  borderColor: customTopic ? color + "60" : undefined,
                }}
              />
              {availableTopics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {availableTopics.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => setCustomTopic(topic)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all"
                      style={{
                        background: customTopic === topic ? color + "20" : "var(--color-bg)",
                        borderColor: customTopic === topic ? color : "var(--color-border)",
                        color: customTopic === topic ? color : "var(--color-muted)",
                      }}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Questions ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {!questions.length && !generating && (
          <div className="text-center text-muted py-14">
            <div className="text-3xl mb-3">📝</div>
            <p className="font-serif text-lg text-muted-light">
              {mode === "weighted" ? "Weighted Practice Test" : "Cumulative Final Review"}
            </p>
            <p className="text-xs mt-2 max-w-md mx-auto leading-relaxed">
              {topicMode === "custom" && customTopic
                ? `Questions will focus on: "${customTopic}"`
                : mode === "weighted"
                  ? "Questions target your weak areas based on past performance. The more you practice, the smarter the targeting."
                  : "Comprehensive exam spanning all materials. Select specific weeks or test across the full course."}
            </p>
          </div>
        )}

        {questions.map((q, idx) => (
          <div key={idx} className="bg-bg-card border border-border rounded-xl mb-3 p-4">
            <div className="flex gap-2 mb-2 flex-wrap">
              <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: color + "30", color }}>
                Q{idx + 1}
              </span>
              <span className="bg-bg-raised rounded px-2 py-0.5 text-[10px] text-muted uppercase tracking-wider">
                {q.type}
              </span>
              {q.topic && <span className="text-[10px] text-muted">· {q.topic}</span>}
            </div>
            <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--color-text)" }}>{q.q}</p>

            {q.type === "mcq" && q.options && (
              <div className="flex flex-col gap-1.5 mb-3">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md text-xs border transition-all"
                    style={{
                      background: answers[idx] === opt ? color + "20" : "var(--color-bg)",
                      borderColor: answers[idx] === opt ? color : "var(--color-border)",
                      color: "var(--color-text)",
                    }}>
                    <input type="radio" name={`q${idx}`} checked={answers[idx] === opt}
                      onChange={() => setAnswers((p) => ({ ...p, [idx]: opt }))}
                      style={{ accentColor: color }} />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {(q.type === "short" || q.type === "essay") && (
              <textarea value={answers[idx] || ""} onChange={(e) => setAnswers((p) => ({ ...p, [idx]: e.target.value }))}
                placeholder="Your answer…" rows={q.type === "essay" ? 4 : 2}
                className="w-full bg-bg border border-border rounded-md px-3 py-2.5 text-xs outline-none resize-y mb-3"
                style={{ color: "var(--color-text)" }} />
            )}

            <div className="flex gap-2">
              {answers[idx] && !graded[idx] && (
                <button onClick={() => grade(idx)} disabled={grading[idx]}
                  className="rounded px-3 py-1.5 text-[11px] font-semibold transition-all"
                  style={{ background: grading[idx] ? "var(--color-border-light)" : color, color: "#fff" }}>
                  {grading[idx] ? T("prac.grading") : T("prac.submit")}
                </button>
              )}
              <button onClick={() => setRevealed((p) => ({ ...p, [idx]: !p[idx] }))}
                className="bg-bg-raised border border-border-light rounded px-3 py-1.5 text-[11px] text-muted-light">
                {revealed[idx] ? T("common.close") : T("prac.reveal")}
              </button>
            </div>

            {graded[idx] && (
              <div className="mt-3 p-3 bg-bg rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg font-bold font-serif" style={{ color: graded[idx].correct ? "#4CAF50" : "#EF5350" }}>
                    {graded[idx].score}
                  </span>
                  <span className="text-[11px]" style={{ color: graded[idx].correct ? "#4CAF50" : "#EF5350" }}>
                    {graded[idx].correct ? T("prac.correct") : T("prac.incorrect")}
                  </span>
                </div>
                <p className="text-xs text-muted-light leading-relaxed">{graded[idx].feedback}</p>
                {graded[idx].missed?.length > 0 && (
                  <p className="text-[11px] text-danger mt-1.5">Missed: {graded[idx].missed.join("; ")}</p>
                )}
              </div>
            )}

            {revealed[idx] && (
              <div className="mt-3 p-3 rounded-lg border" style={{ background: color + "0D", borderColor: color + "30" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color }}>Model Answer</p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted-light)" }}>{q.answer}</p>
                {q.explanation && <p className="text-[11px] text-muted mt-1.5 italic">{q.explanation}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
