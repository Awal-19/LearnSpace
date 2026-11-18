# Test Plan

## 1. Strategy

| Level         | Tools                                                                                  | Scope                                                                                                                                                       | Where                                                   |
| ------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Unit          | Vitest                                                                                 | Pure logic: password/token helpers, streak calculation, quiz scoring, reminder time math, Zod schemas, prompt builders, timer logic                         | `server/src/**/*.test.ts`, `client/src/**/*.test.ts(x)` |
| Component     | Vitest + React Testing Library + MSW                                                   | Forms, validation messages, states (loading/empty/error), chat stream parser                                                                                | `client/src/**`                                         |
| Integration   | Vitest + Supertest + real PostgreSQL (CI service container / docker-compose `db-test`) | Every endpoint, with real DB and real middleware; only external boundaries (Resend, Cloudinary, Gemini) use test transports at the provider-interface level | `server/test/integration`                               |
| E2E           | Playwright (Chromium, plus Firefox/WebKit smoke in CI nightly)                         | Full browser flows against the running stack with Mailpit for emails and a local fake LLM server implementing the provider's HTTP shape                     | `e2e/`                                                  |
| Accessibility | `@axe-core/playwright`                                                                 | Zero serious/critical violations on each main screen, both themes                                                                                           | `e2e/a11y.spec.ts`                                      |
| Performance   | Lighthouse CI                                                                          | Perf ≥ 90, A11y ≥ 95, bundle budget                                                                                                                         | CI (Phase 7)                                            |
| Security      | `npm audit`, gitleaks, CodeQL, targeted tests                                          | See SECURITY.md threat table                                                                                                                                | CI + `server/test/security`                             |

Live LLM / Cloudinary / Resend calls are verified by a **manual smoke checklist** per phase (with real keys) in addition to automated tests, since automated tests must be deterministic and free.

Every endpoint in [API.md](API.md) has at least: happy path, validation failure, unauthenticated (401), and cross-user access (404) where applicable.

**Coverage targets:** server services ≥ 80% lines; client features ≥ 60%; all auth/security paths 100% of branches.

## 2. How to run _(available from the noted phase)_

```bash
npm test                       # all unit + integration (needs: docker compose up -d db)
npm run test --workspace server
npm run test --workspace client
npm run test:e2e               # starts stack, runs Playwright (npx playwright install first)
npm run test:coverage
npm run lint && npm run typecheck
```

## 3. Test cases by feature

IDs map to SRS requirements. P = phase where implemented.

### Auth (P2)

| ID        | Case                                                                                                                                                                           | Level    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| T-AUTH-01 | Signup valid → 201, user stored, password hashed (not equal to plaintext, argon2 prefix), verification email sent, cookie set httpOnly                                         | Int      |
| T-AUTH-02 | Signup duplicate email, different case → 409 `EMAIL_TAKEN`                                                                                                                     | Int      |
| T-AUTH-03 | Signup weak password / invalid email / missing name → 400 with field details                                                                                                   | Int/Unit |
| T-AUTH-04 | Login success; wrong password and unknown email return identical 401                                                                                                           | Int      |
| T-AUTH-05 | 5 failed logins → 423 `ACCOUNT_LOCKED`; correct password still rejected until lock expires; counter resets after success                                                       | Int      |
| T-AUTH-06 | Remember me: persistent cookie has Max-Age ≈ 30 d; otherwise no Max-Age                                                                                                        | Int      |
| T-AUTH-07 | Refresh rotates token; old token reuse → 401 and entire family revoked                                                                                                         | Int      |
| T-AUTH-08 | Refresh without `X-Requested-With` → 403 `CSRF_BLOCKED`                                                                                                                        | Int      |
| T-AUTH-09 | Expired access token → 401 `TOKEN_EXPIRED`; tampered token → 401 `UNAUTHENTICATED`                                                                                             | Int      |
| T-AUTH-10 | Logout revokes token; refresh afterwards fails; logout-all revokes every session                                                                                               | Int      |
| T-AUTH-11 | Verify email valid → verified; reuse/expired/garbage → 400 `INVALID_TOKEN`                                                                                                     | Int      |
| T-AUTH-12 | Forgot password: existing vs non-existing email give same status/body; email sent only for existing                                                                            | Int      |
| T-AUTH-13 | Reset password: valid token works once; all sessions revoked; old password fails; expired token fails                                                                          | Int      |
| T-AUTH-14 | Google callback: bad state → redirect with error; unverified Google email → refused; existing email links identity; new email creates user (provider stubbed at HTTP boundary) | Int      |
| T-AUTH-15 | Protected route redirects unauthenticated users to `/login?next=` and returns after login                                                                                      | E2E      |
| T-AUTH-16 | Silent refresh on reload keeps the user logged in; concurrent 401s trigger one refresh                                                                                         | Comp/E2E |
| T-AUTH-17 | Auth rate limit returns 429 with `Retry-After`                                                                                                                                 | Int      |

