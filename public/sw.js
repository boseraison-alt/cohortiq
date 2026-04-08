// CohortIQ Service Worker
// Strategy:
//   - Static assets (JS/CSS/fonts/images) → Cache First
//   - Podcast & video audio files          → Cache First (offline listening)
//   - API routes                           → Network Only
//   - Pages                               → Network First, fallback to cache

const CACHE_VERSION = "cohortiq-v1";
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const AUDIO_CACHE   = `${CACHE_VERSION}-audio`;
const PAGE_CACHE    = `${CACHE_VERSION}-pages`;

// App shell files to pre-cache on install
const APP_SHELL = [
  "/",
  "/dashboard",
  "/manifest.json",
  "/icon.svg",
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate — clean up old caches ──────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("cohortiq-") && k !== STATIC_CACHE && k !== AUDIO_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // API routes — always network only (never cache auth/AI responses)
  if (url.pathname.startsWith("/api/")) return;

  // Podcast & video audio files — Cache First for offline listening
  if (
    url.pathname.startsWith("/uploads/podcasts/") ||
    url.pathname.startsWith("/uploads/videos/")
  ) {
    event.respondWith(cacheFirstAudio(request));
    return;
  }

  // Static assets (_next/static) — Cache First
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Icons, manifest, images — Cache First
  if (
    url.pathname.match(/\.(svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/) ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Pages — Network First, fall back to cache
  event.respondWith(networkFirstPage(request));
});

// ── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function cacheFirstAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Return cached audio immediately — no network check needed
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone before caching — audio can be large, stream carefully
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Audio not available offline", { status: 503 });
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fallback to the dashboard shell
    const shell = await cache.match("/dashboard");
    return shell || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

// ── Background message handler ───────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();

  // Manual cache-busting from app
  if (event.data?.type === "CLEAR_AUDIO_CACHE") {
    caches.delete(AUDIO_CACHE);
  }
});
