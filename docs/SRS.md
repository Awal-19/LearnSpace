# Software Requirements Specification: LearnSpace

## 1. Problem

University students juggle lecture notes, deadlines and revision across scattered tools (note apps, chat AI, planners, timers). Generic AI chats don't remember their coursework, don't teach step by step, and don't connect to study habits. Students need one lightweight place to learn, practise and track progress.

## 2. Objectives

| # | Objective | Measure |
|---|---|---|
| O1 | Simple, clean, fast | Core pages interactive < 2 s on 4G; Lighthouse Perf ≥ 90, A11y ≥ 95 |
| O2 | Reliable | Error rate < 1% of requests; all data persisted; graceful AI failure |
| O3 | Genuinely useful tutoring | Tutor prompt gives step-by-step answers and follow-up questions |
| O4 | Honest stats | Every stat derived from stored activity rows, none hand-set |
| O5 | Safe | OWASP ASVS L1 baseline; secrets only in server env |

## 3. Scope

**In scope:** web app (responsive, light/dark), REST API, PostgreSQL persistence, email, avatar storage, AI chat/summaries/flashcards/quizzes, planner, timer, notifications.

**Out of scope (v1):** native mobile apps, real-time collaboration, file/PDF/image upload to AI, spaced-repetition scheduling, social features, payments, admin console, i18n, offline mode.

**Complexity flags** (recommendation: keep simple or drop):
- **Google sign-in**: optional; account-linking edge cases. Kept as the last item of Phase 2; drop if no Google credentials.
- **Email reminders**: need a scheduler and verified sending domain. In-app reminders ship first; email is opt-in per user.
- **Spaced repetition**: excluded; plain flashcard review only.
- **Rich text notes**: excluded; notes are Markdown (textarea + preview), which is simpler and safer than HTML.

## 4. Users and roles

Single role: **Student** (authenticated user). Anonymous visitors can only see auth pages. No admin role in v1.

## 5. Functional requirements

IDs are referenced by [TEST_PLAN.md](TEST_PLAN.md).

### 5.1 Authentication (AUTH)
- AUTH-1 Sign up with name, email, password. Email must be unique (case-insensitive).
- AUTH-2 Password policy: ≥ 8 chars, at least one letter and one number, max 128 characters; stored with argon2id.
- AUTH-3 Verification email with single-use token (24 h expiry). Unverified users can log in, but see a banner and cannot use AI features or email notifications until verified.
- AUTH-4 Login with email + password; "Remember me" controls refresh-cookie lifetime (30 days vs. browser session).
- AUTH-5 Short-lived access token (15 min) + rotating refresh token in httpOnly cookie; reuse of a rotated token revokes the whole token family.
- AUTH-6 Logout revokes the current refresh token; "log out everywhere" revokes all.
- AUTH-7 Forgot password sends reset link (1 h expiry, single use) with a response that never reveals whether the email exists. Reset revokes all sessions.
- AUTH-8 Optional Google OAuth (Authorization Code + PKCE). Links to an existing account only when Google reports the email as verified.
- AUTH-9 Protected routes on client (redirect to login) and server (401).
- AUTH-10 Brute-force protection: rate limit and temporary lockout on repeated failures.

### 5.2 Login/sign-up UI (UI-AUTH)
- Split screen: animated gradient/illustration panel + form; collapses to form-only on mobile.
- Show/hide password, remember me, inline Zod validation, loading and error states, micro-animations, light/dark, keyboard accessible, respects `prefers-reduced-motion`.

### 5.3 Profile (PROF)
- PROF-1 View/edit name, student ID, programme, level, university, bio (≤ 500 chars).
- PROF-2 Avatar upload (JPEG/PNG/WebP, ≤ 2 MB) to Cloudinary; replace and remove.
- PROF-3 Stats from real data: study streak (consecutive days), hours studied, notes created, quizzes taken.
- PROF-4 Change password (requires current password; revokes other sessions).
- PROF-5 Delete account (requires password or, for Google-only accounts, a recent re-login); hard-deletes all user data and the Cloudinary avatar.

