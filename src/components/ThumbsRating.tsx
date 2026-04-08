"use client";

import { useState, useEffect } from "react";

interface Props {
  courseId: string;
  contentType: "podcast" | "video";
  contentId: string;
  contentTitle?: string;
  color?: string;
}

export default function ThumbsRating({ courseId, contentType, contentId, contentTitle, color = "#C9956B" }: Props) {
  const [userRating, setUserRating] = useState<"up" | "down" | null>(null);
  const [up, setUp] = useState(0);
  const [down, setDown] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!contentId) return;
    fetch(`/api/ratings?contentType=${contentType}&contentId=${contentId}`)
      .then((r) => r.json())
      .then((d) => {
        setUserRating(d.userRating?.rating ?? null);
        setFeedback(d.userRating?.feedback ?? "");
        setUp(d.up ?? 0);
        setDown(d.down ?? 0);
        if (d.userRating?.rating) setSubmitted(true);
      })
      .catch(() => {});
  }, [contentId, contentType]);

  const submitRating = async (rating: "up" | "down", fb?: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, contentType, contentId, contentTitle, rating, feedback: fb ?? feedback }),
      });
      const data = await res.json();
      if (!data.error) {
        const prevRating = userRating;
        setUserRating(rating);
        setSubmitted(true);
        // Update counts optimistically
        setUp((p) => p + (rating === "up" ? 1 : 0) - (prevRating === "up" ? 1 : 0));
        setDown((p) => p + (rating === "down" ? 1 : 0) - (prevRating === "down" ? 1 : 0));
        if (rating === "up") setShowFeedback(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleThumb = (rating: "up" | "down") => {
    if (rating === "down" && !submitted) {
      setShowFeedback(true);
      setUserRating("down");
    } else if (rating === "down" && userRating !== "down") {
      setShowFeedback(true);
      setUserRating("down");
    } else {
      submitRating(rating);
    }
  };

  const handleFeedbackSubmit = () => {
    submitRating("down", feedback);
    setShowFeedback(false);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginRight: 2 }}>
          Rate this {contentType}:
        </span>

        {/* Thumbs Up */}
        <button
          onClick={() => handleThumb("up")}
          disabled={submitting}
          title="Thumbs up"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 6,
            border: `1px solid ${userRating === "up" ? color : "var(--color-border)"}`,
            background: userRating === "up" ? `${color}20` : "transparent",
            color: userRating === "up" ? color : "var(--color-muted)",
            fontSize: "0.75rem", cursor: "pointer", transition: "all 0.15s",
          }}
        >
          👍 {up > 0 && <span style={{ fontSize: "0.68rem" }}>{up}</span>}
        </button>

        {/* Thumbs Down */}
        <button
          onClick={() => handleThumb("down")}
          disabled={submitting}
          title="Thumbs down"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 6,
            border: `1px solid ${userRating === "down" ? "#ef5350" : "var(--color-border)"}`,
            background: userRating === "down" ? "#ef535018" : "transparent",
            color: userRating === "down" ? "#ef5350" : "var(--color-muted)",
            fontSize: "0.75rem", cursor: "pointer", transition: "all 0.15s",
          }}
        >
          👎 {down > 0 && <span style={{ fontSize: "0.68rem" }}>{down}</span>}
        </button>
      </div>

      {/* Feedback box — shown when thumbs down clicked */}
      {showFeedback && (
        <div style={{
          marginTop: 8, padding: "10px 12px",
          background: "var(--color-bg-raised)", borderRadius: 8,
          border: "1px solid var(--color-border)",
        }}>
          <p style={{ fontSize: "0.74rem", color: "var(--color-muted)", marginBottom: 6 }}>
            What could be improved? (optional)
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Too long, wrong topic, audio quality…"
            rows={2}
            style={{
              width: "100%", padding: "6px 10px", borderRadius: 6,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)", color: "var(--color-text)",
              fontSize: "0.78rem", fontFamily: "inherit", resize: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              onClick={handleFeedbackSubmit}
              disabled={submitting}
              style={{
                padding: "4px 12px", borderRadius: 6, border: "none",
                background: "#ef5350", color: "#fff",
                fontSize: "0.74rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              Submit
            </button>
            <button
              onClick={() => { setShowFeedback(false); submitRating("down"); }}
              style={{
                padding: "4px 10px", borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "transparent", color: "var(--color-muted)",
                fontSize: "0.74rem", cursor: "pointer",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
