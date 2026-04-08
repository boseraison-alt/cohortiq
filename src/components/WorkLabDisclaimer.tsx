"use client";

import { useState, useEffect } from "react";

interface Props {
  onAccept: () => void;
  onClose: () => void;
  color: string;
}

export default function WorkLabDisclaimer({ onAccept, onClose, color }: Props) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleAccept = () => {
    localStorage.setItem("worklab_disclaimer_v1", "accepted");
    onAccept();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg mx-6 rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">⚠️</span>
            <div>
              <h2 className="font-serif text-lg font-bold" style={{ color }}>
                Experimental Feature
              </h2>
              <p className="text-xs text-muted mt-0.5">Work Lab — Apply frameworks to your real data</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm" style={{ color: "var(--color-text)" }}>
            This tool lets you paste your own professional data so the AI can apply course frameworks to it. Before continuing, please read:
          </p>
          <ul className="space-y-2.5">
            {[
              "You may have NDA or confidentiality obligations with your employer. It is your responsibility to understand and comply with them.",
              "Remove all company names, client names, employee names, and identifying information before pasting anything.",
              "This feature is for educational purposes only — not professional consulting, legal, or financial advice.",
              "You proceed entirely at your own risk. CohortIQ accepts no liability for how you use this tool.",
            ].map((item, i) => (
              <li key={i} className="flex gap-2.5 text-xs" style={{ color: "var(--color-muted-light)" }}>
                <span className="shrink-0 mt-0.5" style={{ color }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Checkbox */}
          <label className="flex items-start gap-3 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 shrink-0 w-4 h-4 cursor-pointer accent-current"
              style={{ accentColor: color }}
            />
            <span className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
              I understand. I will not paste proprietary or identifying information without proper authorization, and I accept full responsibility for what I submit.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
            style={{ borderColor: "var(--color-border-light)", color: "var(--color-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={!checked}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: checked ? color : "var(--color-bg-raised)", color: "#fff" }}
          >
            Continue to Work Lab
          </button>
        </div>
      </div>
    </div>
  );
}
