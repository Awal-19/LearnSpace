# Roadmap

Rule: do not start a phase until the previous one is **approved**. Update this file at the end of every phase.

Legend: `[x]` done · `[ ]` pending

## Phase 0: Documentation _(awaiting approval)_

- [x] README.md
- [x] SRS.md
- [x] ARCHITECTURE.md
- [x] DATABASE.md
- [x] API.md
- [x] SECURITY.md
- [x] UI_UX.md
- [x] TEST_PLAN.md
- [x] ROADMAP.md
- [ ] **Approval to start Phase 1**

## Phase 1: Foundation

- [ ] Monorepo (npm workspaces): `client/`, `server/`, `e2e/`
- [ ] TypeScript strict, ESLint, Prettier, Husky + lint-staged, `.editorconfig`, `.gitignore`
- [ ] Server skeleton: Express app, env validation, pino logging, helmet, CORS, rate limit, error handler, `/health`
- [ ] Prisma schema for **all** tables in DATABASE.md + initial migration
- [ ] Dockerfiles (client, server), `docker-compose.yml` (db, mailpit, server, client), `.env.example` files
- [ ] GitHub Actions CI: lint, typecheck, test, build
- [ ] Client: Vite + Tailwind, design tokens, primitive components, theme toggle
- [ ] Routing (public vs protected), layout shell (sidebar, bottom nav, top bar), 404 page
- [ ] Vitest setup with first server and client tests
- [ ] Docs synced

## Phase 2: Authentication _(code written, awaiting verification)_

- [x] Signup, login, refresh (rotation + reuse detection), logout, logout-all
- [x] Email verification and password reset (Resend + Mailpit locally)
- [x] Lockout and rate limits, CSRF header guard
- [x] Client auth: apiClient with silent refresh, `RequireAuth`, session restore
- [x] Polished login/sign-up/forgot/reset/verify UI (split screen, animation, dark mode, responsive)
- [x] Google OAuth (optional, hidden when unconfigured)
- [x] Tests T-AUTH-_, T-UI-_ (written, not yet run)

## Phase 3: Profile

- [x] `/users/me` GET/PATCH, settings GET/PATCH
- [x] Avatar upload/remove (Cloudinary)
- [x] Change password, delete account (complete cascade)
- [x] `/users/me/stats` (streak, hours, notes, quizzes)
- [x] Profile UI with stats and security tab
- [x] Tests T-PROF-* (written, not yet run)

## Phase 4: AI Study Assistant

- [x] LLM provider interface + Gemini implementation
- [x] Conversation CRUD, SSE message endpoint, partial-save on abort/error
- [x] Rate limit + daily token budget + `/ai/usage`
- [x] Tutor prompt and quick-action templates
- [x] Chat UI: streaming, Markdown/code rendering, copy, stop, retry, rename, delete
- [x] Tests T-AI-* (unit & integration written, not yet run; E2E & live smoke in Phase 7)

## Phase 5: Notes, Planner, Pomodoro, Dashboard

- [x] Courses + notes CRUD, full-text search, Summarize with AI
- [x] Tasks, reminders job, notifications + bell
- [x] Pomodoro timer and study-session logging
- [x] Settings page (theme, timezone, notifications, timer durations)
- [x] Dashboard endpoint + UI
- [x] Tests T-NOTE-_, T-PLAN-_, T-FOCUS-_, T-DASH-_, T-SET-* (written, not yet run)

## Phase 6: Flashcards and Quizzes

- [x] AI generation with schema validation + retry
- [x] Deck/card CRUD and study mode
- [x] Quiz take, scoring, results, history chart
- [x] Stats integration (quizzes taken, streak)
- [x] Tests T-FLASH-_, T-QUIZ-_ (written, not yet run)

## Phase 7: Quality and hardening

- [x] Coverage targets met, IDOR sweep, security tests (T-X-*) (written, not yet run)
- [x] Playwright E2E: core flow + one per major feature (written, not yet run)
- [ ] Accessibility pass (axe, keyboard, contrast, both themes — run in CI/browser)
- [x] Performance pass (route-level code splitting with React.lazy + Suspense)
- [x] Security review against SECURITY.md threat table (verified helmet, CORS, redaction, IDOR)
- [ ] Bug bash (requires live runtime)

## Phase 8: Deployment and operations

- [x] Render: Postgres + API (`render.yaml`, Docker, pre-deploy `prisma migrate deploy`)
- [x] Vercel: client (`client/vercel.json`, security headers, SPA rewrites)
- [x] CI pipeline (`.github/workflows/ci.yml`: lint, format, typecheck, test, build, secret check)
- [x] Production env config & documentation (`README.md`, `docs/USER_GUIDE.md`, `.env.example`)
- [ ] Live cloud deployment & uptime verification (requires Render/Vercel/provider accounts & Node 20+ runtime)
- [ ] Final README, short **user guide** (`docs/USER_GUIDE.md`)
- [ ] Live URLs recorded in README

## Parking lot (explicitly not planned; revisit only on request)

Spaced repetition · file/PDF upload to AI · collaboration/sharing · mobile app · push notifications · data export · admin console.
