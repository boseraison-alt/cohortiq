"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { t, type Lang } from "@/lib/i18n";
import { useVoiceInput } from "@/hooks/useVoiceInput";

interface Props {
  courseId: string;
  color: string;
  name: string;
  initialSessionId?: string | null;
  onAction?: (action: string, context?: string) => void;
  lang?: Lang;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  followUps?: string[];
  isPhotoResponse?: boolean;
  depthChoice?: boolean; // true = show comprehensive/brief buttons
  pendingQuery?: string; // the original question waiting for depth choice
}

interface Session {
  id: string;
  title: string;
  messageCount: number;
  date: string;
}

interface PendingImage {
  base64: string;
  mediaType: string;
  previewUrl: string;
}

export default function ChatTab({ courseId, color, name, initialSessionId, onAction, lang = "en" }: Props) {
  const T = (key: string, vars?: Record<string, string>) => t(key, lang, vars);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSessionId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const { listening: voiceListening, supported: voiceSupported, toggle: toggleVoice, interimTranscript } =
    useVoiceInput({ onTranscript: (t) => setInput((prev) => prev ? prev + " " + t : t) });
  const [devilsAdvocate, setDevilsAdvocate] = useState(false);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [imageSubmitState, setImageSubmitState] = useState<"idle" | "submitted" | "error">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sessionsOpen, setSessionsOpen] = useState(true);

  useEffect(() => {
    setSessionsOpen(localStorage.getItem("chat_sessions_open") !== "false");
  }, []);

  const toggleSessions = () => {
    setSessionsOpen((prev) => {
      const next = !prev;
      localStorage.setItem("chat_sessions_open", String(next));
      return next;
    });
  };

  // Load sessions list
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/history`);
      const data = await res.json();
      const chatSessions = (data as any[])
        .filter((h) => h.type === "chat")
        .map((h) => ({
          id: h.id,
          title: h.title,
          messageCount: parseInt(h.subtitle) || 0,
          date: h.date,
        }));
      setSessions(chatSessions);
    } catch {}
  }, [courseId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load a session's messages
  const loadSession = useCallback(async (sid: string) => {
    setActiveSessionId(sid);
    try {
      const res = await fetch(`/api/ai/chat/${sid}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(
          data.messages.map((m: any) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        );
      }
    } catch {}
  }, []);

  // Load initial session if provided
  useEffect(() => {
    if (initialSessionId) {
      loadSession(initialSessionId);
    }
  }, [initialSessionId, loadSession]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    setPendingImage(null);
    setImageSubmitState("idle");
  };

  const deleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/ai/chat/${sid}`, { method: "DELETE" });
    if (activeSessionId === sid) startNewChat();
    loadSessions();
  };

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setPendingImage({ base64, mediaType: file.type, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  // Detect broad questions that should offer depth choice
  const isBroad = (q: string) => {
    const l = q.toLowerCase().trim();
    return /^(explain|summarize|overview|recap|review|teach|walk.?through|tell me about|what is|describe)\s/i.test(l)
      && (/\b(chapter|topic|section|module|unit|all|everything|whole|entire|full)\b/i.test(l) || l.split(/\s+/).length <= 6);
  };

  const sendWithMode = async (q: string, mode: "auto" | "comprehensive" | "summary", imgToSend?: PendingImage | null) => {
    setBusy(true);
    setImageSubmitState("idle");
    // Remove depth choice message if present
    setMessages((p) => p.filter((m) => !m.depthChoice));

    const body: Record<string, any> = {
      courseId,
      sessionId: activeSessionId,
      message: q,
      devilsAdvocate,
      answerMode: mode,
    };
    if (imgToSend) {
      body.imageBase64 = imgToSend.base64;
      body.imageMediaType = imgToSend.mediaType;
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((p) => [...p, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages((p) => [
          ...p,
          {
            role: "assistant",
            content: data.answer,
            followUps: data.followUps || [],
            isPhotoResponse: !!data.hasImage,
          },
        ]);
        if (!activeSessionId && data.sessionId) setActiveSessionId(data.sessionId);
        loadSessions();
        if (data.action && onAction) {
          const conversationContext = [...messages, { role: "user" as const, content: q }, { role: "assistant" as const, content: data.answer }]
            .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
            .join("\n\n");
          setTimeout(() => onAction(data.action, conversationContext), 800);
        }
      }
    } catch (e: any) {
      setMessages((p) => [...p, { role: "assistant", content: `Error: ${e.message}` }]);
    }
    setBusy(false);
  };

  const send = async () => {
    if ((!input.trim() && !pendingImage) || busy) return;
    const q = input.trim();
    const imgToSend = pendingImage;

    setMessages((p) => [...p, { role: "user", content: q || "[Photo attached]" }]);
    setInput("");
    setPendingImage(null);

    // If broad question, ask user for depth preference
    if (q && isBroad(q) && !imgToSend) {
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          content: "I can give you a comprehensive answer covering every learning objective, formula, and example — or a brief summary with key takeaways. Which would you prefer?",
          depthChoice: true,
          pendingQuery: q,
        },
      ]);
      return;
    }

    // Not broad — send with auto mode
    await sendWithMode(q, "auto", imgToSend);
  };

  const handleDepthChoice = (mode: "comprehensive" | "summary", query: string) => {
    sendWithMode(query, mode);
  };

  const sendFollowUp = (q: string) => {
    setInput(q);
    setTimeout(() => {
      setInput("");
      setMessages((p) => [...p, { role: "user", content: q }]);
      setBusy(true);
      fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, sessionId: activeSessionId, message: q, devilsAdvocate, answerMode: "auto" }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setMessages((p) => [...p, { role: "assistant", content: `Error: ${data.error}` }]);
          } else {
            setMessages((p) => [...p, { role: "assistant", content: data.answer, followUps: data.followUps || [] }]);
            if (!activeSessionId && data.sessionId) setActiveSessionId(data.sessionId);
            loadSessions();
            if (data.action && onAction) {
              const conversationContext = [...messages, { role: "user" as const, content: q }, { role: "assistant" as const, content: data.answer }]
                .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
                .join("\n\n");
              setTimeout(() => onAction(data.action, conversationContext), 800);
            }
          }
        })
        .catch((e) => setMessages((p) => [...p, { role: "assistant", content: `Error: ${e.message}` }]))
        .finally(() => setBusy(false));
    }, 0);
  };

  const submitAsCourseMaterial = async (content: string) => {
    setImageSubmitState("submitted");
    try {
      const res = await fetch(`/api/courses/${courseId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Photo Note — ${new Date().toLocaleDateString()}`,
          content,
          sourceType: "photo",
        }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setImageSubmitState("error");
    }
  };

  return (
    <div className="h-full flex">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }}
      />

      {/* Sessions sidebar — collapsible */}
      {!sessionsOpen ? (
        <div
          className="border-r border-border flex flex-col items-center pt-2 bg-bg"
          style={{ width: 32, minWidth: 32, flexShrink: 0 }}
        >
          <button
            onClick={toggleSessions}
            title="Show chat sessions"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
            style={{ color: "var(--color-muted)", fontSize: 16, background: "transparent", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >›</button>
        </div>
      ) : (
        <div className="border-r border-border flex flex-col bg-bg" style={{ width: 208, minWidth: 208, flexShrink: 0 }}>
          <div className="px-3 py-3 border-b border-border flex items-center gap-2">
            <button
              onClick={startNewChat}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-bg"
              style={{ background: color }}
            >
              {T("chat.new_chat")}
            </button>
            <button
              onClick={toggleSessions}
              title="Collapse"
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg transition-all"
              style={{ color: "var(--color-muted)", fontSize: 16, background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >‹</button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`px-3 py-2.5 rounded-lg mb-1 cursor-pointer transition-all group ${
                  s.id === activeSessionId
                    ? "bg-bg-raised border border-border-light"
                    : "hover:bg-bg-raised/50 border border-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-medium truncate flex-1 leading-tight" style={{ color: "var(--color-text)" }}>
                    {s.title}
                  </p>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="text-muted hover:text-danger text-[12px] opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    x
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--color-muted-light)" }}>
                  {s.messageCount} msgs · {new Date(s.date).toLocaleDateString()}
                </p>
              </div>
            ))}
            {!sessions.length && (
              <p className="text-[12px] text-muted text-center py-4">{T("chat.no_conversations")}</p>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {!messages.length && (
            <div className="text-center py-14">
              <div className="text-3xl mb-3">💬</div>
              <p className="font-serif text-xl font-semibold" style={{ color: "var(--color-text)" }}>{T("chat.empty_title", { name })}</p>
              <p className="text-sm mt-2 max-w-md mx-auto leading-relaxed" style={{ color: "var(--color-muted-light)" }}>{T("chat.empty_desc")}</p>
              <div className="mt-4 flex gap-2 justify-center flex-wrap">
                {[T("chat.starter_1"), T("chat.starter_2"), T("chat.starter_3")].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="bg-bg-card border border-border-light rounded-lg px-3 py-2 text-sm font-medium hover:bg-bg-raised transition-all"
                    style={{ color: "var(--color-muted-light)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => {
            const isLastAssistant = m.role === "assistant" && i === messages.length - 1 && !busy;
            return (
              <div key={i} className={`flex flex-col mb-3 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className="max-w-[80%] px-4 py-3 rounded-xl text-base leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: m.role === "user" ? color + "20" : "var(--color-bg-card)",
                    border: `1px solid ${m.role === "user" ? color + "40" : "var(--color-border)"}`,
                    color: "var(--color-text)",
                  }}
                >
                  {m.content}
                </div>

                {/* Photo material submission banner */}
                {isLastAssistant && m.isPhotoResponse && (
                  <div
                    className="mt-2 max-w-[80%] flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs"
                    style={{ background: color + "10", borderColor: color + "30" }}
                  >
                    {imageSubmitState === "submitted" ? (
                      <span style={{ color }}>✓ Submitted — pending admin approval</span>
                    ) : imageSubmitState === "error" ? (
                      <span className="text-red-400">Failed to submit. Try again.</span>
                    ) : (
                      <>
                        <span style={{ color: "var(--color-muted-light)" }}>
                          💾 Submit this content as course material for admin review?
                        </span>
                        <button
                          onClick={() => submitAsCourseMaterial(m.content)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold text-white shrink-0"
                          style={{ background: color }}
                        >
                          Submit
                        </button>
                        <button
                          onClick={() => setImageSubmitState("submitted")}
                          className="px-2 py-1 rounded-lg text-xs shrink-0"
                          style={{ color: "var(--color-muted)" }}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Depth choice buttons */}
                {m.depthChoice && m.pendingQuery && (
                  <div className="mt-3 flex flex-col gap-2 max-w-[80%]">
                    <button
                      onClick={() => handleDepthChoice("comprehensive", m.pendingQuery!)}
                      disabled={busy}
                      className="text-left px-4 py-3 rounded-xl text-sm border transition-all hover:opacity-90"
                      style={{ background: color + "10", borderColor: color + "40", color }}
                    >
                      <span className="font-semibold">📖 Comprehensive</span>
                      <span className="block mt-0.5 opacity-70">Every learning objective, all formulas, comparison tables, examples, glossary</span>
                    </button>
                    <button
                      onClick={() => handleDepthChoice("summary", m.pendingQuery!)}
                      disabled={busy}
                      className="text-left px-4 py-3 rounded-xl text-sm border transition-all hover:opacity-90"
                      style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
                    >
                      <span className="font-semibold">📝 Brief Summary</span>
                      <span className="block mt-0.5 opacity-70">Key takeaways, essential formulas, under 200 words</span>
                    </button>
                  </div>
                )}

                {isLastAssistant && m.followUps && m.followUps.length > 0 && (
                  <div className="mt-2 max-w-[80%]">
                    <p className="text-xs text-muted-light font-semibold uppercase tracking-wider mb-1.5">{T("chat.where_next")}</p>
                    <div className="flex flex-col gap-1.5">
                      {m.followUps.map((q, qi) => (
                        <button
                          key={qi}
                          onClick={() => sendFollowUp(q)}
                          disabled={busy}
                          className="text-left px-3 py-2 rounded-lg text-sm border transition-all hover:opacity-90"
                          style={{ background: color + "10", borderColor: color + "30", color }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {busy && (
            <div className="flex justify-start mb-3">
              <div className="px-4 py-3 rounded-xl bg-bg-card border border-border text-sm flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: color, animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: color, animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: color, animationDelay: "300ms" }} />
                </div>
                <span className="text-xs" style={{ color }}>{T("chat.thinking")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Image thumbnail preview */}
        {pendingImage && (
          <div className="px-5 pt-2 flex items-center gap-2">
            <div className="relative">
              <img
                src={pendingImage.previewUrl}
                alt="Attached"
                className="h-16 w-16 object-cover rounded-lg border"
                style={{ borderColor: color + "60" }}
              />
              <button
                onClick={() => setPendingImage(null)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[12px] font-bold flex items-center justify-center text-white"
                style={{ background: "var(--color-muted)" }}
              >
                ✕
              </button>
            </div>
            <span className="text-[13px] text-muted">Photo attached — ask a question about it</span>
          </div>
        )}

        {/* Input bar */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          {/* Photo button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title="Attach a photo"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border transition-all text-base"
            style={{
              borderColor: pendingImage ? color : "var(--color-border-light)",
              background: pendingImage ? color + "15" : "transparent",
              color: pendingImage ? color : "var(--color-muted)",
            }}
          >
            📷
          </button>

          {/* Devil's Advocate toggle */}
          <button
            onClick={() => setDevilsAdvocate((v) => !v)}
            disabled={busy}
            title={devilsAdvocate ? "Devil's Advocate ON — AI will challenge you" : "Devil's Advocate OFF"}
            className="shrink-0 flex items-center gap-1.5 px-2.5 h-9 rounded-xl border text-xs font-semibold transition-all"
            style={{
              borderColor: devilsAdvocate ? color : "var(--color-border-light)",
              background: devilsAdvocate ? color : "transparent",
              color: devilsAdvocate ? "#fff" : "var(--color-muted)",
            }}
          >
            <span>⚔️</span>
            <span className="hidden sm:inline">Challenge</span>
          </button>

          <input
            value={voiceListening ? (input ? input + " " + interimTranscript : interimTranscript) : input}
            onChange={(e) => !voiceListening && setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            disabled={busy}
            placeholder={voiceListening ? "Listening…" : devilsAdvocate ? "State your position — I'll push back…" : T("chat.placeholder")}
            className="flex-1 bg-bg-card border border-border-light rounded-xl px-4 py-3 text-base outline-none focus:border-[#555B66] transition-all"
            style={{ color: voiceListening ? "var(--color-muted)" : "var(--color-text)" }}
          />
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              disabled={busy}
              title={voiceListening ? "Stop recording" : "Voice input"}
              className="rounded-xl px-3 py-3 text-sm transition-all shrink-0"
              style={{
                background: voiceListening ? "#ef5350" : "var(--color-bg-raised)",
                color: voiceListening ? "#fff" : "var(--color-muted)",
                border: "1px solid var(--color-border-light)",
                animation: voiceListening ? "pulse 1.2s ease-in-out infinite" : "none",
              }}
            >
              🎙
            </button>
          )}
          <button
            onClick={send}
            disabled={busy || (!input.trim() && !pendingImage)}
            className="rounded-xl px-5 py-3 text-base font-semibold text-bg transition-all"
            style={{ background: (input.trim() || pendingImage) && !busy ? color : "var(--color-border-light)" }}
          >
            {T("chat.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
