# LearnSpace

A simple, fast, calm learning platform for university students: an AI tutor, notes, flashcards and quizzes, a study planner and a focus timer, with real stats computed from real activity.

> **Status:** Core workspace, academic modules (Courses, Timetable, Exams & AI Revision Plans, Study from Documents, SM-2 Flashcards & Quizzes, GPA Calculator, Progress Analytics, Data Export), and Admin Console implemented and verified with automated test suites (see [ROADMAP.md](ROADMAP.md) and [USER_GUIDE.md](USER_GUIDE.md)).

## Documentation index

| Doc                                | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| [USER_GUIDE.md](USER_GUIDE.md)     | End-user walkthrough for all student features                        |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md)   | Admin console permissions, moderation, and analytics guide           |
| [SRS.md](SRS.md)                   | Problem, scope, requirements, user stories + acceptance criteria     |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, components, auth flow, AI chat flow, stack decisions |
| [DATABASE.md](DATABASE.md)         | ER diagram, tables, indexes                                          |
| [API.md](API.md)                   | Every REST endpoint, error codes                                     |
| [SECURITY.md](SECURITY.md)         | Threat model, auth strategy, data protection                         |
| [UI_UX.md](UI_UX.md)               | Sitemap, flows, wireframes, design tokens                            |
| [TEST_PLAN.md](TEST_PLAN.md)       | Test cases per feature, how to run                                   |
| [ROADMAP.md](ROADMAP.md)           | Phases with checkboxes                                               |

## Features

**Core:** email/password auth (OTP verification, reset, refresh sessions) and optional Google sign-in · split-screen login/sign-up · profile with custom avatar studio and real stats · Courses hub linking notes, documents, tasks, focus, flashcards, quizzes, and chats · AI Study Assistant (streaming multimodal chat, saved conversations, quick actions) · Progress Analytics & redesigned Daily Summary dashboard · personal JSON data export.

**Academic tools:** Study from Documents (Past Questions & Slide Question Generator) · Timetable with clash detection and class reminders · Exams with countdowns and AI Revision Plans synced to Planner · notes by course with FTS and AI summary · study planner with local-timezone reminders · Pomodoro timer · SM-2 spaced-repetition flashcards (CSV import, card images, keyboard/swipe review) & AI quizzes · GPA & CGPA calculator (custom scales, retakes, trend chart, target planner) · Admin Console.

## Stack (summary; reasoning in [ARCHITECTURE.md](ARCHITECTURE.md#7-technology-decisions))

| Layer     | Choice                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------- |
| Front end | React 18 + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query, React Hook Form + Zod |
| Back end  | Node 20 + Express + TypeScript, Zod validation, pino logging                                    |
| Database  | PostgreSQL 16 + Prisma (migrations)                                                             |
| Avatars   | Cloudinary                                                                                      |
| Email     | Resend                                                                                          |
| AI        | Google Gemini API behind a provider interface (swappable)                                       |
| Quality   | ESLint, Prettier, Vitest, Supertest, Playwright                                                 |
| DevOps    | Docker + docker-compose, GitHub Actions, Vercel (client), Render (server + Postgres)            |

## Repository layout

```
learnspace/                      (repository root)
├─ client/                       React + Vite + Tailwind app
│  └─ src/{app,design,pages,lib}   app shell/routing, design system, pages, API client
├─ server/                       Express API
│  ├─ src/{config,lib,middleware,modules}
│  ├─ prisma/                    schema.prisma + migrations
│  └─ test/                      unit + integration tests
├─ e2e/                          Playwright tests
├─ docs/                         This documentation
├─ docker/postgres/init.sql      creates the learnspace_test database
├─ docker-compose.yml            db, mailpit, server, client
├─ .env.example                  root, used only by docker-compose
└─ .github/workflows/ci.yml
```

## Accounts and keys you will need

Nothing is faked. These are the external services; each is free-tier capable. Exact variable names are in `server/.env.example`.

