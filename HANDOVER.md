# CohortIQ — Developer Handover

**Platform:** AI-powered study assistant for Kellogg EMBA 144
**Stack:** Next.js 14 App Router · Prisma · Neon Postgres · Anthropic Claude · OpenAI TTS · NextAuth
**Deployment:** Vercel

---

## 1. Quick Start (local dev)

```bash
npm install
# fill .env (see section 5)
npx prisma generate
npx prisma db push
npm run dev        # http://localhost:3000
```

> **Windows note:** If `npx` is not in the Git Bash PATH, run Prisma via:
> ```bash
> PATH="/c/Program Files/nodejs:$PATH" node_modules/.bin/prisma db push
> ```

---

## 2. Feature Inventory

| Tab key | Icon | Component | Description |
|---------|------|-----------|-------------|
| `customize` | ⚙️ | `CustomizeTab.tsx` | Preferences: industry, examples, level, font, reading mode |
| `chat` | 🤖 | `ChatTab.tsx` | RAG Q&A, persistent sessions, Photo-to-Insight (📷), Devil's Advocate (⚔️) |
| `podcast` | 🎙 | `PodcastTab.tsx` | Script + TTS audio generation (OpenAI TTS) |
| `videos` | 🎬 | `VideosTab.tsx` | External/uploaded video links per week |
| `cards` | 🃏 | `FlashcardsTab.tsx` | SM-2 spaced repetition flashcards |
| `practice` | 📝 | `PracticeTab.tsx` | AI-generated practice questions + grading |
| `insights` | 📊 | `PerformanceTab.tsx` | Score history charts by topic |
| `plan` | ⏰ | `StudyPlanTab.tsx` | AI-generated weekly study plan |
| `map` | 🧩 | `ConceptMapTab.tsx` | Interactive mind map (glassmorphism + bloom animations) |
| `brain` | 🧠 | `BrainSearch.tsx` | Semantic search across all course materials |
| `worklab` | ⚗️ | `WorkLabTab.tsx` | Apply course frameworks to real-world data (NDA disclaimer, Experimental) |
| `credits` | 💳 | `UserCreditsTab` (inline in dashboard) | API usage cost tracker |

---

## 3. Architecture

```
src/
├── app/
│   ├── page.tsx                  # Sign-in page
│   ├── dashboard/page.tsx        # Main SPA shell — tab routing, theme, lang, prefs
│   ├── admin/                    # Admin panel: users, material approval, usage stats
│   ├── api/
│   │   ├── ai/                   # Claude routes: chat, flashcards, podcast, practice,
│   │   │                         #   concept-map, brain, worklab, narration, annotation,
│   │   │                         #   study-plan, qa, grade
│   │   ├── courses/[id]/         # Course CRUD + materials, weeks, podcasts, videos, flashcards
│   │   ├── cards/                # Flashcard due-queue + SM-2 review
│   │   ├── admin/                # Admin-only: user/material/invite management, usage reports
│   │   ├── auth/                 # NextAuth + register + forgot/reset password
│   │   ├── dm/                   # Direct messages between users
│   │   ├── presence/             # Online status
│   │   └── user/                 # Preferences GET/PUT, usage GET
│   └── globals.css               # Design tokens, themes, haptic design system
├── components/                   # All tab components + Sidebar, ThemePicker, OnlineChat
├── lib/
│   ├── auth.ts                   # NextAuth config (credentials provider)
│   ├── chunks.ts                 # BM25-style RAG retrieval
│   ├── claude.ts                 # askClaudeChat() — supports vision content blocks
│   ├── db.ts                     # Prisma singleton
│   ├── preferences.ts            # getUserPrefsPrompt() — prepended to every Claude call
│   ├── tts.ts                    # OpenAI TTS wrapper
│   ├── ffmpeg.ts                 # Audio concatenation for long podcasts
│   ├── usage.ts                  # logUsage() — token cost tracking
│   └── i18n.ts                   # 5-language translations (en/ja/es/fr/zh)
└── types/index.ts
```

---

## 4. Environment Variables

| Key | Description |
|-----|-------------|
| `DATABASE_URL` | Neon Postgres connection string (pooled) |
| `NEXTAUTH_URL` | Full URL e.g. `https://yourapp.vercel.app` |
| `NEXTAUTH_SECRET` | Random string for session signing |
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | Used for TTS only (podcast audio) |

---

## 5. Database Schema — Key Models

| Model | Purpose |
|-------|---------|
| `User` | Auth + prefs (`prefIndustry`, `prefExamples`, `prefLevel`, `prefFont`, `prefReadingMode`) |
| `Course` | Top-level container; has color, name, userId |
| `Week` | 1–15 weeks per course for material organisation |
| `Material` | Uploaded content (pending → approved); chunks extracted on approval |
| `Chunk` | RAG units — text segments with `chunkIndex` |
| `Flashcard` | Auto-generated; SM-2 fields: `easeFactor`, `interval`, `repetitions` |
| `Podcast` | Script + audio URL + duration |
| `ChatSession` | Named conversation container |
| `ChatMessage` | `role` + `content` (images stored as `[Photo attached]`) |
| `Performance` | Topic-level quiz scores |
| `UsageLog` | Token counts + estimated cost per AI action |

> **After any schema change:** run `npx prisma db push` then restart the dev server.
> On Windows with Git Bash: `PATH="/c/Program Files/nodejs:$PATH" node_modules/.bin/prisma db push`

---

## 6. AI Route Pattern

Every AI route follows this consistent pattern:

