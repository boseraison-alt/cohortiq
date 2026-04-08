# Study AI — Kellogg EMBA

AI-powered study assistant for MBA courses. Upload unlimited course materials, ask questions grounded in your content, generate audio podcasts, take practice tests weighted toward your weak areas, and review with flashcards.

## Features

- **Unlimited Materials** — Upload PDFs, DOCX, TXT files or paste text. Content is chunked for smart retrieval with no context window limits.
- **Week/Folder Organization** — Materials organized by week (1–15 auto-created per course). Drag materials between weeks. Filter all features by week range.
- **Grounded Q&A** — Ask questions answered strictly from your uploaded materials. If something isn't covered, the AI tells you.
- **Audio Podcasts** — Generate 5–60 minute two-host conversational podcasts from your materials. Natural-sounding audio via OpenAI TTS (Onyx + Nova voices) with live transcript highlighting. ~$0.15 per 10-minute episode.
- **Weighted Practice Tests** — AI tracks your performance by topic. Future tests automatically weight toward your weak areas (60/40 split).
- **Cumulative Final Reviews** — Generate comprehensive exams spanning all materials, perfect for midterm and final prep.
- **AI Grading** — Submit answers and get graded with specific feedback referencing course materials.
- **Flashcards** — Auto-generated from materials with flip-card review interface.
- **Performance Insights** — Dashboard showing accuracy by topic, weak area identification, and attempt history.
- **Invite-Only Auth** — Admin invites users via email link. Users register with email/password. No public signup.
- **Admin Dashboard** — Invite users, monitor per-user API costs in dollars, approve/reject uploaded materials before they enter the RAG.
- **Document Approval** — Uploaded materials are "pending" until admin approves. Only approved materials get chunked and used for Q&A, tests, and podcasts.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: Neon Postgres (serverless)
- **AI**: Anthropic Claude Sonnet 4 (Q&A, tests, grading) + OpenAI TTS (podcast audio)
- **Auth**: NextAuth.js with Google OAuth
- **Deployment**: Vercel

---

## Setup Instructions

### 1. Clone and install

```bash
git clone <your-repo-url>
cd kellogg-study-ai
npm install
```

### 2. Create Neon Database

1. Go to [neon.tech](https://neon.tech) and create a new project
2. Copy the connection string (it looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`)

### 3. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:

```
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."
```

Generate NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

### 4. Set up Database & Admin Account

```bash
npx prisma db push          # creates all tables
npx tsx prisma/seed.ts your@email.com YourPassword123   # creates admin user
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your admin credentials.

### 6. Invite Your First Users

1. Sign in → you'll land on the **Admin Dashboard**
2. Go to **Invites** tab → enter a user's email → click **Create Invite**
3. Copy the generated link and share it with the user
4. They visit the link, set their name and password, and can sign in

### 7. Approve Materials

When users upload materials, they appear as "pending" in the **Approvals** tab. Review the content and click **Approve & Chunk** to add them to the RAG, or **Reject** with an optional note.

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo>
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo
2. Add environment variables in Vercel dashboard:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` → `https://your-app.vercel.app`
   - `NEXTAUTH_SECRET`
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
3. Deploy

After deploying, seed your admin account (run locally with production DB URL):
```bash
DATABASE_URL="your-neon-prod-url" npx tsx prisma/seed.ts your@email.com YourPassword
```

---

## Usage

1. **Sign in** as admin
2. **Create a course** (e.g., "FINC 430 — Corporate Finance")
3. **Upload materials** — paste text or upload PDF/DOCX/TXT. Assign to a week.
4. **Ask questions** in the Q&A tab — filter by week if needed
5. **Generate podcasts** — select duration and weeks to cover
6. **Take practice tests** — start with "weighted" mode; as you grade answers, the AI learns your weak spots
7. **Review with flashcards** — generate and flip through cards
8. **Check insights** — see which topics need more work

Repeat weekly as you add new materials. The system gets smarter about your weak areas over time.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/    # Google OAuth
│   │   ├── courses/               # CRUD for courses
│   │   │   └── [id]/
│   │   │       ├── materials/     # Upload, chunk, delete
│   │   │       ├── weeks/         # Week management
│   │   │       ├── flashcards/    # Card CRUD
│   │   │       ├── performance/   # Performance data
│   │   │       └── podcasts/      # Saved podcasts
│   │   └── ai/
│   │       ├── qa/                # Q&A with retrieval
│   │       ├── practice/          # Test generation
│   │       ├── grade/             # Answer grading
│   │       ├── podcast/           # Podcast script gen
│   │       └── flashcards/        # Card generation
│   ├── dashboard/                 # Main app page
│   └── page.tsx                   # Landing/login
├── components/                    # React components
├── lib/
│   ├── auth.ts                    # NextAuth config
│   ├── claude.ts                  # Anthropic API
│   ├── chunks.ts                  # Chunking & retrieval
│   └── db.ts                      # Prisma client
└── types/                         # TypeScript types
```