| Needed from                            | Used for                           | Env var(s)                                 | Needed by phase |
| -------------------------------------- | ---------------------------------- | ------------------------------------------ | --------------- |
| PostgreSQL (local via Docker)          | Data                               | `DATABASE_URL`                             | 1               |
| Resend (resend.com)                    | Verification/reset/reminder emails | `RESEND_API_KEY`, `EMAIL_FROM`             | 2               |
| Cloudinary                             | Avatar storage                     | `CLOUDINARY_URL`                           | 3               |
| Google AI Studio (aistudio.google.com) | LLM                                | `GEMINI_API_KEY`                           | 4               |
| Google Cloud OAuth client _(optional)_ | "Continue with Google"             | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 2               |
| Vercel, Render accounts                | Hosting                            | n/a                                        | 8               |

JWT secrets are generated by you locally (`openssl rand -base64 48`) and never committed.

## Setup and run

Prerequisites: **Node 20+** (see `.nvmrc`), **Docker Desktop** (running), Git.

```bash
# 1. Environment files (nothing secret is committed)
cp .env.example .env                    # used only by docker compose
cp server/.env.example server/.env      # set JWT_SECRET (32+ chars)
cp client/.env.example client/.env

# 2. Infrastructure: PostgreSQL (:5432) and Mailpit (UI http://localhost:8025)
docker compose up -d db mailpit

# 3. Install, generate the Prisma client, create the schema
npm install                             # also commit the generated package-lock.json
npm run db:generate
npm run db:migrate                      # prisma migrate dev (applies both migrations)

# 4. Run
npm run dev                             # client http://localhost:5173, API http://localhost:4000
```

PowerShell: use `Copy-Item` instead of `cp`. Run `npm run format` once before your first commit so `format:check` in CI passes.

**Everything in containers instead:** `docker compose up --build` (needs `JWT_SECRET` in root `.env`; migrations run on server start).

| Command                                                       | Does                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                                 | Client + server with hot reload                                                                        |
| `npm run lint` / `lint:fix`                                   | ESLint                                                                                                 |
| `npm run format` / `format:check`                             | Prettier                                                                                               |
| `npm run typecheck`                                           | `tsc --noEmit` for server and client                                                                   |
| `npm test`                                                    | Vitest: server unit + integration (no DB needed yet), client component/unit                            |
| `npm run test:coverage`                                       | Same, with coverage                                                                                    |
| `npm run test:e2e`                                            | Playwright smoke tests (`npx playwright install chromium` first; needs the stack running or starts it) |
| `npm run build`                                               | Production builds                                                                                      |
| `npm run db:migrate` / `db:deploy` / `db:studio` / `db:reset` | Prisma migrate dev / deploy / Studio / reset                                                           |

**What you can see after Phase 1**

- http://localhost:5173/ redirects to `/login` (route guard working; the form itself is Phase 2)
- http://localhost:5173/dev/design: design-system gallery plus a live API/DB connectivity check (dev builds only)
- http://localhost:5173/dev/shell: the authenticated layout shell (sidebar, mobile tabs, top bar) without needing an account (dev builds only)
- http://localhost:4000/api/v1/health and `/api/v1/health/ready`

## Deploy _(planned, Phase 8)_

1. **Database + API on Render:** managed Postgres + a Docker web service from `server/Dockerfile`; set env vars; release command `prisma migrate deploy`.
2. **Client on Vercel:** root `client/`, set `VITE_API_URL`.
3. **Cookies:** use one custom domain with sibling subdomains (`app.example.com`, `api.example.com`) so the refresh cookie is first-party (same-site). Details and fallback in [SECURITY.md](SECURITY.md#3-authentication-strategy).
4. Configure Google OAuth redirect URI, Resend domain, and `CLIENT_URL`/`CORS_ORIGIN` on the server.

## Conventions

- TypeScript everywhere, strict mode.
- Every endpoint: validated (Zod), authenticated unless listed public, tested.
- Docs are updated in the same PR as the code they describe.