### Login/Sign-up UI (P2)

| ID      | Case                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| T-UI-01 | Inline validation messages appear on blur and on submit, linked via `aria-describedby`                                      |
| T-UI-02 | Show/hide password toggles input type and has accessible name/state                                                         |
| T-UI-03 | Submit disables the button, shows spinner; server error renders `role="alert"`                                              |
| T-UI-04 | Theme toggle persists across reload; respects OS preference initially                                                       |
| T-UI-05 | Layout at 360, 768, 1280 px (Playwright screenshots, no horizontal scroll); keyboard-only completion of the form; axe clean |
| T-UI-06 | Google button hidden when `/auth/providers` returns `google:false`                                                          |

### Profile (P3)

| ID        | Case                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-PROF-01 | GET/PATCH `/users/me` persists each field; bio 501 chars → 400; null clears optional                                                                                |
| T-PROF-02 | Cannot change email or id via PATCH (stripped/rejected)                                                                                                             |
| T-PROF-03 | Avatar: valid PNG → URL stored; GIF/SVG/renamed `.exe` → 415; > 2 MB → 413; replace deletes old public ID; remove clears                                            |
| T-PROF-04 | Stats correctness: seeded sessions/quizzes/notes produce exact streak, hours, counts (timezone and day-boundary cases, DST, gap day, today-empty-yesterday-present) |
| T-PROF-05 | Change password: wrong current → 401; success revokes other sessions but keeps current; new password works                                                          |
| T-PROF-06 | Delete account: wrong password rejected; success cascades every table (assert row counts = 0), avatar deletion called, login fails afterwards                       |
| T-PROF-07 | E2E: edit profile, reload, values persist                                                                                                                           |

### AI assistant (P4)

| ID      | Case                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| T-AI-01 | Create/list/rename/delete conversation; other user gets 404 for each                                                                            |
| T-AI-02 | Send message streams `meta`, ≥1 `delta`, `done`; user and assistant messages persisted; usage recorded                                          |
| T-AI-03 | Provider error mid-stream → `error` event, partial saved with `status=partial`                                                                  |
| T-AI-04 | Client abort stops upstream request and saves partial                                                                                           |
| T-AI-05 | Rate limit: 21st request/min → 429; budget exceeded → 429 `AI_BUDGET_EXCEEDED` with `resetsAt`; budget update is atomic under parallel requests |
| T-AI-06 | Unverified email → 403; missing key → 503 `AI_UNAVAILABLE`                                                                                      |
| T-AI-07 | Quick actions build the expected prompt templates (unit); client can't inject system role                                                       |
| T-AI-08 | Context trimming keeps newest ≤ 20 messages / token cap                                                                                         |
| T-AI-09 | Markdown renders code blocks with copy button; `<script>` / `javascript:` links in model output are neutralised                                 |
| T-AI-10 | API key never appears in any response, client bundle (grep build output in CI) or logs                                                          |
| T-AI-11 | E2E with fake LLM server: send, see streamed text, reload, history present, rename, delete                                                      |
| T-AI-12 | Manual live smoke with real Gemini key: tutor tone, follow-up question present                                                                  |

### Notes, courses (P5)