```typescript
const userId = (session.user as any).id;
const prefs  = await getUserPrefsPrompt(userId);   // personalisation block
const system = `${prefs}${specificSystemPrompt}`;
const answer = await askClaudeChat(system, messages, maxTokens);
await logUsage({ userId, courseId, action, inputText, outputText });
```

RAG context is retrieved via `retrieveRelevantChunks()` in `src/lib/chunks.ts` (BM25-style keyword scoring against `Chunk` records).

---

## 7. Haptic Design System

Defined in `src/app/globals.css`, layered on top of Tailwind:

| Class | Effect |
|-------|--------|
| `.glass` | `backdrop-filter: blur(18px)` + semi-transparent bg (theme-aware for light/dark) |
| `.glass-subtle` | Lighter blur for headers/toolbars |
| `.btn-haptic` | Spring lift on hover (`translateY(-1px)`), snap-down on click (`scale(0.95)`) |
| `.card-lift` | Float 2px up + shadow bloom on hover |
| `.node-bloom` | Mind map entrance: scale `0.3→1.18→1`, 1.1s spring, blur clearing |
| `.node-bloom-d1`…`d8` | Stagger delays: 100ms apart per sibling |
| `.node-float` + `.node-float-d1`…`d8` | Persistent organic oscillation (±5px, 3.5–5s, phase-offset per node) |
| `.root-breathe` | Continuous glow pulse on mind map root node |
| `.path-animate` | SVG connector draw-on effect using `pathLength="1"` |
| `.slide-from-right` | Info panel entrance animation |
| `.pop-in` | Badge/chip entrance |
| `.shimmer` | Loading skeleton shimmer |

---

## 8. Accessibility (Preferences Tab)

Stored in `User.prefFont` and `User.prefReadingMode`. Applied as CSS classes on the dashboard content wrapper.
Changes take effect instantly via a `prefs-saved` custom browser event (no page reload).

| Setting | Options |
|---------|---------|
| Font | `""` (default system) / `"opendyslexic"` → `.font-dyslexic` class |
| Reading Mode | `""` (default) / `"focused"` → `.reading-focused` class (narrow column, generous spacing) |

OpenDyslexic loaded via CDN: `@fontsource/opendyslexic@5`

---

## 9. User Levels (`src/lib/preferences.ts`)

| Value | UI Label | Claude Behaviour |
|-------|----------|-----------------|
| `5yo` | Beginner | Simple language, heavy analogies |
| `highschool` | Learner | Clear explanations, moderate vocabulary |
| `manager` | Manager | Business framing, ROI focus, skip theory |
| `expert` | Expert | Strategic, precise, assume deep domain knowledge |
| `csuite` / `phd` | _(legacy)_ | Treated identically to `expert` |

---

## 10. Work Lab

**Component:** `src/components/WorkLabTab.tsx`
**API:** `src/app/api/ai/worklab/route.ts`

- One-time NDA/confidentiality disclaimer gated by `localStorage` key `worklab_disclaimer_v1`
- 8 preset framework chips (Porter's 5 Forces, SWOT, CAPM, etc.) + free-text input
- RAG retrieves 12 chunks matching the framework query
- Response always appends: _"For educational purposes only…"_ footer
- Logged as action `"worklab"` in `UsageLog`
- Marked **Experimental** in the UI header

---

## 11. Chat Features

### Photo-to-Insight
- 📷 button in input bar opens `<input type="file" accept="image/*">`
- Image read as base64 via `FileReader` and sent to `/api/ai/chat` as an Anthropic vision content block
- DB stores text label `[Photo attached]` — base64 is never persisted
- After response: banner offers to submit extracted content as a pending course material

### Devil's Advocate
- ⚔️ toggle in input bar; active = branded colour background
- Injects a system prompt block instructing Claude to challenge, not validate
- Socratic mode: answers questions with sharper questions, concedes only after defence

---

## 12. Known Issues / Pending Work

| Issue | Notes |
|-------|-------|
| Photo-to-Insight — image not in DB | By design; label only stored |
| WorkLabTab mobile layout | Chips + textarea need responsive review |
| Admin materials list — no pagination | Fine up to ~500 items |
| Mind map collapse animation | Exit animations not implemented (collapse is instant) |

---

## 13. Recent Changes (April 2026)

- **Preferences tab** — renamed from "Customize", moved to first position
- **Accessibility fields** — `prefFont` + `prefReadingMode` added to schema and migrated ✓
- **Level consolidation** — C-Suite + PhD merged into single `expert` level; Student → Learner
- **Work Lab tab** — added after Master Mind (🧠), with NDA disclaimer modal
- **Photo-to-Insight** — camera upload in Chat with vision API + material submission
- **Devil's Advocate** — ⚔️ toggle in Chat that flips Claude to boardroom challenger mode
- **Bug fix** — `userId` undefined in `brain/route.ts` (missing declaration after session check)
- **Bug fix** — "Unexpected end of JSON input" in Chat — outer try/catch added to chat route
- **Haptic design system** — glassmorphism, bloom/float animations, spring physics on buttons
- **Prisma migration** — `prefFont` + `prefReadingMode` pushed to production DB ✓

---

## 14. Deployment Checklist (Vercel)

- [ ] All 5 env vars configured in Vercel dashboard
- [ ] `DATABASE_URL` uses Neon **pooled** connection string
- [ ] `NEXTAUTH_URL` set to production domain (no trailing slash)
- [ ] `NEXTAUTH_SECRET` set to a strong random string
- [ ] Build command set to: `prisma generate && next build`
- [ ] Run `prisma db push` against production DB after any schema changes
- [ ] Verify `/api/auth/session` returns 200 after deploy
