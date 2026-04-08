"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

/* ── Sign-In Modal ─────────────────────────────────────────────────────── */
function SignInModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="landing-modal-overlay">
      <div ref={ref} className="landing-modal">
        <button onClick={onClose} className="landing-modal-close">&times;</button>
        <div className="landing-modal-logo">Cohort<em>IQ</em></div>
        <p className="landing-modal-sub">Sign in to your account</p>

        <form onSubmit={handleLogin}>
          {error && <div className="landing-modal-error">{error}</div>}

          <label className="landing-form-label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="landing-form-input"
            placeholder="you@email.com"
          />

          <label className="landing-form-label">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="landing-form-input"
            placeholder="••••••••"
          />

          <button type="submit" disabled={loading} className="landing-form-submit">
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <div className="landing-form-forgot">
            <a href="/forgot-password">Forgot password?</a>
          </div>
        </form>

        <p className="landing-form-note">Invite only. Contact your admin for access.</p>
      </div>
    </div>
  );
}

/* ── Landing Page ──────────────────────────────────────────────────────── */
export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [signInOpen, setSignInOpen] = useState(false);

  const goToDashboard = (role?: string) => {
    router.push(role === "admin" ? "/admin" : "/dashboard");
  };

  // After sign-in, get the updated session role and redirect
  const handleSignInSuccess = async () => {
    // Re-fetch session to get role, then redirect
    const res = await fetch("/api/auth/session");
    const s = await res.json();
    goToDashboard((s?.user as any)?.role);
  };

  // Scroll reveal — elements start visible, JS adds animation class only for off-screen elements
  useEffect(() => {
    const reveals = Array.from(document.querySelectorAll(".l-reveal"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.remove("l-animate");
            e.target.classList.add("l-visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px 50px 0px" }
    );
    reveals.forEach((r) => {
      const rect = r.getBoundingClientRect();
      // Only animate elements that start below the fold
      if (rect.top > window.innerHeight) {
        r.classList.add("l-animate");
        observer.observe(r);
      }
    });
    // Failsafe: ensure all reveals are visible after 800ms
    const fallback = setTimeout(() => {
      reveals.forEach((r) => { r.classList.remove("l-animate"); r.classList.add("l-visible"); });
    }, 800);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, []);

  // How-it-works step selection
  const [activeStep, setActiveStep] = useState(0);
  const stepVisuals = [
    { icon: "🧭", title: "CohortIQ indexes every word", text: "Preloaded study material is indexed instantly and made searchable by AI — pick from Chat Tutor, Podcast, Videos, Mind Map, Flashcards, Practice Quiz, and more." },
    { icon: "💬", title: "Chat, watch & listen", text: "Ask the AI tutor anything about your materials, watch course videos, or listen to AI-generated podcasts on your commute." },
    { icon: "📈", title: "Study, test and track", text: "CohortIQ logs every session and surfaces knowledge gaps before they become exam surprises." },
    { icon: "🏆", title: "Walk into exams prepared", text: "Use Study Plan mode for a comprehensive pre-exam review that synthesizes everything you've studied." },
  ];

  if (status === "loading") {
    return (
      <div className="landing-loading">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="landing-page">
      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} onSuccess={handleSignInSuccess} />

      {/* ── NAV ── */}
      <nav className="l-nav">
        <div className="l-nav-logo">Cohort<em>IQ</em></div>
        <ul className="l-nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#how">How it works</a></li>
          <li><a href="#testimonials">Students</a></li>
        </ul>
        <button onClick={() => session ? goToDashboard((session.user as any)?.role) : setSignInOpen(true)} className="l-nav-cta">
          {session ? "Go to Dashboard →" : "Sign in →"}
        </button>
      </nav>

      {/* ── HERO ── */}
      <div className="l-hero-wrapper">
        <div className="l-hero">
          <div className="l-hero-left">
            <div className="l-hero-eyebrow">
              <span className="l-eyebrow-dot" />
              Kellogg EMBA · Built for your cohort
            </div>
            <h1 className="l-hero-title">
              Study smarter.<br /><em>Learn deeper.</em><br />Graduate stronger.
            </h1>
            <p className="l-hero-sub">
              CohortIQ transforms your course materials into an intelligent study
              partner — with AI chat, flashcards, quizzes, podcasts, mind maps,
              and more. All in one place.
            </p>
            <div className="l-hero-actions">
              <button onClick={() => session ? goToDashboard((session.user as any)?.role) : setSignInOpen(true)} className="l-btn-primary">
                {session ? "Go to Dashboard" : "Start studying now"}
              </button>
              <a href="#features" className="l-btn-ghost">
                See all features
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </a>
            </div>
            <div className="l-hero-stats">
              <div className="l-stat">
                <div className="l-stat-num">10+</div>
                <div className="l-stat-label">Study modes</div>
              </div>
              <div className="l-stat">
                <div className="l-stat-num">45k+</div>
                <div className="l-stat-label">Words indexed per course</div>
              </div>
              <div className="l-stat">
                <div className="l-stat-num">2×</div>
                <div className="l-stat-label">Faster exam prep</div>
              </div>
            </div>
          </div>

          <div className="l-hero-visual">
            <div className="l-mockup">
              <div className="l-mockup-bar">
                <div className="l-mockup-dots"><span /><span /><span /></div>
                <div className="l-mockup-title">cohortiq.app</div>
              </div>
              <div className="l-mockup-body">
                <div className="l-mockup-sidebar">
                  <div className="l-mock-label">Courses</div>
                  <div className="l-mock-course active">Spring 2026 Accounting</div>
                  <div className="l-mock-course">Spring 2026 Marketing</div>
                  <div className="l-mock-label" style={{ marginTop: 16 }}>Modes</div>
                  <div className="l-mock-course active">💬 Chat</div>
                  <div className="l-mock-course">🃏 Flashcards</div>
                  <div className="l-mock-course">🧠 Practice</div>
                  <div className="l-mock-course">🗺 Mind Map</div>
                  <div className="l-mock-course">🎧 Podcast</div>
                </div>
                <div className="l-mockup-main">
                  <div className="l-mock-tabs">
                    <div className="l-mock-tab active">Chat</div>
                    <div className="l-mock-tab">Cards</div>
                    <div className="l-mock-tab">Practice</div>
                    <div className="l-mock-tab">Insights</div>
                    <div className="l-mock-tab">More</div>
                  </div>
                  <div className="l-mock-chat">
                    <div className="l-mock-bubble ai">What would you like to explore in your Accounting materials today?</div>
                    <div className="l-mock-bubble user">Explain CVP analysis simply</div>
                    <div className="l-mock-bubble ai">Cost-Volume-Profit analysis shows the relationship between your costs, sales volume, and profit…</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="l-features" id="features">
        <div className="l-features-inner">
          <div className="l-features-top l-reveal">
            <div className="l-section-label">Everything you need</div>
            <h2 className="l-section-title">Ten ways to master<br />your material</h2>
          </div>
          <div className="l-features-grid l-reveal">
            {[
              { icon: "💬", bg: "#f0f8ff", name: "AI Chat Tutor", desc: "Ask anything about your uploaded course materials. Get precise, sourced answers in real-time conversation.", tag: "Core" },
              { icon: "🃏", bg: "#fff8f0", name: "Smart Flashcards", desc: "Auto-generated from your notes. Review key terms and concepts with spaced repetition built in.", tag: "Memory" },
              { icon: "🧠", bg: "#f0fff4", name: "Adaptive Practice", desc: "Multiple-choice and open-ended questions that adapt to your weak spots, with detailed explanations.", tag: "Assessment" },
              { icon: "🎧", bg: "#fdf0ff", name: "AI Podcast", desc: "Turn dense lecture notes into a conversational audio digest you can listen to on your commute.", tag: "Audio" },
              { icon: "🗺", bg: "#fffff0", name: "Mind Map", desc: "Visual knowledge graphs generated from your material. See how concepts connect at a glance.", tag: "Visual" },
              { icon: "📊", bg: "#f0f8f0", name: "Insights Dashboard", desc: "Track study sessions, identify knowledge gaps, and see which topics need more attention before exams.", tag: "Analytics" },
              { icon: "🎬", bg: "#fff0f0", name: "Video Integration", desc: "Link course videos and get AI-generated summaries, timestamps, and key moment highlights.", tag: "Media" },
              { icon: "⚗️", bg: "#f0f4ff", name: "Work Lab", desc: "Apply course frameworks to real-world scenarios — case studies, problem sets, and applied exercises.", tag: "Applied" },
              { icon: "🏆", bg: "#fffaf0", name: "Master Mind", desc: "Comprehensive exam prep mode — combines all your study data into a final review session.", tag: "Exam Prep" },
            ].map((f) => (
              <div key={f.name} className="l-feat-card">
                <div className="l-feat-icon" style={{ background: f.bg }}>{f.icon}</div>
                <div className="l-feat-name">{f.name}</div>
                <div className="l-feat-desc">{f.desc}</div>
                <div className="l-feat-tag">{f.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="l-how-section">
        <div className="l-how-inner">
          <div>
            <div className="l-section-label l-reveal">How it works</div>
            <h2 className="l-section-title l-reveal">From uploaded notes<br />to exam confidence</h2>
            <div className="l-steps l-reveal">
              {[
                { title: "CohortIQ indexes every word of preloaded study material and makes it instantly searchable by AI", body: "Pick from Chat Tutor, Podcast, Videos, Mind Map, Flashcards, Practice Quiz, and more — depending on where you are in your study cycle." },
                { title: "Chat with AI, watch videos and listen to podcasts", body: "Have a real conversation with your materials, watch course videos, or listen to AI-generated podcast summaries on the go." },
                { title: "Study, test and track", body: "Every session is logged. CohortIQ adapts to your performance, surfacing weak areas and suggesting the next best study action." },
                { title: "Walk into exams prepared", body: "Use Study Plan mode for a comprehensive pre-exam review that synthesizes everything you've studied into one consolidated session." },
              ].map((s, i) => (
                <div
                  key={i}
                  className={`l-step${activeStep === i ? " active" : ""}`}
                  onClick={() => setActiveStep(i)}
                >
                  <div className="l-step-num">{String(i + 1).padStart(2, "0")}</div>
                  <div>
                    <div className="l-step-title">{s.title}</div>
                    <div className="l-step-body">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="l-how-visual l-reveal">
            <div className="l-how-visual-icon">{stepVisuals[activeStep].icon}</div>
            <div className="l-how-visual-title">{stepVisuals[activeStep].title}</div>
            <div className="l-how-visual-text">{stepVisuals[activeStep].text}</div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="l-testimonials" id="testimonials">
        <div className="l-test-inner">
          <div className="l-section-label l-reveal">Cohort voices</div>
          <h2 className="l-section-title l-reveal">Built for the way<br />you actually study</h2>
          <div className="l-test-grid l-reveal">
            {[
              { quote: "The AI chat is like having a TA available at 2am. I asked it to explain CVP three different ways until it clicked.", initials: "MK", name: "Michael K.", role: "Kellogg EMBA · Accounting", color: "#2a6ee0" },
              { quote: "The podcast mode is genuinely brilliant. I listened to a summary of my Marketing readings on my drive and retained everything.", initials: "SR", name: "Sarah R.", role: "Kellogg EMBA · Marketing", color: "#c9a84c" },
              { quote: "I went from panicked before finals to actually confident. The practice mode caught every concept I was fuzzy on.", initials: "TL", name: "Thomas L.", role: "Kellogg EMBA · Finance", color: "#2ac46e" },
            ].map((t) => (
              <div key={t.initials} className="l-test-card">
                <div className="l-stars">★★★★★</div>
                <div className="l-test-quote">&ldquo;{t.quote}&rdquo;</div>
                <div className="l-test-author">
                  <div className="l-test-avatar" style={{ background: t.color }}>{t.initials}</div>
                  <div>
                    <div className="l-test-name">{t.name}</div>
                    <div className="l-test-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="l-cta-section">
        <div className="l-cta-label">Ready to begin?</div>
        <h2 className="l-cta-title">Your next exam is<br /><em>already won.</em></h2>
        <p className="l-cta-sub">Join your cohort studying smarter with CohortIQ.</p>
        <button onClick={() => session ? goToDashboard((session.user as any)?.role) : setSignInOpen(true)} className="l-cta-btn">
          {session ? "Go to Dashboard →" : "Start studying now →"}
        </button>
        <p className="l-cta-note">Invite only · Works with any course material</p>
      </section>

      {/* ── FOOTER ── */}
      <footer className="l-footer">
        <div className="l-footer-logo">Cohort<em>IQ</em></div>
        <div>© 2026 CohortIQ. Built for learners.</div>
        <div className="l-footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Contact</a>
        </div>
      </footer>
    </div>
  );
}
