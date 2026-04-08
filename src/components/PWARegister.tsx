"use client";

import { useEffect, useState } from "react";

export default function PWARegister() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Check for updates every 60s while the app is open
          setInterval(() => reg.update(), 60_000);
        })
        .catch((err) => console.warn("[SW] registration failed:", err));
    }

    // Capture the install prompt (Chrome/Android)
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      // Only show banner if not already installed
      if (!window.matchMedia("(display-mode: standalone)").matches) {
        setShowBanner(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Hide banner if already running as installed PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowBanner(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setInstallPrompt(null);
  };

  if (!showBanner) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl max-w-sm w-[calc(100%-2rem)]"
      style={{ background: "#4E2A84", border: "1px solid #6B3FA0" }}
    >
      <img src="/icon.svg" alt="CohortIQ" className="w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white leading-tight">Install CohortIQ</p>
        <p className="text-[10px] text-purple-200 mt-0.5 leading-tight">
          Listen to podcasts offline on your commute
        </p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          onClick={install}
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all"
          style={{ background: "#C4A265" }}
        >
          Install
        </button>
        <button
          onClick={() => setShowBanner(false)}
          className="text-[10px] text-purple-300 hover:text-white transition-all text-center"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
