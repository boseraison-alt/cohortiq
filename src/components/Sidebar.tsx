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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const STUDY_MODES = [
  { key: "chat",     icon: "💬", label: "Chat Tutor" },
  { key: "podcast",  icon: "🎧", label: "Podcast" },
  { key: "videos",   icon: "🎬", label: "Videos" },
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
  activeTab, onTabChange, courseColor, collapsed, onToggleCollapse,
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

  // ── Collapsed icon-only view ──
  if (collapsed) {
    return (
      <div style={{
        width: 44, minWidth: 44, flexShrink: 0,
        background: "var(--color-bg-card)",
        borderRight: "1px solid var(--color-border)",
        display: "flex", flexDirection: "column",
        alignItems: "center", paddingTop: 8, paddingBottom: 16,
        gap: 2, overflowY: "auto",
      }}>
        {/* Expand button */}
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          style={{
            width: 32, height: 32, borderRadius: 8, border: "none",
            background: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--color-muted)", fontSize: 18, marginBottom: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >›</button>

        {/* Preferences */}
        <button
          onClick={() => onTabChange?.("customize")}
          title="Preferences"
          className="dash-nav-item"
          style={{ justifyContent: "center", padding: "8px 0", width: 36,
            ...(activeTab === "customize" ? { background: accentBg } : {}) }}
        >
          <span className="dash-nav-icon" style={{ width: "auto" }}>⚙️</span>
        </button>

        {/* Divider */}
        {activeId && <div style={{ width: 24, height: 1, background: "var(--color-border)", margin: "4px 0" }} />}

        {/* Study modes */}
        {activeId && STUDY_MODES.map((m) => {
          const isActive = activeTab === m.key;
          return (
            <button key={m.key} className="dash-nav-item" title={m.label}
              style={{ justifyContent: "center", padding: "8px 0", width: 36,
                ...(isActive ? { background: accentBg, color: accentText } : {}) }}
              onClick={() => onTabChange?.(m.key)}>
              <span className="dash-nav-icon" style={{ width: "auto", opacity: isActive ? 1 : 0.85 }}>{m.icon}</span>
            </button>
          );
        })}

        {/* Divider */}
        {activeId && <div style={{ width: 24, height: 1, background: "var(--color-border)", margin: "4px 0" }} />}

        {/* Test tools */}
        {activeId && TOOLS.map((tool) => {
          const isActive = activeTab === tool.key;
          return (
            <button key={tool.key} className="dash-nav-item" title={tool.label}
              style={{ justifyContent: "center", padding: "8px 0", width: 36,
                ...(isActive ? { background: accentBg, color: accentText } : {}) }}
              onClick={() => onTabChange?.(tool.key)}>
              <span className="dash-nav-icon" style={{ width: "auto", opacity: isActive ? 1 : 0.85 }}>{tool.icon}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="dash-sidebar">

      {/* Collapse toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 4 }}>
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          className="dash-nav-item"
          style={{ justifyContent: "center", padding: "5px 8px", width: 30, color: "var(--color-muted)", fontSize: 16 }}
        >‹</button>
      </div>

      {/* Preferences */}
      <div className="dash-sidebar-section">
        <button
          className="dash-nav-item"
          style={activeTab === "customize" ? { background: accentBg, color: accentText, fontWeight: 500 } : undefined}
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
              onClick={() => handleHistoryClick(item)}
            >
              <span className="dash-nav-icon">
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