T-NOTE-01 CRUD · 02 search returns only own notes, matches title and body, ranks title higher, handles special characters · 03 course filter and `none` · 04 deleting a course keeps notes uncategorised · 05 duplicate course name → 409 · 06 summarize stores `aiSummary` and leaves body untouched; < 50 chars → 400 · 07 E2E create → search → edit → delete.

### Planner and notifications (P5)

T-PLAN-01 CRUD and validation (offset without due date → 400) · 02 views today/upcoming/overdue use user's timezone (midnight edge) · 03 completing sets `completedAt`; un-completing clears · 04 reminder job fires once, creates notification, sends email only if opted-in and verified · 05 editing due date re-arms reminder · 06 job is idempotent when run twice concurrently · 07 mark read / read-all · 08 E2E add task with reminder (clock controlled), see bell badge.

### Focus (P5)

T-FOCUS-01 session creation rules (too short, too long, future, stale) → 400 · 02 duplicate `startedAt` is idempotent · 03 stats reflect a new session immediately · 04 timer unit tests with fake timers: wall-clock based, survives simulated reload and tab throttling · 05 E2E complete a short session (durations overridable in test settings) and see hours increase.

### Dashboard (P5)

T-DASH-01 returns only own data, correct counts · 02 new user shows empty states · 03 greeting boundaries (unit) · 04 E2E.

### Flashcards and quizzes (P6)

T-FLASH-01 generate from note/topic: valid JSON → N cards saved; invalid JSON retried once; still invalid → 502 and nothing saved · 02 exactly one of `noteId`/`topic` · 03 other user's note → 404 · 04 card CRUD and ordering · 05 deleting a deck cascades.
T-QUIZ-01 generation schema validation (4 options, valid `correctIndex`) · 02 attempt scoring correct incl. skipped (`null`) and wrong answer-length → 400 · 03 `GET quiz` never exposes `correctIndex` · 04 history endpoints and averages · 05 attempts update "quizzes taken" and streak · 06 E2E generate (fake LLM) → take → results → history.

### Settings (P5)

T-SET-01 theme/timezone/notification toggles persist · 02 invalid timezone → 400 · 03 email reminders require verified email.

### Cross-cutting (P1 onward, hardened P7)

| ID     | Case                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| T-X-01 | Error handler returns the envelope with `requestId` and never leaks stack traces in production mode |
| T-X-02 | Unknown route → 404 JSON; malformed JSON → 400; oversized body → 413                                |
| T-X-03 | helmet headers present; CORS rejects non-allow-listed origin; preflight works for allowed           |
| T-X-04 | Env validation fails fast with clear message when a required variable is missing                    |
| T-X-05 | Migrations apply cleanly to an empty DB and `prisma migrate diff` shows no drift (CI)               |
| T-X-06 | `/health/ready` returns 503 when DB is down                                                         |
| T-X-07 | IDOR sweep: for each resource route, user B gets 404 on user A's IDs (table-driven test)            |
| T-X-08 | Logs never contain passwords, tokens or cookies (redaction test)                                    |

## 4. E2E core flow (required minimum)

`e2e/core-flow.spec.ts`: sign up → read verification email in Mailpit → verify → log out → log in with remember me → edit profile → create a note → ask the assistant (fake LLM) and see a streamed reply → add a task → run a short focus session → check profile stats changed → log out → protected route redirects to login.

## 5. CI (GitHub Actions)

Jobs on every PR: `lint` + `typecheck` → `test` (Postgres service) → `build` → `e2e` (Playwright, uploads traces) → `security` (audit, gitleaks, CodeQL). Merging requires all green.

## 6. Manual smoke checklist (with real services; each phase)

- [ ] Verification and reset emails arrive via Resend and links work
- [ ] Avatar appears in Cloudinary dashboard and in the app; deleting the account removes it
- [ ] Gemini streaming works in the browser on a slow connection (throttle) and on mobile Safari
- [ ] Google login works with real credentials (if enabled)
- [ ] Production deploy: cookies persist after refresh, CORS OK, streaming isn't buffered

## 7. Exit criteria per phase

All new tests pass, coverage targets not regressed, lint clean, docs updated, manual smoke items for that phase ticked.
