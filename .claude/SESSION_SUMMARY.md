# CohortIQ Development Session — April 11, 2026

## What Was Done This Session

### 1. Video Playback Fix (Railway)
- `output: "standalone"` in Next.js doesn't serve runtime-written `public/` files
- All uploads now route through `/api/uploads/[...path]` with HTTP Range (206) support
- Videos play correctly on Railway

### 2. AI Video Slide Font Fix (Linux)
- Sharp's bundled `librsvg` silently drops SVG text when named fonts aren't found on Linux
- Replaced Sharp with `@resvg/resvg-js` + bundled DejaVu TTF fonts in `assets/fonts/`
- `loadSystemFonts: false` = zero system font dependency

### 3. Railway Volume Setup
- Code supports `UPLOADS_DIR` env var for persistent storage
- User attached Railway Volume at `/data/uploads` with `UPLOADS_DIR=/data/uploads`

### 4. UI Contrast & Font Size Overhaul
- All 9 themes: `--color-muted` and `--color-muted-light` dramatically changed
- Light themes made much darker, dark themes brightened
- All dashboard font sizes bumped across 19 component files
- Removed inline `style` overrides in Sidebar.tsx and ChatTab.tsx that blocked CSS variables

### 5. Collapsible Sidebar & Chat Sessions
- **Left sidebar** (`Sidebar.tsx`): `collapsed` prop toggles icon-only 44px strip vs full 220px
- **Chat sessions** (`ChatTab.tsx`): 32px collapsed strip with `›` toggle
- Both persist to `localStorage`
- Toggle buttons: `‹` to collapse, `›` to expand

### 6. Chat Starter Buttons
- Changed from `color: var(--color-text)` to `color: var(--color-muted-light)` (subtle)

### 7. Broader "Depth Choice" Detection
- `isBroad()` in ChatTab now catches: "how does", "what are", "compare", "help me understand", etc.
- Scope words expanded: "concept", "theory", "formula", "principle", etc.
- Short threshold raised: ≤6 words → ≤10 words

### 8. Video Delete Feature
- **Student side**: 🗑 delete button on video thumbnails (AI-generated only, not external)
- **Admin side**: New "Videos" panel in admin dashboard with per-course list + delete
- DELETE API also removes physical file from disk (not just DB record)
- VideoCard outer element changed from `<button>` to `<div role="button">` (nested button fix)

### 9. Mind Map Removed
- Removed from sidebar navigation (`Sidebar.tsx`)

### 10. Lecture Transcription Script
- `transcribe_lectures.py` at project root
- Uses Whisper (CPU/medium model) + Anthropic Claude API for summaries
- Reads API key from `.env` automatically
- Outputs `.txt` (transcript) + `.summary.md` (detailed summary) next to each video
- Skips already-done files (resumable)
- Config: `VIDEO_FOLDER = r"C:\Users\boser\D"`

### 11. Claude Model Upgrade
- `src/lib/claude.ts`: model updated from `claude-sonnet-4-20250514` → `claude-sonnet-4-5-20250929`
- Both `askClaude` and `askClaudeChat` now use **streaming** (`stream: true`)
- Auto-retry with exponential backoff (5s → 15s → 30s) on `overloaded_error` and `rate_limit_error`

### 12. Rich HTML Slide Deck Generator
**Files:**
- `src/lib/slideDeckTemplate.ts` — HTML template with full CSS design system
- `src/app/api/ai/slidedeck/route.ts` — Claude generates rich JSON slides
- `src/app/api/slidedeck/[videoId]/route.ts` — serves HTML viewer
- Button: "📘 Generate Deck" in VideosTab

**Features:**
- Color-coded sections (purple/teal/coral/amber/green/blue/red)
- Components: grid2, grid3, sbox, quote, formula, icard, table, bullets, segments
- Graph components: barchart, linechart, piechart, metrics, progress
- Interactive navigation (Prev/Next + arrow keys + progress bar)
- Dark mode support
- Stored as Video row with `sourceType="slidedeck"`, opened in new tab

### 13. Rich Narrated Video Generator (THE BIG FEATURE)
**Architecture: Background rendering + client polling**

```
Client clicks 🎞 Generate Rich Video
       │
       ▼
POST /api/ai/rich-video          ← returns in <1 second
  ├─ Creates DB row (url="pending")
  └─ Fires generateRichVideoFull() in background
       │
       ▼ (background, NO HTTP timeout)
  generateRichVideoFull():
  ├─ Claude streaming → rich slide JSON with narration
  ├─ recoverDeckJson() → robust JSON recovery
  ├─ buildRichSlideSvg() → 1920×1080 SVG per slide (serial)
  ├─ renderSlideToPng() → resvg-js with DejaVu fonts
  ├─ generateSpeech() → OpenAI TTS "onyx" (concurrency=2)
  ├─ compositeVideo() → FFmpeg with cinematic color grade
  └─ prisma.video.update() → url="pending" → actual MP4
       │
       ▼ (client polls every 5s)
GET /api/ai/rich-video/status?videoId=X  ← instant DB read
  Returns: {status: "rendering"} | {status: "complete", video} | {status: "error"}
```

