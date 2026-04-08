"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useVoiceInput } from "@/hooks/useVoiceInput";

interface Props {
  courseId: string;
  color: string;
  name: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ScoreReport {
  overallScore: number;
  readinessLevel: string;
  strengths: string[];
  gaps: string[];
  subTopicScores: { topic: string; score: number }[];
  nextSteps: string;
  summary: string;
}

export default function FeynmanTab({ courseId, color, name }: Props) {
  const [topics, setTopics] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const [phase, setPhase] = useState<"setup" | "session" | "scored">("setup");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<ScoreReport | null>(null);
  const [scoring, setScoring] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { listening: voiceListening, supported: voiceSupported, toggle: toggleVoice, interimTranscript } =
    useVoiceInput({ onTranscript: (t) => setInput((prev) => prev ? prev + " " + t : t) });

  useEffect(() => {
    fetch(`/api/courses/${courseId}/topics`)
      .then((r) => r.json())
      .then((d) => setTopics(d.topics || []))
      .catch(() => {});
  }, [courseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeTopic = useCustom ? customTopic.trim() : topic;

  const startSession = async () => {
    if (!activeTopic) return;
    setLoading(true);

    const openingMsg: Message = {
      role: "assistant",
      content: `Hi! I've been trying to understand "${activeTopic}" but I keep getting lost. Could you explain it to me as if I've never heard of it before? Take your time — I really want to understand.`,
    };

    setMessages([openingMsg]);
    setPhase("session");
    setLoading(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/feynman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, topic: activeTopic, messages: newMessages, action: "respond" }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages([...newMessages, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong. Try again." }]);
    }
    setLoading(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const getScore = async () => {
    if (messages.length < 4) return;
    setScoring(true);
    try {
      const res = await fetch("/api/ai/feynman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, topic: activeTopic, messages, action: "score" }),
      });
      const data = await res.json();
      if (data.score) {
        setScore(data.score);
        setPhase("scored");
      }
    } catch {}
    setScoring(false);
  };

  const reset = () => {
    setPhase("setup");
    setMessages([]);
    setScore(null);
    setInput("");
  };

  const scoreColor = (s: number) =>
    s >= 80 ? "#2ac46e" : s >= 55 ? "#f0a500" : "#ef5350";

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--color-bg)" }}>

      {/* Header */}
      <div style={{
        padding: "18px 24px 14px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-bg-card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 600, color: "var(--color-text)" }}>
              🧑‍🏫 Feynman Mode
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-muted)", marginTop: 2 }}>
              Teach a concept to our AI student — gaps in your explanation reveal gaps in your understanding
            </div>
          </div>
          {phase !== "setup" && (
            <div style={{ display: "flex", gap: 8 }}>
              {phase === "session" && messages.length >= 4 && (
                <button
                  onClick={getScore}
                  disabled={scoring}
                  style={{
                    padding: "7px 16px", borderRadius: 8, border: "none",
                    background: color, color: "#fff", fontSize: "0.78rem",
                    fontWeight: 600, cursor: scoring ? "not-allowed" : "pointer", opacity: scoring ? 0.7 : 1,
                  }}
                >
                  {scoring ? "Scoring…" : "End & Score"}
                </button>
              )}
              <button
                onClick={reset}
                style={{
                  padding: "7px 14px", borderRadius: 8,
                  border: "1px solid var(--color-border)",
                  background: "transparent", fontSize: "0.78rem",
                  color: "var(--color-muted)", cursor: "pointer",
                }}
              >
                New Topic
              </button>
            </div>
          )}
        </div>
        {phase !== "setup" && (
          <div style={{
            marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6,
            background: `${color}18`, borderRadius: 6, padding: "4px 10px",
          }}>
            <span style={{ fontSize: "0.72rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Topic</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color }}>
              {activeTopic}
            </span>
          </div>
        )}
      </div>

      {/* Setup Phase */}
      {phase === "setup" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{
            width: "100%", maxWidth: 520,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 16, padding: 32,
          }}>
            <div style={{ fontSize: "2.5rem", textAlign: "center", marginBottom: 8 }}>🧑‍🏫</div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 600, textAlign: "center", marginBottom: 6, color: "var(--color-text)" }}>
              Pick a concept to teach
            </h2>
            <p style={{ fontSize: "0.82rem", color: "var(--color-muted)", textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
              Our AI will play the role of a curious student who knows nothing. Your job is to explain the concept clearly. Gaps in your explanation reveal gaps in your understanding.
            </p>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => setUseCustom(false)}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 8, fontSize: "0.78rem",
                    border: `1px solid ${!useCustom ? color : "var(--color-border)"}`,
                    background: !useCustom ? `${color}18` : "transparent",
                    color: !useCustom ? color : "var(--color-muted)",
                    cursor: "pointer", fontWeight: !useCustom ? 600 : 400,
                  }}
                >
                  Pick from course
                </button>
                <button
                  onClick={() => setUseCustom(true)}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 8, fontSize: "0.78rem",
                    border: `1px solid ${useCustom ? color : "var(--color-border)"}`,
                    background: useCustom ? `${color}18` : "transparent",
                    color: useCustom ? color : "var(--color-muted)",
                    cursor: "pointer", fontWeight: useCustom ? 600 : 400,
                  }}
                >
                  Type a concept
                </button>
              </div>

              {!useCustom ? (
                topics.length > 0 ? (
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-bg)", color: "var(--color-text)",
                      fontSize: "0.88rem", fontFamily: "inherit",
                    }}
                  >
                    <option value="">Select a topic…</option>
                    {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", textAlign: "center", padding: "10px 0" }}>
                    No topics found — use "Type a concept" instead
                  </div>
                )
              ) : (
                <input
                  type="text"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="e.g. CVP Analysis, Contribution Margin…"
                  onKeyDown={(e) => e.key === "Enter" && activeTopic && startSession()}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg)", color: "var(--color-text)",
                    fontSize: "0.88rem", fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
              )}
            </div>

            <button
              onClick={startSession}
              disabled={!activeTopic || loading}
              style={{
                width: "100%", padding: "12px", borderRadius: 10,
                border: "none", background: activeTopic ? color : "var(--color-border)",
                color: activeTopic ? "#fff" : "var(--color-muted)",
                fontSize: "0.92rem", fontWeight: 600, cursor: activeTopic ? "pointer" : "not-allowed",
                transition: "all 0.15s",
              }}
            >
              {loading ? "Starting…" : "Start Teaching Session →"}
            </button>
          </div>
        </div>
      )}

      {/* Session Phase */}
      {phase === "session" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row",
                gap: 10, alignItems: "flex-start",
              }}>
                {m.role === "assistant" && (
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1rem",
                  }}>
                    🧑‍🎓
                  </div>
                )}
                <div style={{
                  maxWidth: "70%", padding: "12px 16px", borderRadius: 14,
                  background: m.role === "user" ? color : "var(--color-bg-raised)",
                  color: m.role === "user" ? "#fff" : "var(--color-text)",
                  fontSize: "0.88rem", lineHeight: 1.55,
                  borderBottomRightRadius: m.role === "user" ? 4 : 14,
                  borderBottomLeftRadius: m.role === "assistant" ? 4 : 14,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center",
                }}>🧑‍🎓</div>
                <div style={{
                  padding: "12px 16px", borderRadius: 14, borderBottomLeftRadius: 4,
                  background: "var(--color-bg-raised)", display: "flex", gap: 4, alignItems: "center",
                }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "var(--color-muted)", display: "inline-block",
                      animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "12px 20px 16px",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-card)",
          }}>
            {messages.length < 4 && (
              <div style={{ fontSize: "0.74rem", color: "var(--color-muted)", marginBottom: 8, textAlign: "center" }}>
                Type your explanation below. Explain as clearly as you can — the AI will probe for gaps.
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <textarea
                ref={textareaRef}
                value={voiceListening ? (input ? input + " " + interimTranscript : interimTranscript) : input}
                onChange={(e) => !voiceListening && setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder={voiceListening ? "Listening… speak your explanation" : "Type your explanation… (Enter to send, Shift+Enter for new line)"}
                rows={3}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg)", color: "var(--color-text)",
                  fontSize: "0.88rem", fontFamily: "inherit", resize: "none",
                  lineHeight: 1.5,
                }}
              />
              {voiceSupported && (
                <button
                  onClick={toggleVoice}
                  title={voiceListening ? "Stop recording" : "Voice input"}
                  style={{
                    padding: "0 14px", borderRadius: 10, border: "1px solid var(--color-border)",
                    background: voiceListening ? "#ef5350" : "var(--color-bg-raised)",
                    color: voiceListening ? "#fff" : "var(--color-muted)",
                    fontSize: "1rem", cursor: "pointer", alignSelf: "stretch",
                    transition: "all 0.15s",
                    animation: voiceListening ? "pulse 1.2s ease-in-out infinite" : "none",
                  }}
                >
                  🎙
                </button>
              )}
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                style={{
                  padding: "0 18px", borderRadius: 10, border: "none",
                  background: input.trim() && !loading ? color : "var(--color-border)",
                  color: input.trim() && !loading ? "#fff" : "var(--color-muted)",
                  fontSize: "1rem", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  transition: "all 0.15s", alignSelf: "stretch",
                }}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score Phase */}
      {phase === "scored" && score && (
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div style={{ maxWidth: 620, margin: "0 auto" }}>

            {/* Overall score */}
            <div style={{
              background: "var(--color-bg-card)", borderRadius: 16,
              border: "1px solid var(--color-border)", padding: "28px 28px 24px",
              marginBottom: 16, textAlign: "center",
            }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                Session Complete · {activeTopic}
              </div>
              <div style={{
                width: 90, height: 90, borderRadius: "50%", margin: "0 auto 12px",
                border: `4px solid ${scoreColor(score.overallScore)}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column",
              }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: scoreColor(score.overallScore), lineHeight: 1 }}>
                  {score.overallScore}
                </div>
                <div style={{ fontSize: "0.62rem", color: "var(--color-muted)" }}>/ 100</div>
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
                {score.readinessLevel}
              </div>
              <div style={{ fontSize: "0.84rem", color: "var(--color-muted)", lineHeight: 1.55, maxWidth: 420, margin: "0 auto" }}>
                {score.summary}
              </div>
            </div>

            {/* Sub-topic scores */}
            {score.subTopicScores?.length > 0 && (
              <div style={{
                background: "var(--color-bg-card)", borderRadius: 14,
                border: "1px solid var(--color-border)", padding: "20px 24px", marginBottom: 16,
              }}>
                <div style={{ fontSize: "0.72rem", color: "var(--color-muted)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 14 }}>
                  Sub-topic Breakdown
                </div>
                {score.subTopicScores.map((st) => (
                  <div key={st.topic} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.82rem" }}>
                      <span style={{ color: "var(--color-text)" }}>{st.topic}</span>
                      <span style={{ color: scoreColor(st.score), fontWeight: 600 }}>{st.score}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 4, background: "var(--color-border)" }}>
                      <div style={{
                        height: "100%", borderRadius: 4,
                        width: `${st.score}%`, background: scoreColor(st.score),
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Strengths & Gaps */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{
                background: "var(--color-bg-card)", borderRadius: 14,
                border: "1px solid var(--color-border)", padding: "18px 20px",
              }}>
                <div style={{ fontSize: "0.72rem", color: "#2ac46e", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                  Strengths
                </div>
                {score.strengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: "0.82rem", color: "var(--color-text)", lineHeight: 1.4 }}>
                    <span style={{ color: "#2ac46e", flexShrink: 0 }}>✓</span>{s}
                  </div>
                ))}
              </div>
              <div style={{
                background: "var(--color-bg-card)", borderRadius: 14,
                border: "1px solid var(--color-border)", padding: "18px 20px",
              }}>
                <div style={{ fontSize: "0.72rem", color: "#ef5350", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                  Gaps to Address
                </div>
                {score.gaps.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: "0.82rem", color: "var(--color-text)", lineHeight: 1.4 }}>
                    <span style={{ color: "#ef5350", flexShrink: 0 }}>✗</span>{g}
                  </div>
                ))}
              </div>
            </div>

            {/* Next steps */}
            <div style={{
              background: `${color}12`, borderRadius: 14,
              border: `1px solid ${color}30`, padding: "18px 20px", marginBottom: 24,
            }}>
              <div style={{ fontSize: "0.72rem", color, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>
                Recommended Next Step
              </div>
              <div style={{ fontSize: "0.86rem", color: "var(--color-text)", lineHeight: 1.55 }}>
                {score.nextSteps}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={reset}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "none",
                  background: color, color: "#fff", fontSize: "0.88rem",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                Teach Another Concept
              </button>
              <button
                onClick={() => setPhase("session")}
                style={{
                  padding: "12px 20px", borderRadius: 10,
                  border: "1px solid var(--color-border)",
                  background: "transparent", color: "var(--color-muted)",
                  fontSize: "0.88rem", cursor: "pointer",
                }}
              >
                Review Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
