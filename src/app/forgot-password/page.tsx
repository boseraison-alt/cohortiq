"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-serif text-4xl font-bold text-accent mb-1">CohortIQ</h1>
        <p className="text-muted-light text-xs tracking-widest uppercase mb-8">Kellogg EMBA 144</p>

        {sent ? (
          <div className="bg-bg-card border border-border rounded-xl p-6 text-left">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">✉️</div>
              <h2 className="text-sm font-semibold text-accent">Request Submitted</h2>
            </div>
            <p className="text-xs text-muted leading-relaxed text-center">
              If your email is registered, a password reset link has been generated.
              Please contact your administrator to receive the link.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-5 w-full text-xs text-muted hover:text-accent transition-all"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-bg-card border border-border rounded-xl p-6 text-left">
            <h2 className="text-sm font-semibold mb-1 text-center">Reset Password</h2>
            <p className="text-xs text-muted text-center mb-5">
              Enter your email and your administrator will send you a reset link.
            </p>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4 text-xs text-danger">
                {error}
              </div>
            )}

            <label className="block text-xs text-muted mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@kellogg.edu"
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm outline-none mb-4"
              style={{ color: "var(--color-text)" }}
            />

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              {loading ? "Submitting…" : "Request Reset Link"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-3 w-full text-xs text-muted hover:text-accent transition-all"
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
