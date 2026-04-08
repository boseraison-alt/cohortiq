"use client";

import { useState, useRef, useEffect } from "react";

interface Source {
  courseId: string;
  courseName: string;
  color: string;
  chunkCount: number;
}

interface Props {
  onClose: () => void;
}

const EXAMPLE_QUERIES = [
  "How does CVP analysis from Accounting affect pricing strategy in Marketing?",
  "What financial metrics should I apply when evaluating a marketing campaign's ROI?",
  "How do the concepts we learned connect across all my courses?",
];

interface HistoryEntry {
  id: string;
  question: string;
  answer: string;
  sources: { courseName: string; color: string }[];
  createdAt: string;
}

export default function BrainSearch({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const loadHistory = () => {
    fetch("/api/ai/brain/history").then((r) => r.json()).then((d) => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
  };

  useEffect(() => {
    inputRef.current?.focus();
    loadHistory();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const search = async (q?: string) => {
    const question = (q ?? query).trim();
    if (!question) return;
    setLoading(true);
    setAnswer("");
    setSources([]);
    setError("");
    try {
      const res = await fetch("/api/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnswer(data.answer);
      setSources(data.sources || []);
      setShowHistory(false);
      loadHistory();
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    }
    setLoading(false);
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", maxHeight: "78vh" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
              style={{ background: "linear-gradient(135deg, #7B6CF6, #C9956B)" }}>
              🧠
            </div>
            <div>
              <h2 className="font-serif text-base font-bold" style={{ color: "var(--color-text)" }}>
                Master Mind
              </h2>
              <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                Cross-course AI search across your entire curriculum
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto text-xs px-2 py-1 rounded-lg transition-all"
              style={{ color: "var(--color-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              ✕ Esc
            </button>
          </div>

          {/* Search input */}
          <div className="flex gap-2 mt-3">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && search()}
              placeholder="Ask anything across all your courses…"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none border transition-all"
              style={{
                background: "var(--color-bg)",
                borderColor: "var(--color-border-light)",
                color: "var(--color-text)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#7B6CF6")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border-light)")}
            />
            <button
              onClick={() => search()}
              disabled={!query.trim() || loading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #7B6CF6, #9B79E8)" }}
            >
              {loading ? "…" : "Ask"}
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="relative w-10 h-10">
                <div className="absolute inset-0 rounded-full border-2 border-border" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                  style={{ borderTopColor: "#7B6CF6" }} />
              </div>
              <p className="text-sm font-serif" style={{ color: "var(--color-muted-light)" }}>
                Searching across all courses…
              </p>
              <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                Connecting ideas from your entire curriculum
              </p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#EF535018", color: "#EF5350" }}>
              {error}
            </div>
          )}

          {/* Answer */}
          {answer && !loading && (
            <div ref={answerRef}>
              {/* Source chips */}
              {sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <span className="text-[10px] text-muted self-center mr-1">Sources:</span>
                  {sources.map((s) => (
                    <span
                      key={s.courseId}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: s.color + "20", color: s.color, border: `1px solid ${s.color}40` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.color }} />
                      {s.courseName}
                      <span className="text-[9px] opacity-60 ml-0.5">{s.chunkCount} refs</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Answer text */}
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap rounded-xl px-4 py-4"
                style={{
                  color: "var(--color-text)",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {answer}
              </div>

              {/* Ask another */}
              <button
                onClick={() => { setQuery(""); setAnswer(""); setSources([]); inputRef.current?.focus(); }}
                className="mt-3 text-[11px] font-semibold transition-all"
                style={{ color: "#7B6CF6" }}
              >
                ← Ask another question
              </button>
            </div>
          )}

          {/* Empty state — example queries + history */}
          {!answer && !loading && !error && (
            <div>
              {/* History toggle */}
              {history.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setShowHistory(false)}
                    className="text-[11px] font-semibold px-3 py-1 rounded-lg border transition-all"
                    style={{ background: !showHistory ? "#7B6CF620" : "transparent", borderColor: !showHistory ? "#7B6CF6" : "var(--color-border)", color: !showHistory ? "#7B6CF6" : "var(--color-muted)" }}>
                    New Search
                  </button>
                  <button onClick={() => setShowHistory(true)}
                    className="text-[11px] font-semibold px-3 py-1 rounded-lg border transition-all"
                    style={{ background: showHistory ? "#7B6CF620" : "transparent", borderColor: showHistory ? "#7B6CF6" : "var(--color-border)", color: showHistory ? "#7B6CF6" : "var(--color-muted)" }}>
                    Past Searches ({history.length})
                  </button>
                </div>
              )}

              {/* Past searches */}
              {showHistory ? (
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id}
                      className="rounded-xl border px-4 py-3 cursor-pointer transition-all"
                      style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
                      onClick={() => { setQuery(h.question); setAnswer(h.answer); setSources(h.sources.map((s) => ({ ...s, courseId: "", chunkCount: 0 }))); setShowHistory(false); }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7B6CF640"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium flex-1" style={{ color: "var(--color-text)" }}>{h.question}</p>
                        <span className="text-[9px] font-mono shrink-0" style={{ color: "var(--color-muted)" }}>{new Date(h.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[11px] line-clamp-2" style={{ color: "var(--color-muted)" }}>{h.answer.slice(0, 150)}…</p>
                      {h.sources.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {h.sources.map((s, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: s.color + "20", color: s.color }}>{s.courseName}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
              <>

              <p className="text-[11px] text-muted uppercase tracking-widest mb-3">Try asking…</p>
              <div className="space-y-2">
                {EXAMPLE_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(q); search(q); }}
                    className="w-full text-left px-4 py-3 rounded-xl border text-sm transition-all"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "var(--color-bg)",
                      color: "var(--color-muted-light)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#7B6CF640";
                      e.currentTarget.style.background = "#7B6CF608";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border)";
                      e.currentTarget.style.background = "var(--color-bg)";
                    }}
                  >
                    <span className="text-[#7B6CF6] mr-2">🔗</span>
                    {q}
                  </button>
                ))}
              </div>

              <div className="mt-6 px-4 py-3 rounded-xl" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <p className="text-[11px] font-semibold mb-1" style={{ color: "#7B6CF6" }}>💡 How Master Mind works</p>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Unlike standard search, Master Mind retrieves relevant material from <strong>every course</strong> simultaneously,
                  then synthesizes the connections — surfacing insights that cross-disciplinary thinking reveals.
                </p>
              </div>
              </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
