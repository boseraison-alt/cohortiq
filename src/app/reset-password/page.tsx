"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("No reset token provided.");
      setValidating(false);
      return;
    }
    fetch(`/api/auth/reset-password?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setTokenValid(true);
          setEmail(data.email);
        } else {
          setError(data.error || "Invalid or expired reset link.");
        }
        setValidating(false);
      })
      .catch(() => {
        setError("Could not validate reset link.");
        setValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/"), 2500);
      } else {
        setError(data.error || "Reset failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted font-serif text-lg">Validating link…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="text-4xl">✓</div>
        <p className="font-serif text-xl text-accent">Password updated!</p>
        <p className="text-sm text-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-serif text-4xl font-bold text-accent mb-1">CohortIQ</h1>
        <p className="text-muted-light text-xs tracking-widest uppercase mb-8">Kellogg EMBA 144</p>

        {!tokenValid ? (
          <div className="bg-bg-card border border-danger/30 rounded-xl p-6">
            <p className="text-danger text-sm mb-4">{error}</p>
            <p className="text-xs text-muted mb-4">
              This link may have expired (valid for 24 hours) or already been used.
            </p>
            <button
              onClick={() => router.push("/forgot-password")}
              className="text-xs text-accent hover:underline"
            >
              Request a new reset link →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-bg-card border border-border rounded-xl p-6 text-left">
            <h2 className="text-sm font-semibold mb-1 text-center">Set New Password</h2>
            <p className="text-xs text-muted text-center mb-5">{email}</p>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4 text-xs text-danger">
                {error}
              </div>
            )}

            <label className="block text-xs text-muted mb-1">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm outline-none mb-3"
              style={{ color: "var(--color-text)" }}
            />

            <label className="block text-xs text-muted mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your new password"
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm outline-none mb-4"
              style={{ color: "var(--color-text)" }}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              {loading ? "Saving…" : "Set New Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted font-serif text-lg">Loading…</p>
      </div>
    }>
      <ResetForm />
    </Suspense>
  );
}
