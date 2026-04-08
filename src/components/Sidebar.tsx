"use client";

import { useState, useEffect, useCallback } from "react";

interface HistoryItem {
  id: string;
  type: "chat" | "podcast";
  title: string;
  subtitle: string;
  date: string;
}

interface Props {
  courses: any[];
  activeId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  user: any;
  onSignOut: () => void;
  onNavigate?: (courseId: string, tab: string, itemId?: string) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  courseColor?: string;
}

const STUDY_MODES = [
  { key: "chat",     icon: "💬", label: "Chat Tutor" },
  { key: "podcast",  icon: "🎧", label: "Podcast" },
  { key: "videos",   icon: "🎬", label: "Videos" },
  { key: "map",      icon: "🗺", label: "Mind Map" },
  { key: "brain",    icon: "🧠", label: "Brain Search" },
];

const TOOLS = [
  { key: "plan",     icon: "🏆", label: "Study Plan" },
  { key: "cards",    icon: "🃏", label: "Flashcards" },
  { key: "practice", icon: "🧠", label: "Practice Quiz" },
  { key: "feynman",  icon: "🧑‍🏫", label: "Feynman Mode" },
  { key: "insights", icon: "📊", label: "Insights" },
  { key: "worklab",  icon: "⚗️", label: "Work Lab" },
];

export default function Sidebar({
  courses, activeId, onSelect, open, user, onSignOut, onNavigate,
  activeTab, onTabChange, courseColor,
}: Props) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/courses/${activeId}/history`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    }
    setHistoryLoaded(true);
  }, [activeId]);

  useEffect(() => {
    if (activeId) {
      setHistoryLoaded(false);
      loadHistory();
    }
  }, [activeId, loadHistory]);

  const handleHistoryClick = (item: HistoryItem) => {
    if (!activeId || !onNavigate) return;
    if (item.type === "chat") onNavigate(activeId, "chat", item.id);
    else if (item.type === "podcast") onNavigate(activeId, "podcast", item.id);
  };

  if (!open) return null;

  const accentBg = courseColor ? `${courseColor}18` : "var(--color-bg-raised)";
  const accentText = courseColor || "var(--color-text)";

  return (
    <div className="dash-sidebar">

      {/* Preferences */}
      <div className="dash-sidebar-section">
        <button
          className="dash-nav-item"
          style={activeTab === "customize" ? { background: accentBg, color: accentText, fontWeight: 500 } : { color: "var(--color-muted)", fontSize: "0.78rem" }}
          onClick={() => onTabChange?.("customize")}
        >
          <span className="dash-nav-icon">⚙️</span>
          Preferences
        </button>
      </div>

      {/* Study Modes */}
      {activeId && (
        <div className="dash-sidebar-section">
          <div className="dash-sidebar-label">Study Modes</div>
          {STUDY_MODES.map((m) => {
            const isActive = activeTab === m.key;
            return (
              <button
                key={m.key}
                className="dash-nav-item"
                style={isActive ? { background: accentBg, color: accentText, fontWeight: 500 } : undefined}
                onClick={() => onTabChange?.(m.key)}
              >
                <span className="dash-nav-icon" style={isActive ? { opacity: 1 } : undefined}>{m.icon}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Test Tools */}
      {activeId && (
        <div className="dash-sidebar-section">
          <div className="dash-sidebar-label">Test Tools</div>
          {TOOLS.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                className="dash-nav-item"
                style={isActive ? { background: accentBg, color: accentText, fontWeight: 500 } : undefined}
                onClick={() => onTabChange?.(t.key)}
              >
                <span className="dash-nav-icon" style={isActive ? { opacity: 1 } : undefined}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat History */}
      {activeId && historyLoaded && history.length > 0 && (
        <div className="dash-sidebar-section">
          <div className="dash-sidebar-label">Chat History</div>
          {history.slice(0, 5).map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              className="dash-nav-item"
              style={{ fontSize: "0.76rem", color: "var(--color-muted)" }}
              onClick={() => handleHistoryClick(item)}
            >
              <span className="dash-nav-icon" style={{ fontSize: "0.7rem" }}>
                {item.type === "chat" ? "↩" : "🎙"}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
