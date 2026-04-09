"use client";

import { useState, useEffect } from "react";
import { t, type Lang } from "@/lib/i18n";
import WorkLabDisclaimer from "./WorkLabDisclaimer";

interface Props {
  courseId: string;
  color: string;
  name: string;
  lang?: Lang;
}

const FRAMEWORK_CHIPS = [
  "CVP / Break-even Analysis",
  "Porter's Five Forces",
  "SWOT Analysis",
  "NPV / DCF",
  "Contribution Margin",
  "Marketing Mix (4Ps)",
  "Value Chain Analysis",
  "CAPM / Cost of Capital",
];

export default function WorkLabTab({ courseId, color, name, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);

  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [framework, setFramework] = useState("");
  const [userData, setUserData] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Check localStorage on mount
  useEffect(() => {
    const accepted = localStorage.getItem("worklab_disclaimer_v1") === "accepted";
    setDisclaimerAccepted(accepted);
    if (!accepted) setShowDisclaimer(true);
  }, []);

  const handleAccept = () => {
    setDisclaimerAccepted(true);
    setShowDisclaimer(false);
  };

  const handleClose = () => {
    // Close disclaimer without accepting — keeps showDisclaimer true so the locked state shows
    setShowDisclaimer(false);
  };

  const analyze = async () => {
    if (!framework.trim() || !userData.trim()) return;
    setLoading(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/ai/worklab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, framework: framework.trim(), userData: userData.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.analysis || "");
    } catch (e: any) {
      setError(e.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setFramework("");
    setUserData("");
    setResult("");
    setError("");
  };

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Disclaimer overlay */}
      {showDisclaimer && (
        <WorkLabDisclaimer
          color={color}
          onAccept={handleAccept}
          onClose={handleClose}
        />
      )}

      {/* Locked state — if dismissed without accepting */}
      {!showDisclaimer && !disclaimerAccepted ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted">
          <span className="text-5xl">🔒</span>
          <p className="font-serif text-lg text-muted-light">Work Lab requires acknowledgment</p>
          <button
            onClick={() => setShowDisclaimer(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: color }}
          >
            Review & Accept Terms
          </button>
        </div>
      ) : !showDisclaimer && disclaimerAccepted ? (
        <div className="px-4 sm:px-6 py-5 sm:py-6 max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-serif text-xl font-bold" style={{ color }}>
              ⚗️ {T("worklab.title")}
            </h2>
            <span
              className="text-[12px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ background: color + "20", color }}
            >
              Experimental
            </span>
          </div>
          <p className="text-xs text-muted mb-6">
            Apply course frameworks from <strong>{name}</strong> to your real-world data.
          </p>

          {/* Framework input */}
          <div className="bg-bg-card border border-border rounded-2xl p-5 mb-4">
            <h3 className="text-sm font-bold mb-1">{T("worklab.framework_label")}</h3>
            <p className="text-[13px] text-muted mb-3">
              Which framework should the AI apply to your data?
            </p>
            <input
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              placeholder={T("worklab.framework_ph")}
              className="w-full bg-bg-raised border border-border-light rounded-xl px-4 py-2.5 text-sm outline-none mb-3"
              style={{ color: "var(--color-text)" }}
            />
            <div className="flex flex-wrap gap-1.5">
              {FRAMEWORK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setFramework(chip)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all"
                  style={{
                    background: framework === chip ? color + "20" : "var(--color-bg)",
                    borderColor: framework === chip ? color : "var(--color-border)",
                    color: framework === chip ? color : "var(--color-muted)",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Data input */}
          <div className="bg-bg-card border border-border rounded-2xl p-5 mb-5">
            <h3 className="text-sm font-bold mb-1">{T("worklab.data_label")}</h3>
            <p className="text-[13px] text-muted mb-3">
              Paste your data below. <span className="font-semibold" style={{ color: "#F59E0B" }}>Remove all names, company names, and identifying information before submitting.</span>
            </p>
            <textarea
              value={userData}
              onChange={(e) => setUserData(e.target.value)}
              rows={5}
              placeholder="Example: Revenue = $2.4M, variable costs = $1.1M, fixed costs = $800K, units sold = 48,000..."
              className="w-full bg-bg-raised border border-border-light rounded-xl px-4 py-3 text-sm outline-none resize-none leading-relaxed min-h-[120px] sm:min-h-[240px]"
              style={{ color: "var(--color-text)" }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={analyze}
              disabled={loading || !framework.trim() || !userData.trim()}
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: color, color: "#fff" }}
            >
              {loading ? "Analyzing…" : T("worklab.analyze")}
            </button>
            {(result || error) && (
              <button
                onClick={clear}
                className="px-5 py-3 rounded-xl text-sm font-semibold border transition-all"
                style={{ borderColor: "var(--color-border-light)", color: "var(--color-muted)" }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-xl px-4 py-3 text-sm text-red-400 mb-4">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              {/* Disclaimer banner */}
              <div
                className="flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs"
                style={{ background: "#F59E0B15", borderColor: "#F59E0B40", color: "#F59E0B" }}
              >
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>{T("worklab.disclaimer_notice")}</span>
              </div>

              {/* Analysis */}
              <div
                className="bg-bg-card border border-border rounded-2xl p-5 text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--color-text)" }}
              >
                {result}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
