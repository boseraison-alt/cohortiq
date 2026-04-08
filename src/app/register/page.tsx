"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function RegisterForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    if (!token) { setValidating(false); setError("No invite token provided."); return; }

    fetch(`/api/auth/register?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) { setTokenValid(true); setEmail(data.email); }
        else setError(data.error || "Invalid invite.");
        setValidating(false);
      })
      .catch(() => { setError("Could not validate invite."); setValidating(false); });
  }, [token]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      const data = await res.json();

      if (data.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/"), 2000);
      } else {
        setError(data.error || "Registration failed.");
      }
    } catch { setError("Network error."); }
    setLoading(false);
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted font-serif text-lg">Validating invite…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="text-4xl">✓</div>
        <p className="font-serif text-xl text-accent">Account created!</p>
        <p className="text-sm text-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-serif text-4xl font-bold text-accent mb-2">CohortIQ</h1>
        <p className="text-muted-light text-xs tracking-widest uppercase mb-1">Kellogg EMBA 144</p>
        <p className="text-muted-light text-xs tracking-widest uppercase mb-8">Create Your Account</p>

        {!tokenValid ? (
          <div className="bg-bg-card border border-danger/30 rounded-xl p-6">
            <p className="text-danger text-sm">{error}</p>
            <button onClick={() => router.push("/")}
              className="mt-4 text-xs text-muted-light hover:text-accent">
              ← Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="bg-bg-card border border-border rounded-xl p-6 text-left">
            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4 text-xs text-danger">
                {error}
              </div>
            )}

            <label className="block text-xs text-muted mb-1">Email (from invite)</label>
            <input type="email" value={email} disabled
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-sm text-muted-light mb-3" />

            <label className="block text-xs text-muted mb-1">Your Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full bg-bg-raised border border-border-light rounded-lg px-3 py-2.5 text-sm text-[#E4DED4] outline-none mb-3"
              placeholder="Full name" />

            <label className="block text-xs text-muted mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-bg-raised border border-border-light rounded-lg px-3 py-2.5 text-sm text-[#E4DED4] outline-none mb-3"
              placeholder="Minimum 8 characters" />

            <label className="block text-xs text-muted mb-1">Confirm Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              className="w-full bg-bg-raised border border-border-light rounded-lg px-3 py-2.5 text-sm text-[#E4DED4] outline-none mb-5"
              placeholder="Re-enter password" />

            <button type="submit" disabled={loading}
              className="w-full bg-accent text-bg font-semibold py-2.5 rounded-lg hover:opacity-90 transition-all text-sm disabled:opacity-50">
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted font-serif text-lg">Loading…</p>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