### 5.4 AI Study Assistant (AI)
- AI-1 Chat with streaming tokens (SSE), Markdown + syntax-highlighted code, copy button per message/code block.
- AI-2 Conversations and messages persisted per user. Create, rename, delete. Title auto-generated from the first message, editable.
- AI-3 Quick actions: Explain simply, Give an example, Quiz me, Summarize (acts on the last message or selected text).
- AI-4 Server-side proxy only; API key never reaches the browser.
- AI-5 Per-user rate limit (default 20 requests/min) and daily token budget (default 100k tokens); remaining budget visible.
- AI-6 Tutor system prompt: patient, step by step, checks understanding, asks a follow-up question.
- AI-7 Graceful errors: provider down, timeout (60 s), quota hit, content blocked; user can retry. Stop-generation button; partial responses are saved.

### 5.5 Dashboard (DASH)
Greeting by time of day and name, today's tasks (toggle done), streak, recent chats, quick links (New chat, New note, Start focus, Make quiz), upcoming deadlines. All from API.

### 5.6 Notes (NOTE)
- NOTE-1 CRUD on Markdown notes. NOTE-2 Courses (create/rename/delete) to organise; a note has zero or one course. NOTE-3 Full-text search (title + body) with course filter. NOTE-4 "Summarize with AI": generates a summary shown beside the note, with "append to note" option (nothing changes without user action).

### 5.7 Flashcards and Quizzes (FLASH, QUIZ)
- FLASH-1 Generate a deck (5–30 cards) from a note or a typed topic. FLASH-2 Edit, add, delete cards and decks manually. FLASH-3 Study mode: flip cards, mark "got it / again".
- QUIZ-1 Generate multiple-choice quiz (5–20 questions) from a note or topic, validated against a strict schema (retry once on invalid output). QUIZ-2 Take quiz, submit, see score and per-question explanations. QUIZ-3 Attempts saved; score history chart per quiz and overall.

### 5.8 Study Planner (PLAN)
- PLAN-1 Tasks with title, optional description, course, due date/time, priority, status. PLAN-2 Views: Today, Upcoming, Overdue, Done. PLAN-3 Reminder offset per task (none, at due time, 1 h, 1 day) produces an in-app notification; optional email if the user opted in and is verified. PLAN-4 Reminders fire at most once per task per due-date.

### 5.9 Pomodoro (FOCUS)
- FOCUS-1 Timer with focus (default 25 min), short break (5), long break (15 every 4). Durations configurable. FOCUS-2 Completing a focus block (or stopping early after ≥ 1 min) logs a `study_session` with actual seconds. FOCUS-3 Timer state survives page refresh (start timestamp stored locally; wall-clock based, not interval based). FOCUS-4 Optionally link a session to a task.

### 5.10 Settings (SET)
- Theme (system/light/dark), timezone (auto-detected, editable; drives streak and "today"), notification toggles (in-app reminders, email reminders, product email), Pomodoro durations.

## 6. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Performance | p95 API < 300 ms excluding AI; first AI token < 3 s typical; route-level code splitting; client bundle (initial) < 200 KB gzip |
| NFR-2 | Reliability | Migrations versioned; health endpoints; idempotent reminder jobs; DB transactions for multi-row writes |
| NFR-3 | Security | See [SECURITY.md](SECURITY.md); no secrets in repo; dependency audit in CI |
| NFR-4 | Accessibility | WCAG 2.1 AA: labels, contrast ≥ 4.5:1, focus rings, full keyboard use, ARIA live regions for streaming and toasts |
| NFR-5 | Responsiveness | Mobile-first, 320 px to 1920 px |
| NFR-6 | Usability | Every screen has loading, empty and error states |
| NFR-7 | Maintainability | TypeScript strict, ESLint/Prettier, ≥ 80% coverage on server services, docs in sync |
| NFR-8 | Observability | Structured JSON logs with request IDs; error tracking (Sentry) in Phase 8 |
| NFR-9 | Privacy | Data export not required in v1; deletion is real and complete; AI content not used for anything else by LearnSpace |
| NFR-10 | Browser support | Latest two versions of Chrome, Edge, Firefox, Safari |

## 7. Assumptions and constraints
- Free-tier hosting may cold-start (Render). Mitigation: documented, health ping optional.
- Gemini free-tier quotas apply; per-user limits protect the shared key.
- Users have a university email but any email is accepted.

