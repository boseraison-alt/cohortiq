"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import ChatTab from "@/components/ChatTab";
import PodcastTab from "@/components/PodcastTab";
import PracticeTab from "@/components/PracticeTab";
import FlashcardsTab from "@/components/FlashcardsTab";
import PerformanceTab from "@/components/PerformanceTab";
import VideosTab from "@/components/VideosTab";
import StudyPlanTab from "@/components/StudyPlanTab";
import { t, LANGUAGES, langMeta, type Lang } from "@/lib/i18n";
import OnlineChat from "@/components/OnlineChat";
import ThemePicker from "@/components/ThemePicker";
import BrainSearch from "@/components/BrainSearch";
import CustomizeTab from "@/components/CustomizeTab";
import ConceptMapTab from "@/components/ConceptMapTab";
import WorkLabTab from "@/components/WorkLabTab";
import FeynmanTab from "@/components/FeynmanTab";

// ── User Credits Tab ────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  qa: "Chat Q&A", practice: "Practice Questions", grade: "AI Grading",
  podcast_script: "Podcast Script", podcast_audio: "Podcast Audio",
  flashcards: "Flashcards", podcast_audio_chunk: "Podcast Audio",
};

function UserCreditsTab({ color, lang }: { color: string; lang: Lang }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/usage")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><p className="text-muted text-sm">Loading…</p></div>;
  if (!data) return <div className="flex items-center justify-center h-full"><p className="text-muted text-sm">Failed to load usage data.</p></div>;

  const pct = data.creditsGranted > 0 ? Math.min(100, (data.creditsUsed / data.creditsGranted) * 100) : 0;
  const remaining = data.creditsRemaining;
  const barColor = pct > 80 ? "#EF5350" : pct > 60 ? "#FF9800" : color;

  return (
    <div className="h-full overflow-y-auto px-6 py-6 max-w-2xl mx-auto">
      <h2 className="font-serif text-xl font-bold mb-6" style={{ color }}>💳 {t("tab.credits", lang)}</h2>

      <div className="bg-bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[11px] text-muted uppercase tracking-widest mb-1">Credits Remaining</p>
            <p className="font-serif text-4xl font-bold" style={{ color: barColor }}>
              ${remaining.toFixed(2)}
            </p>
            <p className="text-xs text-muted mt-1">of ${data.creditsGranted.toFixed(2)} allocated</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted uppercase tracking-widest mb-1">Total Used</p>
            <p className="text-2xl font-bold font-serif text-accent">${data.creditsUsed.toFixed(4)}</p>
            <p className="text-xs text-muted mt-1">{data.totalCalls} API calls</p>
          </div>
        </div>

        <div className="h-3 bg-bg-raised rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted">{pct.toFixed(1)}% used</span>
          <span className="text-[10px] text-muted">{(100 - pct).toFixed(1)}% remaining</span>
        </div>
      </div>

      {Object.keys(data.byAction).length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Usage by Feature</h3>
          <div className="space-y-2">
            {Object.entries(data.byAction)
              .sort((a: any, b: any) => b[1].cost - a[1].cost)
              .map(([action, stats]: any) => (
                <div key={action} className="bg-bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                      {ACTION_LABELS[action] || action.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-muted">{stats.count} calls</p>
                  </div>
                  <p className="text-sm font-bold" style={{ color }}>${stats.cost.toFixed(4)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {data.recentLogs?.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Recent Activity</h3>
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            {data.recentLogs.slice(0, 10).map((log: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0">
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
                    {ACTION_LABELS[log.action] || log.action.replace(/_/g, " ")}
                  </p>
                  <p className="text-[10px] text-muted">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-xs font-semibold text-muted">${log.costUsd.toFixed(5)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.totalCalls === 0 && (
        <div className="flex flex-col items-center py-16 text-muted gap-3">
          <span className="text-4xl">💳</span>
          <p className="font-serif text-lg text-muted-light">No usage yet</p>
          <p className="text-xs">Start using CohortIQ features and your activity will appear here.</p>
        </div>
      )}
    </div>
  );
}

// ── Course Selector Dropdown ────────────────────────────────────────────────

function CourseSelector({
  courses,
  activeId,
  onSelect,
  color,
}: {
  courses: any[];
  activeId: string | null;
  onSelect: (id: string) => void;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const active = courses.find((c) => c.id === activeId);

  return (
    <div ref={ref} className="relative">
      <button
        className="dash-course-selector"
        onClick={() => setOpen(!open)}
      >
        <span className="dash-course-dot" style={{ background: color }} />
        {active?.name || "Select course"}
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && courses.length > 1 && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-xl shadow-2xl overflow-hidden min-w-[220px] border"
          style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border)" }}
        >
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c.id); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-all"
              style={{
                color: c.id === activeId ? "var(--color-text)" : "var(--color-muted)",
                background: "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
              <span className="font-medium">{c.name}</span>
              {c.id === activeId && <span className="ml-auto text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Language Picker ─────────────────────────────────────────────────────────

function LangPicker({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const meta = langMeta(lang);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all border"
        title="Change language"
        style={{
          background: "var(--color-bg-raised)",
          borderColor: "var(--color-border)",
          color: "var(--color-muted-light)",
        }}
      >
        <span className="text-base leading-none">{meta.flag}</span>
        <span className="hidden sm:inline" style={{ color: "var(--color-muted-light)" }}>{meta.label}</span>
        <span className="text-[10px]" style={{ color: "var(--color-muted)" }}>▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-2xl overflow-hidden min-w-[150px] border"
          style={{
            background: "var(--color-bg-card)",
            borderColor: "var(--color-border)",
          }}
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => { onChange(l.code); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-left transition-all"
              style={{
                color: l.code === lang ? "var(--color-text)" : "var(--color-muted)",
                background: "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-raised)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="font-medium">{l.label}</span>
              {l.code === lang && <span className="ml-auto text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

interface Course {
  id: string;
  name: string;
  color: string;
  _count: { materials: number; chunks: number; weeks: number };
  totalWords: number;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState("chat");
  const [brainOpen, setBrainOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [podcastAutoGenerate, setPodcastAutoGenerate] = useState(false);
  const [podcastCustomContext, setPodcastCustomContext] = useState<string | undefined>(undefined);

  // Accessibility prefs
  const [prefFont, setPrefFont] = useState("");
  const [prefReadingMode, setPrefReadingMode] = useState("");
  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((d) => {
        setPrefFont(d.font || "");
        setPrefReadingMode(d.readingMode || "");
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const handler = (e: Event) => {
      const { font, readingMode } = (e as CustomEvent).detail;
      setPrefFont(font || "");
      setPrefReadingMode(readingMode || "");
    };
    window.addEventListener("prefs-saved", handler);
    return () => window.removeEventListener("prefs-saved", handler);
  }, []);

  // Language
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("study_ai_lang") as Lang | null;
    if (saved && LANGUAGES.some((l) => l.code === saved)) setLang(saved);
  }, []);
  const changeLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem("study_ai_lang", l);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const code = (e as CustomEvent<string>).detail as Lang;
      if (LANGUAGES.some((l) => l.code === code)) setLang(code);
    };
    window.addEventListener("lang-changed", handler);
    return () => window.removeEventListener("lang-changed", handler);
  }, []);

  const course = courses.find((c) => c.id === activeId);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const loadCourses = useCallback(async () => {
    const res = await fetch("/api/courses");
    const data = await res.json();
    setCourses(data);
    if (data.length && !activeId) setActiveId(data[0].id);
  }, [activeId]);

  useEffect(() => {
    if (session) loadCourses();
  }, [session, loadCourses]);

  const handleNavigate = (courseId: string, targetTab: string, itemId?: string) => {
    setActiveId(courseId);
    setTab(targetTab);
    if (targetTab === "chat" && itemId) {
      setChatSessionId(itemId);
    } else {
      setChatSessionId(null);
    }
  };

  const handleTabChange = (newTab: string) => {
    if (newTab === "brain") { setBrainOpen(true); return; }
    setTab(newTab);
    if (newTab !== "chat") setChatSessionId(null);
    if (newTab !== "podcast") { setPodcastAutoGenerate(false); setPodcastCustomContext(undefined); }
  };

  const handleChatAction = (action: string, context?: string) => {
    if (action === "generate_podcast") {
      setPodcastCustomContext(context);
      setPodcastAutoGenerate(true);
      setTab("podcast");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted font-serif text-xl">{t("common.loading", lang)}</p>
      </div>
    );
  }

  if (!session) return null;

  const userInitials = ((session.user?.name || session.user?.email || "?").charAt(0)).toUpperCase() +
    ((session.user?.name || "").split(" ")[1]?.charAt(0) || "").toUpperCase();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Brain Search modal */}
      {brainOpen && <BrainSearch onClose={() => setBrainOpen(false)} />}

      {/* ── Topbar ── */}
      <div className="dash-topbar">
        <div className="dash-top-logo">Cohort<em>IQ</em></div>
        <div className="dash-top-divider" />

        {courses.length > 0 && (
          <CourseSelector
            courses={courses}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setTab("chat"); setChatSessionId(null); }}
            color={course?.color || "#c9a84c"}
          />
        )}


        <div className="flex-1" />

        <div className="flex items-center gap-2 shrink-0">
          {/* Add source */}
          {course && (
            <button
              onClick={() => router.push(`/admin`)}
              className="dash-top-btn"
              title="Add source material"
            >
              + Add source
            </button>
          )}



          {/* Theme / Lang subtle */}
          <ThemePicker />
          <LangPicker lang={lang} onChange={changeLang} />

          {/* Admin */}
          {(session.user as any)?.role === "admin" && (
            <button
              onClick={() => router.push("/admin")}
              className="dash-top-btn"
              style={{ color: course?.color || "#c9a84c", borderColor: course?.color || "#c9a84c" }}
              title="Admin"
            >
              🛡️
            </button>
          )}

          {/* Avatar + sign out */}
          <div
            className="dash-avatar"
            title={`${session.user?.name || session.user?.email} — click to sign out`}
            onClick={() => signOut({ callbackUrl: "/" })}
            style={{ cursor: "pointer" }}
          >
            {userInitials || "?"}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Main ── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          courses={courses}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setTab("chat"); setChatSessionId(null); }}
          open={true}
          user={session.user}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          onNavigate={handleNavigate}
          activeTab={tab}
          onTabChange={handleTabChange}
          courseColor={course?.color}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className={`flex-1 overflow-hidden${prefFont === "opendyslexic" ? " font-dyslexic" : ""}${prefReadingMode === "focused" ? " reading-focused" : ""}`}
          >
            {!course ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-4">
                <span className="text-5xl">📚</span>
                <p className="font-serif text-2xl text-muted-light">{t("dash.no_course", lang)}</p>
                <p className="text-sm">{t("dash.create_course", lang)}</p>
              </div>
            ) : tab === "videos" ? (
              <VideosTab courseId={activeId!} color={course.color} name={course.name} lang={lang} />
            ) : tab === "chat" ? (
              <ChatTab
                courseId={activeId!}
                color={course.color}
                name={course.name}
                initialSessionId={chatSessionId}
                onAction={handleChatAction}
                lang={lang}
              />
            ) : tab === "podcast" ? (
              <PodcastTab courseId={activeId!} color={course.color} name={course.name} autoGenerate={podcastAutoGenerate} customContext={podcastCustomContext} lang={lang} />
            ) : tab === "practice" ? (
              <PracticeTab courseId={activeId!} color={course.color} name={course.name} lang={lang} />
            ) : tab === "cards" ? (
              <FlashcardsTab courseId={activeId!} color={course.color} lang={lang} />
            ) : tab === "plan" ? (
              <StudyPlanTab
                courseId={activeId!} color={course.color} name={course.name}
                onNavigate={(tabKey) => { setTab(tabKey); }}
              />
            ) : tab === "map" ? (
              <ConceptMapTab courseId={activeId!} color={course.color} lang={lang} />
            ) : tab === "feynman" ? (
              <FeynmanTab courseId={activeId!} color={course.color} name={course.name} />
            ) : tab === "worklab" ? (
              <WorkLabTab courseId={activeId!} color={course.color} name={course.name} lang={lang} />
            ) : tab === "credits" ? (
              <UserCreditsTab color={course.color} lang={lang} />
            ) : tab === "customize" ? (
              <CustomizeTab color={course.color} lang={lang} />
            ) : (
              <PerformanceTab courseId={activeId!} color={course.color} lang={lang} />
            )}
          </div>
        </div>
      </div>

      {session && course && (
        <OnlineChat
          currentUserId={(session.user as any).id}
          color={course.color}
        />
      )}
    </div>
  );
}