**Files:**
- `src/lib/richSlides.ts` — SVG renderer for all visual components
- `src/lib/richVideoRenderer.ts` — full background pipeline (Claude + render + TTS + FFmpeg)
- `src/lib/jsonRecovery.ts` — slide-by-slide JSON recovery from broken Claude output
- `src/app/api/ai/rich-video/route.ts` — instant HTTP handler (fires background)
- `src/app/api/ai/rich-video/status/route.ts` — polling endpoint
- `src/app/api/ai/rich-video/render/route.ts` — (deprecated, kept for reference)

**Visual components supported in SVG renderer:**
- grid2 / grid3 — side-by-side colored callout boxes
- sbox — single colored box with title + body
- quote — italicized block with colored left border
- formula — centered monospace equation panel (blue accent)
- icard — bordered info card for examples (amber accent)
- table — header + rows with dividers
- bullets — colored-dot list (first line uses accent color)
- segments — 3-card segment layout
- barchart — vertical bars with gridlines and labels
- linechart — multi-series with axes, gridlines, legend
- piechart — donut-style with percentage legend
- metrics — up to 4 big-number KPI cards with deltas
- progress — horizontal progress bars

**Cinematic mode (FFmpeg):**
- `eq=contrast=1.12:saturation=1.18:gamma=0.95:brightness=-0.02`
- `vignette=angle=0.628` (subtle corner darkening)
- Longer 1.0s fade on first/last slides

**Color palette (refined, not neon):**
- Purple: fg `#C8C0F0`, bg `#6B60D0`
- Teal: fg `#80D8B4`, bg `#1FA878`
- Coral: fg `#F0A890`, bg `#D86840`
- Amber: fg `#F0C860`, bg `#C89020`
- Blue: fg `#88BDE8`, bg `#3888CC`
- Green: fg `#98CC70`, bg `#609020`
- Red: fg `#E89090`, bg `#D04848`
- Background: `#0C0E14`, Card: `#181C26`, Text: `#F0ECE4`

**Prompt features:**
- Concrete examples mandatory (real companies, real numbers)
- Graph quota: 2 min conceptual, 3 min quantitative/CVP
- CVP/break-even requires linechart + metrics/barchart
- JSON formatting rules (single quotes for inner quotations)
- 80-120 word narration per slide

### 14. External Video Service Integration (coded but not activated)
**Files:**
- `src/lib/videoRouter.ts` — keyword + LLM classifier for routing
- `src/lib/xpilot.ts` — X-Pilot API client
- `src/lib/heygen.ts` — HeyGen API client + script formatter
- `src/app/api/ai/video-rich/route.ts` — unified endpoint (needs API keys)
- `.env.example` updated with XPILOT_API_KEY, HEYGEN_API_KEY, RUNWAY_API_KEY

**Status:** Code is there but requires adding API keys to Railway. X-Pilot may not have a public API — needs verification.

### 15. Error Handling Improvements
- Non-JSON error responses handled gracefully (503/504/502 → readable messages)
- Step-by-step error logging in video pipeline (SVG/PNG/TTS/FFmpeg)
- `recoverDeckJson()` walks slides array character-by-character to rescue partial decks
- Client error banner shows HTTP status code + body snippet
- `[rich-video client v5]` tag in console for cache debugging

### 16. Narration Route Fixes
- Better error logging with structured Anthropic SDK error extraction
- Non-JSON response handling (Service Unavailable etc.)

### 17. Admin Videos Panel
- New "Videos" panel in admin sidebar with video camera icon
- Course dropdown, lists all videos with type badges
- Delete button on every row (calls admin DELETE endpoint)

---

## Key File Map