## 8. User stories and acceptance criteria

**US-01 Sign up.** As a visitor I can create an account so I can save my work.
- Given valid details, when I submit, then my account exists, I'm logged in, and a verification email is sent.
- Given an email already registered, then I see "Email already in use" inline and no second account is created.
- Given a weak password, then the field shows the policy error before submission.

**US-02 Verify email.** As a new user I can verify my email.
- Given a valid unexpired token, then my account is marked verified and the banner disappears.
- Given an expired/used token, then I see an error and can request a new link.

**US-03 Log in.** As a user I can log in and stay logged in.
- Given correct credentials, then I reach the dashboard; wrong credentials show a generic "Invalid email or password".
- Given "Remember me", then I remain logged in after closing the browser for up to 30 days.
- Given 5 failures in 15 minutes for one account/IP, then further attempts are blocked with a retry-after message.

**US-04 Session refresh.** As a user my session renews silently.
- Given an expired access token and valid refresh cookie, then the client transparently gets a new token and retries once.
- Given a revoked refresh token, then I'm sent to login.

**US-05 Reset password.** As a user I can reset a forgotten password.
- Given any email, then the response is identical; if the account exists, an email arrives.
- Given a valid link and a policy-compliant password, then the password changes, all sessions are revoked, and I can log in.

**US-06 Google sign-in.** As a user I can continue with Google.
- Given a Google account, then I'm logged in; a new account is created when none exists with that email.
- Given Google isn't configured, then the button is hidden.

**US-07 Edit profile.** As a user I can edit my details.
- Given valid inputs, then changes persist after reload. Given bio > 500 chars, then save is blocked with a message.

**US-08 Avatar.** As a user I can set a profile picture.
- Given a ≤ 2 MB JPEG/PNG/WebP, then it appears everywhere within seconds. Given another type or size, then I get a clear error.

**US-09 Stats.** As a user I see my real study stats.
- Given I completed a 25-minute focus session today, then hours studied increases by 0.42 and today counts toward my streak.
- Given I skip a full day, then the streak resets to 0 (today still open counts as continuing).

**US-10 Change password / delete account.**
- Given the correct current password and a valid new one, then it changes and other sessions end.
- Given account deletion confirmed with password, then all data is removed and I'm logged out; logging in again fails.

**US-11 Chat.** As a student I can ask the AI tutor questions.
- Given a message, then the reply streams in, renders Markdown/code, and is saved; reloading shows the whole conversation.
- Given the provider fails mid-stream, then the partial text is kept and a retry control appears.
- Given I exceed the rate limit or daily budget, then I see when I can continue.

**US-12 Manage conversations.** Given a conversation, I can rename or delete it; deleted conversations never reappear and other users cannot access it (404).

**US-13 Quick actions.** Given a tutor reply, when I click "Explain simply", then a pre-written instruction referencing that reply is sent and answered.

**US-14 Notes.** I can create, edit, delete, search notes and filter by course. Searching "photosynthesis" returns only my notes containing it.

**US-15 Summarize note.** Given a note with ≥ 50 characters, when I click Summarize, then a summary appears; the note is unchanged until I choose "Append".

**US-16 Flashcards.** Given a note or topic, then a deck with the requested number of cards is created and saved; I can edit cards and study them.

**US-17 Quizzes.** Given a note or topic, a quiz is generated; after submitting I see my score and explanations; the attempt appears in score history and increments "quizzes taken".

**US-18 Planner.** I can add a task with a due date and 1-hour reminder; at due-time minus 1 h I see an in-app notification exactly once; with email opt-in, I also get an email.

**US-19 Pomodoro.** Given I run a focus block to completion, then a study session of the real duration is saved and stats update; refreshing mid-timer doesn't lose it.

**US-20 Dashboard.** After login I see greeting, today's tasks, streak, recent chats, and quick links, all reflecting my data; a brand-new user sees helpful empty states.

**US-21 Dark mode.** I can switch theme; it persists and respects the OS default initially.

**US-22 Notification settings.** Turning off email reminders stops emails but keeps in-app reminders.
