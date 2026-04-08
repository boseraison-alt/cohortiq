"use client";

import { useState, useEffect } from "react";
import { t, LANGUAGES, type Lang } from "@/lib/i18n";
import { THEMES, getSavedTheme, saveTheme, type ThemeId } from "@/lib/theme";

interface Props {
  color: string;
  lang?: Lang;
}

const INDUSTRIES = [
  "Healthcare", "Tech/SaaS", "Finance/Banking", "Consulting",
  "Manufacturing", "Retail/E-commerce", "Real Estate", "Energy",
  "Education", "Non-Profit", "Legal", "Media/Entertainment",
];

const EXAMPLE_OPTIONS = [
  { value: "maximize_examples", icon: "📊", label: "Maximize Examples", desc: "Real-world case studies, analogies, and industry scenarios" },
  { value: "balanced",          icon: "⚖️", label: "Balanced",          desc: "Mix of theory and practical examples (default)" },
  { value: "maximize_text",     icon: "📖", label: "Maximize Theory",   desc: "Deep theoretical explanations with selective examples" },
];

const LEVEL_OPTIONS = [
  { value: "5yo",        icon: "👶", label: "Like I'm 5" },
  { value: "highschool", icon: "🎓", label: "Learner" },
  { value: "manager",    icon: "💼", label: "Manager" },
  { value: "expert",     icon: "🎯", label: "Expert" },
];

const FONT_OPTIONS = [
  { value: "",               label: "None",         desc: "Default system font" },
  { value: "opendyslexic",   label: "OpenDyslexic", desc: "Weighted letters reduce visual flipping for dyslexic readers" },
];

const READING_OPTIONS = [
  { value: "",        label: "None",    desc: "Default layout" },
  { value: "focused", label: "Focused", desc: "Narrower column, larger line-height, more breathing room" },
];

