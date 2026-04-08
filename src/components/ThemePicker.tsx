"use client";

import { useState, useEffect, useRef } from "react";
import { THEMES, getSavedTheme, saveTheme, type ThemeId } from "@/lib/theme";

export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ThemeId>("obsidian");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = getSavedTheme();
    setCurrent(saved);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (id: ThemeId) => {
    saveTheme(id);
    setCurrent(id);
    setOpen(false);
  };

  const currentTheme = THEMES.find((t) => t.id === current);
  const darkThemes  = THEMES.filter((t) => t.dark);
  const lightThemes = THEMES.filter((t) => !t.dark);

  return (
    <div ref={ref} className="relative">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        title="Change theme"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all border border-[#2A2D36] hover:border-[#3A3E4A] bg-bg-card"
        style={{ color: "var(--color-muted-light)" }}
      >
        {/* Mini swatch preview */}
        <span className="flex gap-0.5 items-center">
          {currentTheme?.swatches.slice(0, 3).map((c, i) => (
            <span
              key={i}
              className="inline-block rounded-sm"
              style={{ width: 10, height: 10, background: c, border: "1px solid rgba(128,128,128,0.3)" }}
            />
          ))}
        </span>
        <span className="hidden sm:inline" style={{ color: "var(--color-muted-light)" }}>
          {currentTheme?.label ?? "Theme"}
        </span>
        <span style={{ color: "var(--color-muted)", fontSize: 10 }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-2xl overflow-hidden border"
          style={{
            background: "var(--color-bg-card)",
            borderColor: "var(--color-border)",
            width: 220,
          }}
        >
          {/* Dark section */}
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--color-muted)" }}>
              Dark
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {darkThemes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => select(theme.id)}
                  title={theme.label}
                  className="flex flex-col items-center gap-1 group"
                >
                  {/* Swatch tile */}
                  <span
                    className="w-9 h-7 rounded-md flex overflow-hidden transition-all"
                    style={{
                      outline: current === theme.id ? `2px solid ${theme.swatches[2]}` : "2px solid transparent",
                      outlineOffset: 1,
                    }}
                  >
                    <span className="flex-1" style={{ background: theme.swatches[0] }} />
                    <span className="w-2" style={{ background: theme.swatches[1] }} />
                  </span>
                  <span
                    className="text-[9px] font-medium leading-none"
                    style={{ color: current === theme.id ? theme.swatches[2] : "var(--color-muted)" }}
                  >
                    {theme.label}
                  </span>
                  {current === theme.id && (
                    <span className="text-[8px]" style={{ color: theme.swatches[2] }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-3 my-2" style={{ height: 1, background: "var(--color-border)" }} />

          {/* Light section */}
          <div className="px-3 pb-2.5 pt-1">
            <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--color-muted)" }}>
              Light
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {lightThemes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => select(theme.id)}
                  title={theme.label}
                  className="flex flex-col items-center gap-1 group"
                >
                  <span
                    className="w-9 h-7 rounded-md flex overflow-hidden transition-all"
                    style={{
                      outline: current === theme.id ? `2px solid ${theme.swatches[2]}` : `2px solid transparent`,
                      outlineOffset: 1,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  >
                    <span className="flex-1" style={{ background: theme.swatches[0] }} />
                    <span className="w-2" style={{ background: theme.swatches[1] }} />
                  </span>
                  <span
                    className="text-[9px] font-medium leading-none"
                    style={{ color: current === theme.id ? theme.swatches[2] : "var(--color-muted)" }}
                  >
                    {theme.label}
                  </span>
                  {current === theme.id && (
                    <span className="text-[8px]" style={{ color: theme.swatches[2] }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
