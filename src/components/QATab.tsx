"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  courseId: string;
  color: string;
  name: string;
  weeks: { id: string; number: number; label: string | null }[];
}

export default function QATab({ courseId, color, name, weeks }: Props) {
  const [msgs, setMsgs] = useState<{ r: string; t: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [msgs]);

  const ask = async () => {
    if (!input.trim() || busy) return;
    const q = input.trim();
    setMsgs((p) => [...p, { r: "u", t: q }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, question: q, weekIds: selectedWeeks.length ? selectedWeeks : undefined }),
      });
      const data = await res.json();
      setMsgs((p) => [...p, { r: "a", t: data.answer || data.error }]);
    } catch (e: any) {
      setMsgs((p) => [...p, { r: "a", t: `Error: ${e.message}` }]);
    }
    setBusy(false);
  };

  const toggleWeek = (wid: string) => {
    setSelectedWeeks((p) => p.includes(wid) ? p.filter((w) => w !== wid) : [...p, wid]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Week filter */}
      <div className="px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted uppercase tracking-wider">Filter weeks:</span>
        <button
          onClick={() => setSelectedWeeks([])}
          className={`px-2 py-1 rounded text-[10px] font-medium ${
            !selectedWeeks.length ? "text-bg" : "text-muted bg-bg-raised border border-border-light"
          }`}
          style={!selectedWeeks.length ? { background: color } : {}}
        >
          All
        </button>
        {weeks.filter((w) => w.label).slice(0, 15).map((w) => (
          <button
            key={w.id}
            onClick={() => toggleWeek(w.id)}
            className={`px-2 py-1 rounded text-[10px] font-medium border ${
              selectedWeeks.includes(w.id) ? "text-bg border-transparent" : "text-muted bg-bg-raised border-border-light"
            }`}
            style={selectedWeeks.includes(w.id) ? { background: color } : {}}
          >
            W{w.number}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={ref} className="flex-1 overflow-y-auto px-5 py-4">
        {!msgs.length && (
          <div className="text-center text-muted py-14">
            <div className="text-3xl mb-3">💬</div>
            <p className="font-serif text-lg text-muted-light">Ask anything about {name}</p>
            <p className="text-xs mt-2 max-w-sm mx-auto leading-relaxed">
              Smart retrieval searches your materials and answers only from what you've uploaded. Filter by week to narrow scope.
            </p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex mb-3 ${m.r === "u" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                background: m.r === "u" ? color + "20" : "#0F1115",
                border: `1px solid ${m.r === "u" ? color + "40" : "#1A1D24"}`,
                color: m.r === "u" ? "#E4DED4" : "#C0BAB0",
              }}
            >
              {m.t}
            </div>
          </div>
        ))}
        {busy && (
          <div className="px-4 py-3 rounded-xl bg-bg-card border border-border text-sm inline-block" style={{ color }}>
            Searching materials…
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-5 py-3 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && ask()}
          disabled={busy}
          placeholder="Ask about your course materials…"
          className="flex-1 bg-bg-card border border-border-light rounded-xl px-4 py-3 text-sm text-[#E4DED4] outline-none"
        />
        <button
          onClick={ask}
          disabled={busy || !input.trim()}
          className="rounded-xl px-5 py-3 text-sm font-semibold text-bg"
          style={{ background: input.trim() && !busy ? color : "#252A34" }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}