```
src/
├── lib/
│   ├── claude.ts                    # Claude API (streaming + retry)
│   ├── slides.ts                    # Original SVG slide renderer + resvg-js
│   ├── richSlides.ts                # Rich SVG renderer (all visual components)
│   ├── richVideoRenderer.ts         # Full background pipeline (Claude→MP4)
│   ├── slideDeckTemplate.ts         # HTML slide deck template + types
│   ├── jsonRecovery.ts              # Robust JSON recovery for LLM output
│   ├── ffmpeg.ts                    # FFmpeg compositor (cinematic mode)
│   ├── videoRouter.ts               # Content classifier for external APIs
│   ├── xpilot.ts                    # X-Pilot API client
│   ├── heygen.ts                    # HeyGen API client
│   ├── tts.ts                       # OpenAI TTS wrapper
│   ├── uploads.ts                   # Upload URL/path helpers
│   └── chunks.ts                    # Text chunking + retrieval
├── app/
│   ├── api/
│   │   ├── ai/
│   │   │   ├── rich-video/
│   │   │   │   ├── route.ts         # Instant POST → fires background
│   │   │   │   ├── status/route.ts  # Polling endpoint
│   │   │   │   └── render/route.ts  # (deprecated Phase 2)
│   │   │   ├── slidedeck/route.ts   # HTML deck generator
│   │   │   ├── narration/
│   │   │   │   ├── route.ts         # Slide script generator
│   │   │   │   └── video/route.ts   # Old video compositor
│   │   │   ├── video-rich/route.ts  # External API router (needs keys)
│   │   │   └── test-model/route.ts  # Diagnostic: test all model IDs
│   │   ├── slidedeck/
│   │   │   └── [videoId]/route.ts   # HTML deck viewer
│   │   ├── uploads/
│   │   │   └── [...path]/route.ts   # File serving with Range support
│   │   └── courses/[id]/videos/route.ts  # CRUD + file cleanup
│   ├── admin/page.tsx               # Admin dashboard (Videos panel added)
│   └── dashboard/page.tsx           # Main dashboard (sidebar collapse state)
├── components/
│   ├── VideosTab.tsx                # 3 generators + library + delete
│   ├── ChatTab.tsx                  # Collapsible sessions + depth choice
│   └── Sidebar.tsx                  # Collapsible + icon-only mode
├── assets/fonts/                    # Bundled DejaVu TTF (4 files, 2MB)
├── railway.toml                     # healthcheckTimeout=900
├── nixpacks.toml                    # aptPkgs for fonts
└── transcribe_lectures.py           # Whisper + Claude transcript/summary tool
```

---

## Environment Variables Needed

```env
# Required (already set)
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://your-app.railway.app
NEXTAUTH_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Railway Volume (already configured)
UPLOADS_DIR=/data/uploads

# Optional — for external video APIs (not yet activated)
XPILOT_API_KEY=
HEYGEN_API_KEY=
RUNWAY_API_KEY=
```

---

## Known Issues / TODO

1. **Ken Burns zoompan** — reverted due to FFmpeg compat issues. The `zoompan` filter with `-loop 1 -shortest` is unreliable. Could revisit with a different approach (e.g., scale+crop animation).

2. **Old "Generate" video button** still produces plain bullet-point slides. The user should use "🎞 Generate Rich Video" for the upgraded output.

3. **Text overflow in SVG boxes** — just fixed with tighter wrapping + clipPath. May need further tuning for very long words.

4. **Slide deck diversity audit** — currently log-only (was rejecting too aggressively). Could re-enable with looser thresholds.

5. **X-Pilot API** — integration code exists but the API may be web-UI-only. Needs verification before adding keys.

6. **Transcription script** — user has ffmpeg installed but was using Python 3.14 which doesn't have CUDA PyTorch wheels. Running on CPU with medium model. Could upgrade to Python 3.12 + CUDA for 3× speed.

7. **Video library cleanup** — user has ~22 videos including several duplicate "Break-Even Analysis" tests. Can be cleaned up via the 🗑 delete buttons.

---

## Git History (this session, newest first)

```
792cc75 Fix text overflow in slide boxes — tighter wrapping + SVG clipping
0ad59cf Move Claude call to background — HTTP returns in <1 second
20ca90a Background rendering + polling — permanently fixes Railway 502s
b3bbaea Refined colors + mandatory graphs for CVP/break-even topics
5e3e749 Auto-retry on Anthropic overloaded/rate-limit errors
51c229f Split rich video into two HTTP requests to avoid Railway 502
beaed8e Fix 502: serialize PNG, limit TTS concurrency, phase timings
63566fd Parallelize slide rendering + reduce work
adeb544 Strong visible cinematic + mandatory graph quota
c255dce Vibrant color overhaul for rich video slides
7455e23 Raise rich video slide cap to 30
b55c5bd Require concrete examples + smart graph-type selection
8d65354 Add cinematic mode to Rich Videos
3d3ee3d Robust JSON recovery for LLM output + larger token budget
1bcfff0 Simplify cinematic filters + granular step logging
f562a23 Use streaming for Claude calls
d4e122c Expose HTTP status + body snippet in Rich Video error banner
9178b8e Add [v3] prefix + full diagnostic console logging
4770b5f Revert fragile zoompan filter
1633476 Add graphs + animation to Rich Narrated Video
0abf7a9 Rich Narrated Video — render HTML-deck components as MP4
613070a Add external rich-video generation (X-Pilot / HeyGen routing)
cb082d7 Add interactive HTML slide deck generator
fe53f21 Soften slidedeck audit and improve error diagnostics
bd4d7f6 Force component diversity in slide deck generation
cf793f5 Use claude-sonnet-4-6 (current Sonnet model)
6911b46 Upgrade Claude model to sonnet-4-5 + better error logging
8b295fb Handle non-JSON error responses in video generation
e015535 Remove Mind Map from sidebar navigation
00865bb Change video delete icon from ✕ to 🗑
59ea391 Lower contrast on video delete button
d444877 Add video delete, collapsible sidebar/chat sessions, admin video panel
```
