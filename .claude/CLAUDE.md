# CohortIQ — Claude Code Context

## What is this project?
CohortIQ is an AI-powered study platform (Next.js 14 + Prisma + PostgreSQL) deployed on Railway. It transforms course materials into interactive study tools: AI chat, flashcards, practice quizzes, podcasts, video presentations, concept maps, and more.

## Key Architecture Decisions

### Video Generation Pipeline
There are THREE video generation paths:
1. **Old "Generate" button** → `/api/ai/narration` + `/api/ai/narration/video` → plain SVG slides → MP4
2. **"📘 Generate Deck" button** → `/api/ai/slidedeck` → rich HTML slide deck (opens in new tab)
3. **"🎞 Generate Rich Video" button** → `/api/ai/rich-video` → background pipeline → rich SVG slides + OpenAI TTS + FFmpeg → MP4

The Rich Video uses a **background rendering + polling** architecture because Railway's HTTP proxy times out on long requests. The POST returns in <1 second, rendering happens in the Node.js event loop, and the client polls `/api/ai/rich-video/status`.

### Claude API
- Model: `claude-sonnet-4-5-20250929`
- Always uses streaming (`stream: true`)
- Auto-retry with exponential backoff on `overloaded_error` / `rate_limit_error`
- Located in `src/lib/claude.ts`

### SVG Rendering
- Uses `@resvg/resvg-js` with bundled DejaVu fonts (`assets/fonts/`)
- `loadSystemFonts: false` — works on any platform without system font deps
- Rich slides rendered by `src/lib/richSlides.ts` (supports 14 component types)

### FFmpeg
- Uses `ffmpeg-static` npm package
- Cinematic mode: eq contrast/saturation/gamma + vignette
- Each slide = static PNG + MP3 audio → segment → concat

## Common Issues & Solutions

| Issue | Root Cause | Solution |
|---|---|---|
| 502 on video generation | Railway HTTP proxy timeout | Background rendering + polling |
| "Streaming required" error | Anthropic SDK rejects high max_tokens without streaming | Always use `stream: true` |
| "Overloaded" error | Anthropic servers at capacity | Auto-retry with backoff (5s/15s/30s) |
| JSON parse errors from Claude | Unescaped quotes in narration text | `recoverDeckJson()` + single-quote instruction in prompt |
| Video slides no text (Linux) | librsvg can't find fonts | `@resvg/resvg-js` with bundled DejaVu fonts |
| Text overflow in SVG boxes | Character width underestimated | Tighter wrap budgets + SVG clipPath |
| Files not served on Railway | `output: standalone` doesn't serve runtime files | `/api/uploads/` handler with Range support |

## Style Guide
- Theme system uses CSS custom properties (`--color-*`)
- 9 themes defined in `globals.css`
- Sidebar supports collapsed (44px icon-only) mode
- Admin dashboard at `/admin` with separate design tokens