export default function CustomizeTab({ color, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);

  const [industry, setIndustry] = useState("");
  const [examples, setExamples] = useState("balanced");
  const [level, setLevel] = useState("manager");
  const [font, setFont] = useState("");
  const [readingMode, setReadingMode] = useState("");
  const [theme, setTheme] = useState<ThemeId>(getSavedTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((d) => {
        setIndustry(d.industry || "");
        setExamples(d.examples || "balanced");
        setLevel(d.level || "manager");
        setFont(d.font || "");
        setReadingMode(d.readingMode || "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/user/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, examples, level, font, readingMode }),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    // Notify dashboard to reload accessibility prefs
    window.dispatchEvent(new CustomEvent("prefs-saved", { detail: { font, readingMode } }));
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">Loading…</div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6 max-w-2xl mx-auto">
      <h2 className="font-serif text-xl font-bold mb-1" style={{ color }}>
        ⚙️ {T("cust.title")}
      </h2>
      <p className="text-xs text-muted mb-6">
        These preferences apply to all AI-generated content: podcasts, videos, flashcards, practice questions, chat, and mind maps.
      </p>

      {/* ── 1. Industry ── */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-5">
        <h3 className="text-sm font-bold mb-1">{T("cust.industry")}</h3>
        <p className="text-[11px] text-muted mb-3">
          AI will use examples from your industry — even if the course materials don't mention it.
        </p>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder={T("cust.industry_ph")}
          className="w-full bg-bg-raised border border-border-light rounded-xl px-4 py-2.5 text-sm outline-none mb-3"
          style={{ color: "var(--color-text)" }}
        />
        <div className="flex flex-wrap gap-1.5">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind}
              onClick={() => setIndustry(ind)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all"
              style={{
                background: industry === ind ? color + "20" : "var(--color-bg)",
                borderColor: industry === ind ? color : "var(--color-border)",
                color: industry === ind ? color : "var(--color-muted)",
              }}
            >
              {ind}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Example vs Text ── */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-5">
        <h3 className="text-sm font-bold mb-1">{T("cust.examples")}</h3>
        <p className="text-[11px] text-muted mb-3">
          Control how much real-world content vs academic theory appears in generated material.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {EXAMPLE_OPTIONS.map((opt) => {
            const active = examples === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setExamples(opt.value)}
                className="text-left rounded-xl p-4 border-2 transition-all"
                style={{
                  borderColor: active ? color : "var(--color-border)",
                  background: active ? color + "10" : "var(--color-bg)",
                }}
              >
                <p className="text-lg mb-1">{opt.icon}</p>
                <p className="text-xs font-bold" style={{ color: active ? color : "var(--color-text)" }}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-muted mt-1 leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Explanation Level ── */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-bold mb-1">{T("cust.level")}</h3>
        <p className="text-[11px] text-muted mb-3">
          How complex should the language and explanations be?
        </p>
        <div className="flex gap-2 flex-wrap">
          {LEVEL_OPTIONS.map((opt) => {
            const active = level === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setLevel(opt.value)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all"
                style={{
                  borderColor: active ? color : "var(--color-border)",
                  background: active ? color + "15" : "var(--color-bg)",
                  color: active ? color : "var(--color-muted)",
                }}
              >
                <span className="text-base">{opt.icon}</span>
                <span className="text-xs font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Accessibility ── */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-bold mb-1">{T("cust.accessibility")}</h3>
        <p className="text-[11px] text-muted mb-4">
          Visual reading aids — applied to all dashboard text immediately after saving.
        </p>

        {/* Font */}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{T("cust.font")}</p>
        <div className="flex gap-2 flex-wrap mb-4">
          {FONT_OPTIONS.map((opt) => {
            const active = font === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFont(opt.value)}
                className="text-left rounded-xl px-4 py-3 border-2 transition-all flex-1 min-w-[120px]"
                style={{
                  borderColor: active ? color : "var(--color-border)",
                  background: active ? color + "10" : "var(--color-bg)",
                }}
              >
                <p className="text-xs font-bold" style={{ color: active ? color : "var(--color-text)" }}>{opt.label}</p>
                <p className="text-[10px] text-muted mt-0.5 leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Reading Mode */}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{T("cust.reading")}</p>
        <div className="flex gap-2 flex-wrap">
          {READING_OPTIONS.map((opt) => {
            const active = readingMode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setReadingMode(opt.value)}
                className="text-left rounded-xl px-4 py-3 border-2 transition-all flex-1 min-w-[120px]"
                style={{
                  borderColor: active ? color : "var(--color-border)",
                  background: active ? color + "10" : "var(--color-bg)",
                }}
              >
                <p className="text-xs font-bold" style={{ color: active ? color : "var(--color-text)" }}>{opt.label}</p>
                <p className="text-[10px] text-muted mt-0.5 leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 5. Color Scheme ── */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-5">
        <h3 className="text-sm font-bold mb-1">Color Scheme</h3>
        <p className="text-[11px] text-muted mb-4">Choose the visual theme for the dashboard.</p>
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Dark</p>
          <div className="flex flex-wrap gap-3">
            {THEMES.filter((th) => th.dark).map((th) => (
              <button key={th.id} onClick={() => { setTheme(th.id); saveTheme(th.id); }}
                className="flex flex-col items-center gap-1.5">
                <span className="w-10 h-8 rounded-lg flex overflow-hidden transition-all"
                  style={{
                    outline: theme === th.id ? `2px solid ${th.swatches[2]}` : "2px solid transparent",
                    outlineOffset: 2,
                  }}>
                  <span className="flex-1" style={{ background: th.swatches[0] }} />
                  <span className="w-2.5" style={{ background: th.swatches[1] }} />
                </span>
                <span className="text-[10px]" style={{ color: theme === th.id ? th.swatches[2] : "var(--color-muted)" }}>
                  {th.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Light</p>
          <div className="flex flex-wrap gap-3">
            {THEMES.filter((th) => !th.dark).map((th) => (
              <button key={th.id} onClick={() => { setTheme(th.id); saveTheme(th.id); }}
                className="flex flex-col items-center gap-1.5">
                <span className="w-10 h-8 rounded-lg flex overflow-hidden transition-all"
                  style={{
                    outline: theme === th.id ? `2px solid ${th.swatches[2]}` : "2px solid transparent",
                    outlineOffset: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  }}>
                  <span className="flex-1" style={{ background: th.swatches[0] }} />
                  <span className="w-2.5" style={{ background: th.swatches[1] }} />
                </span>
                <span className="text-[10px]" style={{ color: theme === th.id ? th.swatches[2] : "var(--color-muted)" }}>
                  {th.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6. Language ── */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 mb-6">
        <h3 className="text-sm font-bold mb-1">Language</h3>
        <p className="text-[11px] text-muted mb-3">AI-generated content will be produced in your selected language.</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => {
            const active = lang === l.code;
            return (
              <button key={l.code}
                onClick={() => {
                  try { localStorage.setItem("study_ai_lang", l.code); } catch {}
                  window.dispatchEvent(new CustomEvent("lang-changed", { detail: l.code }));
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all"
                style={{
                  borderColor: active ? color : "var(--color-border)",
                  background: active ? color + "15" : "var(--color-bg)",
                  color: active ? color : "var(--color-muted)",
                }}>
                <span>{l.flag}</span>
                <span className="text-xs font-semibold">{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: color, color: "#fff" }}
        >
          {saving ? "Saving…" : T("cust.save")}
        </button>
        {saved && (
          <span className="text-sm font-semibold" style={{ color: "#4CAF50" }}>
            ✓ {T("cust.saved")}
          </span>
        )}
      </div>

      {/* Preview */}
      {(industry || examples !== "balanced" || level !== "manager") && (
        <div className="mt-6 bg-bg-raised border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Preview — AI will be told:</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-text)" }}>
            {industry && <span>Use <strong>{industry}</strong> industry examples. </span>}
            {examples === "maximize_examples" && <span>Maximize real-world scenarios over theory. </span>}
            {examples === "maximize_text" && <span>Focus on deep theoretical explanations. </span>}
            {level === "5yo" && <span>Explain like I'm 5 years old.</span>}
            {level === "highschool" && <span>Explain at a learner-friendly level.</span>}
            {level === "manager" && <span>Explain at a business manager level.</span>}
            {level === "expert" && <span>Explain at an expert level — strategic, precise, no basics.</span>}
          </p>
        </div>
      )}
    </div>
  );
}
