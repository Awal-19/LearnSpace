# LearnSpace

A simple, fast, calm learning platform for university students — featuring real authentication, Courses organization, Timetable & class reminders, Exams & AI Revision Plans, a multimodal AI Study Assistant (text, images, camera capture, PDF/DOCX/PPTX/TXT/CSV), Study from Documents (Answer Past Questions & Generate Questions from Slides), course notes with AI summaries, a study planner with reminders, a Pomodoro focus timer, SM-2 spaced-repetition flashcards & quizzes, a GPA & Grades calculator, and progress analytics with personal JSON data export.

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

## Email & EmailJS Setup

- **Sensitive auth emails (verification, password reset, OTPs, reminders):** Sent exclusively from the backend ([server/src/lib/email.ts](server/src/lib/email.ts)), switchable via `EMAIL_PROVIDER` (`auto` | `resend` | `smtp` | `emailjs`). For EmailJS on the server, set `EMAIL_PROVIDER=emailjs`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, and `EMAILJS_PRIVATE_KEY` (never expose the private key in the client).
- **Non-sensitive contact/feedback emails:** Sent from the browser via [client/src/services/email.ts](client/src/services/email.ts) (`@emailjs/browser`) with a honeypot field and a 30-second submission cooldown. Configure `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, and `VITE_EMAILJS_PUBLIC_KEY` in `client/.env` (locally) or Netlify/Vercel environment variables.
- **Template variables:**
  - Client feedback template: `{{from_name}}`, `{{from_email}}`, `{{category}}`, `{{subject}}`, `{{message}}`, `{{app_name}}`
  - Server auth/reminder template: `{{to_email}}`, `{{to_name}}`, `{{subject}}`, `{{message}}`, `{{app_name}}`

## Quality & Deployment

- **Checks:** `npm run lint && npm run typecheck && npm test && npm run build`
- **Admin Console:** Available at `/admin` for `admin` and `super_admin` accounts. See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) and seed the first admin with `ADMIN_EMAIL=... npm run admin:seed -w server`.
- **Backend (Render):** [render.yaml](render.yaml) (`server/Dockerfile`, `npx prisma migrate deploy`, `/api/v1/health/ready`)
- **Frontend (Vercel):** [client/vercel.json](client/vercel.json) (SPA rewrites + security headers)
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml)
