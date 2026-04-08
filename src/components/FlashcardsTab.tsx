"use client";

import { useState, useEffect } from "react";
import { t, type Lang } from "@/lib/i18n";

interface Props {
  courseId: string;
  color: string;
  lang?: Lang;
}

interface Card { id: string; front: string; back: string; topic: string | null; }
interface DueCard extends Card { isNew: boolean; }

export default function FlashcardsTab({ courseId, color, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);

  const [cards, setCards] = useState<Card[]>([]);
  const [gen, setGen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [num, setNum] = useState(10);

  // Topic selection
  const [topicMode, setTopicMode] = useState<"random" | "custom">("random");
  const [customTopic, setCustomTopic] = useState("");
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);

  // Spaced repetition
  const [mode, setMode] = useState<"browse" | "study">("browse");
  const [dueCards, setDueCards] = useState<DueCard[]>([]);
  const [dueIdx, setDueIdx] = useState(0);
  const [dueFlip, setDueFlip] = useState(false);
  const [rating, setRating] = useState(false);
  const [allCaughtUp, setAllCaughtUp] = useState(false);

  // Review history
  const [reviewHistory, setReviewHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/flashcards`).then((r) => r.json()).then(setCards).catch(() => {});
    fetch(`/api/courses/${courseId}/topics`)
      .then((r) => r.json())
      .then((d) => setAvailableTopics(d.topics || []))
      .catch(() => {});
    fetchDue();
    fetch(`/api/cards/history?courseId=${courseId}`).then((r) => r.json()).then(setReviewHistory).catch(() => {});
  }, [courseId]);

  const fetchDue = () => {
    fetch(`/api/cards/due?courseId=${courseId}`)
      .then((r) => r.json())
      .then((d) => { setDueCards(d.cards || []); setAllCaughtUp((d.cards || []).length === 0); })
      .catch(() => {});
  };

  const generate = async () => {
    setGen(true);
    try {
      const body: any = { courseId, numCards: num };
      if (topicMode === "custom" && customTopic.trim()) {
        body.customTopic = customTopic.trim();
      }
      const res = await fetch("/api/ai/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setCards((p) => [...p, ...data]);
        setIdx(cards.length);
        // Refresh due count — newly generated cards are always due
        fetchDue();
      }
    } catch (e: any) { alert("Error: " + e.message); }
    setGen(false);
  };

  const clearAll = async () => {
    if (!confirm("Clear all flashcards?")) return;
    await fetch(`/api/courses/${courseId}/flashcards`, { method: "DELETE" });
    setCards([]); setIdx(0); setDueCards([]); setAllCaughtUp(false);
  };

  const rateCard = async (cardRating: number) => {
    if (rating) return;
    setRating(true);
    const cardId = dueCards[dueIdx]?.id;
    if (cardId) {
      await fetch("/api/cards/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardId: cardId, rating: cardRating }),
      }).catch(() => {});
    }
    setRating(false);
    setDueFlip(false);
    // Refresh history after rating
    fetch(`/api/cards/history?courseId=${courseId}`).then((r) => r.json()).then(setReviewHistory).catch(() => {});
    const next = dueIdx + 1;
    if (next >= dueCards.length) {
      setAllCaughtUp(true);
    } else {
      setDueIdx(next);
    }
  };

  const enterStudyMode = () => {
    setMode("study");
    setDueIdx(0);
    setDueFlip(false);
    setAllCaughtUp(dueCards.length === 0);
  };

  const card = cards[idx];
  const dueCard = dueCards[dueIdx];

  const ratingButtons = [
    { label: T("cards.forgot"), rating: 0, bg: "#EF535020", border: "#EF5350", text: "#EF5350" },
    { label: T("cards.hard"),   rating: 1, bg: "#FFA72620", border: "#FFA726", text: "#FFA726" },
    { label: T("cards.good"),   rating: 2, bg: color + "20", border: color, text: color },
    { label: T("cards.easy"),   rating: 3, bg: "#4CAF5020", border: "#4CAF50", text: "#4CAF50" },
  ];

  return (
    <div className="h-full flex flex-col">

      {/* ── Mode toggle + due badge ── */}
      <div className="px-5 pt-3 pb-0 flex items-center gap-2">
        {["browse", "study"].map((m) => (
          <button
            key={m}
            onClick={() => m === "study" ? enterStudyMode() : setMode("browse")}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
            style={{
              background: mode === m ? color + "20" : "var(--color-bg)",
              borderColor: mode === m ? color : "var(--color-border)",
              color: mode === m ? color : "var(--color-muted)",
            }}
          >
            {m === "browse" ? T("cards.browse_mode") : (
              <span className="flex items-center gap-1.5">
                {T("cards.study_mode")}
                {dueCards.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: color, color: "#fff" }}>
                    {dueCards.length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted italic">Powered by Spaced Repetition (SM-2) — cards you struggle with reappear sooner</span>
      </div>

      {/* ── STUDY MODE ── */}
      {mode === "study" ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-6">
          {allCaughtUp ? (
            <div className="text-center">
              <div className="text-4xl mb-3">🎉</div>
              <p className="font-serif text-lg font-semibold mb-1">{T("cards.all_caught_up")}</p>
              <p className="text-xs text-muted">Check back tomorrow for more cards due.</p>
              <button onClick={() => { setMode("browse"); }}
                className="mt-5 px-4 py-2 rounded-lg text-xs border border-border text-muted">
                Browse all cards
              </button>
            </div>
          ) : dueCard ? (
            <>
              {/* Progress */}
              <p className="text-xs text-muted mb-4">
                {T("cards.study_mode")} · {dueIdx + 1} / {dueCards.length}
                {dueCard.isNew && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: "#7B6CF620", color: "#7B6CF6" }}>NEW</span>
                )}
                {dueCard.topic && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: color + "20", color }}>
                    {dueCard.topic}
                  </span>
                )}
              </p>

              {/* Card */}
              <div
                onClick={() => setDueFlip(!dueFlip)}
                className="w-full max-w-lg min-h-[240px] px-8 py-9 rounded-2xl cursor-pointer flex flex-col items-center justify-center text-center transition-all"
                style={{
                  background: dueFlip ? color + "14" : "var(--color-bg-card)",
                  border: `2px solid ${dueFlip ? color + "50" : "var(--color-border)"}`,
                }}
              >
                <p className="text-[9px] uppercase tracking-widest mb-3"
                  style={{ color: dueFlip ? color : "var(--color-muted)" }}>
                  {dueFlip ? T("cards.back") : T("cards.front")}
                </p>
                <p className={`leading-relaxed ${dueFlip ? "text-sm" : "text-lg font-serif font-semibold"}`}
                  style={{ color: "var(--color-text)" }}>
                  {dueFlip ? dueCard.back : dueCard.front}
                </p>
                <p className="text-[10px] text-muted mt-4">
                  {dueFlip ? `↩ ${T("cards.front")}` : `↻ ${T("cards.flip")}`}
                </p>
              </div>

              {/* Rating buttons — only shown after flip */}
              {dueFlip && (
                <div className="flex gap-2 mt-5 flex-wrap justify-center">
                  {ratingButtons.map((btn) => (
                    <button
                      key={btn.rating}
                      onClick={() => rateCard(btn.rating)}
                      disabled={rating}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all disabled:opacity-40"
                      style={{ background: btn.bg, borderColor: btn.border, color: btn.text }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
              {!dueFlip && (
                <p className="text-[10px] text-muted mt-4">Tap card to reveal answer, then rate yourself</p>
              )}
            </>
          ) : (
            <p className="text-muted text-sm">No cards yet. Generate some first.</p>
          )}
        </div>
      ) : (

      /* ── BROWSE MODE ── */
      <>
        {/* Controls */}
        <div className="px-5 py-3 border-b border-border space-y-3">

          {/* Row 1: count + generate */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">{T("cards.count")}</span>
            <select value={num} onChange={(e) => setNum(+e.target.value)}
              className="bg-bg-raised border border-border-light rounded px-2 py-1.5 text-xs"
              style={{ color: "var(--color-text)" }}>
              {[5, 10, 15, 20, 25, 30].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <button
              onClick={generate}
              disabled={gen || (topicMode === "custom" && !customTopic.trim())}
              className="rounded-lg px-4 py-2 text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: gen ? "var(--color-border-light)" : color, color: "#fff" }}>
              {gen ? T("cards.generating") : T("cards.generate")}
            </button>

            {cards.length > 0 && (
              <>
                <span className="text-xs text-muted">{cards.length} total</span>
                <button onClick={clearAll}
                  className="bg-bg-raised border border-border-light rounded px-3 py-1.5 text-[11px] text-muted">
                  {T("cards.clear")}
                </button>
              </>
            )}
          </div>

          {/* Row 2: topic selector */}
          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-[10px] text-muted uppercase tracking-wider mt-2 shrink-0">Topic:</span>

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

            {topicMode === "custom" && (
              <div className="flex-1 min-w-[260px]">
                <input
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Type a topic… e.g. Break-even Analysis"
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

        {/* Card viewer */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-6">
          {!cards.length ? (
            <div className="text-center text-muted">
              <div className="text-3xl mb-3">🃏</div>
              <p className="font-serif text-lg text-muted-light">{T("cards.title")}</p>
              <p className="text-xs mt-2">{T("cards.empty")}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <p className="text-xs text-muted">
                  {T("cards.title")} {idx + 1} {T("cards.of")} {cards.length}
                </p>
                {card?.topic && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: color + "20", color }}
                  >
                    {card.topic}
                  </span>
                )}
              </div>

              <div
                onClick={() => setFlip(!flip)}
                className="w-full max-w-lg min-h-[240px] px-8 py-9 rounded-2xl cursor-pointer flex flex-col items-center justify-center text-center transition-all"
                style={{
                  background: flip ? color + "14" : "var(--color-bg-card)",
                  border: `2px solid ${flip ? color + "50" : "var(--color-border)"}`,
                }}
              >
                <p className="text-[9px] uppercase tracking-widest mb-3" style={{ color: flip ? color : "var(--color-muted)" }}>
                  {flip ? T("cards.back") : T("cards.front")}
                </p>
                <p className={`leading-relaxed ${flip ? "text-sm" : "text-lg font-serif font-semibold"}`}
                  style={{ color: "var(--color-text)" }}>
                  {flip ? card?.back : card?.front}
                </p>
                <p className="text-[10px] text-muted mt-4">
                  {flip ? `↩ ${T("cards.front")}` : `↻ ${T("cards.flip")}`}
                </p>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setIdx(Math.max(0, idx - 1)); setFlip(false); }}
                  disabled={idx === 0}
                  className="bg-bg-raised border border-border-light rounded-lg px-5 py-2.5 text-xs transition-all"
                  style={{ color: idx === 0 ? "var(--color-border-light)" : "var(--color-muted-light)" }}
                >
                  {T("cards.prev")}
                </button>
                <button
                  onClick={() => { setIdx((idx + 1) % cards.length); setFlip(false); }}
                  className="rounded-lg px-5 py-2.5 text-xs font-semibold transition-all"
                  style={{ background: color, color: "#fff" }}
                >
                  {T("cards.next")}
                </button>
              </div>

              <div className="flex gap-1 mt-4 flex-wrap justify-center max-w-sm">
                {cards.map((_, i) => (
                  <div key={i} onClick={() => { setIdx(i); setFlip(false); }}
                    className="w-2 h-2 rounded-full cursor-pointer transition-all"
                    style={{ background: i === idx ? color : "var(--color-border-light)" }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── REVIEW HISTORY ── */}
        {reviewHistory.length > 0 && (
          <div className="border-t border-border px-5 py-4">
            <h3 className="text-xs font-semibold mb-3 text-muted-light">Recent Review History</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {reviewHistory.slice(0, 20).map((r: any, i: number) => {
                const rColor = r.rating === 3 ? "#4CAF50" : r.rating === 2 ? color : r.rating === 1 ? "#FFA726" : "#EF5350";
                return (
                  <div key={i} className="flex items-center gap-3 bg-bg-card border border-border rounded-lg px-3 py-2 text-xs">
                    <span className="text-[10px] font-mono text-muted shrink-0 w-16">{new Date(r.date).toLocaleDateString()}</span>
                    <span className="flex-1 truncate text-muted-light">{r.front}</span>
                    {r.topic && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{ background: color + "15", color }}>{r.topic}</span>}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: rColor + "18", color: rColor }}>{r.ratingLabel}</span>
                    <span className="text-[9px] font-mono text-muted shrink-0">+{r.interval}d</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
      )}
    </div>
  );
}
