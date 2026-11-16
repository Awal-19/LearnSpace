# LearnSpace

A simple, fast, calm learning platform for university students — featuring real authentication, a multimodal AI Study Assistant (text, images, camera capture, PDF/DOCX/PPTX/TXT/CSV), Study from Documents (Answer Past Questions & Generate Questions from Slides), course notes with AI summaries, a study planner with reminders, a Pomodoro focus timer, and AI-generated flashcards & quizzes.

## Documentation
- **[docs/README.md](docs/README.md)** — Full overview, stack, setup, and deployment index
- **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** — Student user guide
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — System architecture & data flows
- **[docs/API.md](docs/API.md)** — REST & SSE API reference
- **[docs/DATABASE.md](docs/DATABASE.md)** — PostgreSQL schema & ER diagram
- **[docs/SECURITY.md](docs/SECURITY.md)** — Threat model & security controls
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — Phase-by-phase build status

## Quick Start (Local Development)
Requires **Node.js 20+** and **Docker**.

```bash
cp .env.example .env
cp server/.env.example server/.env
# Fill in JWT_SECRET (>= 32 chars) in .env and server/.env, plus optional NVIDIA_API_KEY / NVIDIA_VISION_MODEL / GEMINI_API_KEY / CLOUDINARY_URL / RESEND_API_KEY

npm install
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run dev
```

- Client: `http://localhost:5173`
- API: `http://localhost:4000/api/v1`

## Quality & Deployment
- **Checks:** `npm run lint && npm run typecheck && npm test && npm run build`
- **Backend (Render):** [render.yaml](render.yaml) (`server/Dockerfile`, `npx prisma migrate deploy`, `/api/v1/health/ready`)
- **Frontend (Vercel):** [client/vercel.json](client/vercel.json) (SPA rewrites + security headers)
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml)

