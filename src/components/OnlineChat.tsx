"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface OnlineUser {
  id: string;
  name: string | null;
  email: string;
  lastSeen: string;
}

interface DM {
  id: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  read: boolean;
  createdAt: string;
}

interface Props {
  currentUserId: string;
  color: string;
}

function displayName(u: OnlineUser) {
  return u.name || u.email.split("@")[0];
}

function initials(u: OnlineUser) {
  const n = displayName(u);
  return n.slice(0, 2).toUpperCase();
}

export default function OnlineChat({ currentUserId, color }: Props) {
  const [open, setOpen] = useState(false);
  const [chatUser, setChatUser] = useState<OnlineUser | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [messages, setMessages] = useState<DM[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  // ── Heartbeat: update presence + get online users every 20s ──
  const heartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/presence", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setOnlineUsers(data.online || []);
      }
    } catch {}
  }, []);

  // ── Poll unread counts every 10s ──
  const pollUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/dm/unread");
      if (res.ok) {
        const data = await res.json();
        setUnread(data.counts || {});
      }
    } catch {}
  }, []);

  // ── Load messages for open chat ──
  const loadMessages = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/dm/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        // Clear unread for this user
        setUnread((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    } catch {}
  }, []);

  // Initial heartbeat + intervals
  useEffect(() => {
    heartbeat();
    pollUnread();
    pollRef.current = setInterval(heartbeat, 20_000);
    const unreadInterval = setInterval(pollUnread, 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(unreadInterval);
    };
  }, [heartbeat, pollUnread]);

  // Poll messages when chat is open
  useEffect(() => {
    if (msgPollRef.current) clearInterval(msgPollRef.current);
    if (chatUser) {
      loadMessages(chatUser.id);
      msgPollRef.current = setInterval(() => loadMessages(chatUser.id), 3_000);
    }
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [chatUser, loadMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opening chat
  useEffect(() => {
    if (chatUser) setTimeout(() => inputRef.current?.focus(), 100);
  }, [chatUser]);

  const openChat = (user: OnlineUser) => {
    setChatUser(user);
    setOpen(true);
  };

  const closeChat = () => {
    setChatUser(null);
    setMessages([]);
  };

  const send = async () => {
    if (!input.trim() || !chatUser || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    // Optimistic update
    const optimistic: DM = {
      id: `opt-${Date.now()}`,
      fromUserId: currentUserId,
      toUserId: chatUser.id,
      content,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await fetch(`/api/dm/${chatUser.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      // Refresh messages
      await loadMessages(chatUser.id);
    } catch {}
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">

      {/* ── Panel ── */}
      {open && (
        <div
          className="rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
          style={{
            width: 300,
            maxHeight: 480,
            background: "var(--color-bg-card)",
            borderColor: "var(--color-border)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
            {chatUser ? (
              <>
                <button onClick={closeChat}
                  className="text-muted hover:text-muted-light text-xs px-1.5 py-1 rounded transition-all"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  ‹ Back
                </button>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                  style={{ background: color + "30", color }}>
                  {initials(chatUser)}
                </div>
                <p className="text-xs font-semibold truncate flex-1" style={{ color: "var(--color-text)" }}>{displayName(chatUser)}</p>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Online" />
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <p className="text-xs font-semibold flex-1" style={{ color: "var(--color-text)" }}>
                  {onlineUsers.length > 0
                    ? `${onlineUsers.length} online`
                    : "No one else online"}
                </p>
              </>
            )}
            <button onClick={() => { setOpen(false); closeChat(); }}
              className="text-muted hover:text-muted-light text-xs px-1.5 py-1 rounded transition-all ml-auto"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              ✕
            </button>
          </div>

          {/* Chat view */}
          {chatUser ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ minHeight: 200, background: "var(--color-bg)" }}>
                {messages.length === 0 && (
                  <p className="text-[13px] text-muted text-center py-6">
                    Start a conversation with {displayName(chatUser)}
                  </p>
                )}
                {messages.map((m) => {
                  const isMe = m.fromUserId === currentUserId;
                  return (
                    <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed"
                        style={{
                          background: isMe ? color : "var(--color-bg-raised)",
                          color: isMe ? "#fff" : "var(--color-text)",
                          borderRadius: isMe ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                          border: isMe ? "none" : `1px solid var(--color-border)`,
                        }}
                      >
                        <p>{m.content}</p>
                        <p className="mt-0.5 text-[13px] opacity-60 text-right">{formatTime(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t px-3 py-2.5 flex gap-2 items-center shrink-0"
                style={{ borderColor: "var(--color-border)", background: "var(--color-bg-card)" }}>
                <input
                  ref={inputRef}
                  value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Message…"
                  className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none border transition-all"
                  style={{
                    background: "var(--color-bg-raised)",
                    color: "var(--color-text)",
                    borderColor: "var(--color-border)",
                  }}
                />
                <button onClick={send} disabled={!input.trim() || sending}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40"
                  style={{ background: color, color: "#fff" }}>
                  ↑
                </button>
              </div>
            </>
          ) : (
            /* Online users list */
            <div className="flex-1 overflow-y-auto py-1" style={{ background: "var(--color-bg-card)" }}>
              {onlineUsers.length === 0 ? (
                <p className="text-[13px] text-muted text-center py-8 px-4 leading-relaxed">
                  No other users are online right now.
                  <br />They&apos;ll appear here when they log in.
                </p>
              ) : (
                onlineUsers.map((u) => (
                  <button key={u.id} onClick={() => openChat(u)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 transition-all text-left"
                    style={{ background: "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold"
                        style={{ background: color + "25", color }}>
                        {initials(u)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400"
                        style={{ border: `2px solid var(--color-bg-card)` }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text)" }}>{displayName(u)}</p>
                      <p className="text-[12px] text-muted">Online now</p>
                    </div>
                    {unread[u.id] > 0 && (
                      <span className="text-[13px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0"
                        style={{ background: color, color: "#fff" }}>
                        {unread[u.id]}
                      </span>
                    )}
                    <span className="text-muted text-xs">›</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Toggle button ── */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open) closeChat(); }}
        className="flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-semibold shadow-lg transition-all hover:scale-105 active:scale-95 border"
        style={{
          background: open ? color : "var(--color-bg-card)",
          color: open ? "#fff" : color,
          borderColor: color + "40",
          boxShadow: `0 4px 20px ${color}25`,
        }}
      >
        <span className="relative flex items-center">
          <span className="text-sm">👥</span>
          {!open && totalUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[13px] font-bold flex items-center justify-center"
              style={{ background: "#EF5350", color: "#fff" }}>
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </span>
        <span>
          {onlineUsers.length > 0
            ? `${onlineUsers.length} online`
            : "Online"}
        </span>
        {!open && onlineUsers.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        )}
      </button>
    </div>
  );
}
