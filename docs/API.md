# API Reference

Base URL: `/api/v1` (local: `http://localhost:4000/api/v1`). JSON in/out (`Content-Type: application/json`) unless noted. Timestamps are ISO-8601 UTC.

## Conventions

**Auth column:** 🔓 public · 🔒 requires `Authorization: Bearer <accessToken>` · ✅ also requires verified email · 🍪 uses the httpOnly refresh cookie (and the `X-Requested-With: learnspace` header, which acts as the CSRF guard).

**Error envelope (all errors):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [{ "path": "email", "message": "Invalid email" }],
    "requestId": "9f1c…"
  }
}
```

**Pagination** (list endpoints): `?limit=20&cursor=<opaque>` → `{ "items": [...], "nextCursor": "…" | null }`. Max `limit` 100.

**Ownership:** resources belonging to another user always return `404 NOT_FOUND` (never 403) to avoid leaking existence.

## Error codes

| HTTP | Code                     | Meaning                                                          |
| ---- | ------------------------ | ---------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`       | Body/query/params failed Zod validation (`details` lists fields) |
| 400  | `INVALID_TOKEN`          | Email/reset token invalid, used or expired                       |
| 401  | `UNAUTHENTICATED`        | Missing/invalid access token                                     |
| 401  | `TOKEN_EXPIRED`          | Access token expired, client should refresh                      |
| 401  | `INVALID_CREDENTIALS`    | Wrong email/password (or wrong current password)                 |
| 401  | `REFRESH_INVALID`        | Refresh cookie missing/invalid/revoked                           |
| 403  | `EMAIL_NOT_VERIFIED`     | Action requires a verified email                                 |
| 403  | `CSRF_BLOCKED`           | Missing `X-Requested-With` on a cookie endpoint                  |
| 404  | `NOT_FOUND`              | Missing, or not yours                                            |
| 409  | `EMAIL_TAKEN`            | Signup/email conflict                                            |
| 409  | `CONFLICT`               | Other uniqueness conflict (e.g. course name)                     |
| 413  | `PAYLOAD_TOO_LARGE`      | Body or file exceeds limit                                       |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | Avatar not JPEG/PNG/WebP                                         |
| 423  | `ACCOUNT_LOCKED`         | Too many failed logins (`retryAfterSeconds`)                     |
| 429  | `RATE_LIMITED`           | Per-IP/user request limit (`Retry-After` header)                 |
| 429  | `AI_BUDGET_EXCEEDED`     | Daily token budget used (`resetsAt`)                             |
| 502  | `AI_PROVIDER_ERROR`      | LLM upstream error                                               |
| 502  | `AI_BAD_OUTPUT`          | LLM returned invalid structured output after retry               |
| 503  | `AI_UNAVAILABLE`         | AI not configured or provider down                               |
| 503  | `STORAGE_UNAVAILABLE`    | Cloudinary failure                                               |
| 500  | `INTERNAL`               | Unexpected; see `requestId` in logs                              |

**Rate limits (defaults):** global 300 req/min/IP · auth endpoints 10/min/IP · forgot/resend 3/hour/email · AI endpoints 20/min/user · avatar 10/hour/user.

---

## 1. Health

| Method | Path            | Auth | Description                                       |
| ------ | --------------- | ---- | ------------------------------------------------- |
| GET    | `/health`       | 🔓   | Liveness: `{ "status": "ok" }`                    |
| GET    | `/health/ready` | 🔓   | Readiness; checks DB. `200 {status:"ok"}` / `503` |

## 2. Auth

### POST `/auth/signup` 🔓

Req: `{ "name": "Ama Mensah", "email": "ama@uni.edu", "password": "Passw0rdOK", "timezone": "Africa/Accra" }`
Res `201`: `{ "accessToken": "eyJ…", "expiresIn": 900, "user": { …User } }` + `Set-Cookie: ls_refresh=…; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`
Errors: `VALIDATION_ERROR`, `EMAIL_TAKEN`, `RATE_LIMITED`.

### POST `/auth/login` 🔓

Req: `{ "email": "ama@uni.edu", "password": "…", "rememberMe": true }`
Res `200`: same shape as signup. Cookie is persistent (30 d) if `rememberMe` else session cookie.
Errors: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `RATE_LIMITED`.

### POST `/auth/refresh` 🍪

Req: empty body. Res `200`: `{ "accessToken": "…", "expiresIn": 900, "user": { …User } }` + rotated cookie.
Errors: `REFRESH_INVALID` (reuse of a rotated token revokes the entire family), `CSRF_BLOCKED`.

### POST `/auth/logout` 🍪

Revokes current refresh token, clears cookie. Res `204`. Idempotent.

### POST `/auth/logout-all` 🔒

Revokes all the user's refresh tokens. Res `204`.

### POST `/auth/verify-email` 🔓

Req: `{ "token": "…" }` Res `200`: `{ "verified": true }`. Errors: `INVALID_TOKEN`.

### POST `/auth/resend-verification` 🔒

Res `202`: `{ "sent": true }`. If already verified: `200 {"sent":false,"reason":"already_verified"}`. Rate limited.

### GET `/auth/me` 🔒 _(allowed for unverified `verify_only` sessions)_

Returns only `{ "email": "ama@uni.edu", "emailVerified": false }`. Used by the verification gate to check status without exposing profile or app data.

### POST `/auth/change-email` 🔒 _(allowed for unverified `verify_only` sessions)_

Req: `{ "email": "new@uni.edu" }`. Sets `emailVerified = false`, revokes all refresh tokens, invalidates prior OTPs, sends a fresh 6-digit OTP to the new address, and returns `{ "email": "new@uni.edu", "emailVerified": false, "verificationToken": "…" }`.

> **Strict Email Verification Rule:** Unverified accounts may call **only** public routes plus `/auth/me`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/change-email`, and `/auth/logout`. All other `/api/v1/*` and `/api/admin/*` routes enforce `requireVerified` from the database on every request and return `403 EMAIL_NOT_VERIFIED`.

### POST `/auth/forgot-password` 🔓

Req: `{ "email": "ama@uni.edu" }` Res `202`: `{ "message": "If that email exists, a reset link was sent." }` (identical either way, similar response time).

### POST `/auth/reset-password` 🔓

Req: `{ "token": "…", "password": "NewPassw0rd" }` Res `200`: `{ "reset": true }`. Revokes all sessions. Errors: `INVALID_TOKEN`, `VALIDATION_ERROR`.

### GET `/auth/google` 🔓 (optional feature)

Redirects (`302`) to Google with `state` + PKCE. `404` when Google env vars are unset.

### GET `/auth/google/callback` 🔓

Handles Google redirect, sets refresh cookie, `302` to `${CLIENT_URL}/auth/callback`. On failure `302` to `${CLIENT_URL}/login?error=google_failed`.

### GET `/auth/providers` 🔓

Res: `{ "google": true }`. Lets the UI hide the Google button when unconfigured.

## 3. Users, profile, settings

**User object**

```json
{
  "id": "uuid",
  "email": "ama@uni.edu",
  "name": "Ama Mensah",
  "emailVerified": true,
  "studentId": "12345678",
  "programme": "BSc Computer Science",
  "level": "Year 2",
  "university": "University of Ghana",
  "bio": "…",
  "avatarUrl": "https://res.cloudinary.com/…",
  "hasPassword": true,
  "createdAt": "…"
}
```

| Method | Path                        | Auth | Description                                                                                                                                                                                 |
| ------ | --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/users/me`                 | 🔒   | Returns User                                                                                                                                                                                |
| PATCH  | `/users/me`                 | 🔒   | Partial update of `name, studentId, programme, level, university, bio` (strings trimmed, bio ≤ 500; `null` clears optional fields). Returns User                                            |
| POST   | `/users/me/avatar`          | 🔒   | `multipart/form-data` field `avatar` (≤ 2 MB; JPEG/PNG/WebP, magic-bytes checked). Res `{ "avatarUrl": "…" }`. Errors: `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `STORAGE_UNAVAILABLE` |
| DELETE | `/users/me/avatar`          | 🔒   | Removes avatar. `204`                                                                                                                                                                       |
| POST   | `/users/me/change-password` | 🔒   | `{ "currentPassword", "newPassword" }` → `204`; other sessions revoked, current kept. Google-only users (no password) may set one with only `newPassword`                                   |
| DELETE | `/users/me`                 | 🔒   | `{ "password": "…" }` (Google-only: `{ "confirm": "DELETE" }` within 10 min of login) → `204`; cascades all data                                                                            |
| GET    | `/users/me/stats`           | 🔒   | See below                                                                                                                                                                                   |
| GET    | `/users/me/settings`        | 🔒   | Returns Settings (including `classReminderMinutes`, `examReminderMinutes`)                                                                                                                  |
| PATCH  | `/users/me/settings`        | 🔒   | Partial update of Settings                                                                                                                                                                  |
| GET    | `/users/me/export`          | 🔒   | Downloads `learnspace-export-YYYY-MM-DD.json` personal data archive (5/hr limit; omits `passwordHash`, `avatarPublicId`, and storage keys)                                                  |

**Stats** `GET /users/me/stats`

```json
{
  "streakDays": 5,
  "longestStreakDays": 12,
  "hoursStudied": 38.5,
  "hoursLast7Days": 6.25,
  "notesCreated": 14,
  "quizzesTaken": 9,
  "averageQuizScore": 0.78
}
```

**Settings**

```json
{
  "theme": "system",
  "timezone": "Africa/Accra",
  "notifyInApp": true,
  "notifyEmailReminders": false,
  "notifyProductEmail": false,
  "focusMinutes": 25,
  "shortBreakMinutes": 5,
  "longBreakMinutes": 15
}
```

Enabling `notifyEmailReminders` requires a verified email (`EMAIL_NOT_VERIFIED`).

## 4. AI assistant

**Conversation:** `{ "id", "title", "createdAt", "updatedAt" }` · **Message:** `{ "id", "role": "user|assistant", "content", "status": "complete|partial|error", "action": null, "attachments": Attachment[], "createdAt" }` · **Attachment:** `{ "id", "originalName", "mimeType", "kind": "image|document", "sizeBytes", "truncated": boolean, "url": "/api/v1/ai/attachments/:id/content", "createdAt" }`

| Method | Path                          | Auth | Description                                                                                                    |
| ------ | ----------------------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/conversations`              | 🔒   | Paginated, newest activity first. `?q=` filters by title                                                       |
| POST   | `/conversations`              | 🔒   | `{ "title"?: "…" }` → `201` Conversation (default "New chat")                                                  |
| GET    | `/conversations/:id`          | 🔒   | Conversation + `messages` (`?limit=50&before=<messageId>` for older pages)                                     |
| PATCH  | `/conversations/:id`          | 🔒   | `{ "title": "Calculus revision" }` (1–120 chars)                                                               |
| DELETE | `/conversations/:id`          | 🔒   | `204`, messages & attachments cascade (cloud assets deleted)                                                   |
| POST   | `/conversations/:id/messages` | ✅   | **Streaming** (SSE), see below                                                                                 |
| POST   | `/ai/attachments`             | ✅   | `multipart/form-data` (`file`, `conversationId`) → `201` Attachment (30/hr rate limit, 50/day quota)           |
| GET    | `/ai/attachments/:id/content` | 🔒   | Streams attachment bytes or `302` redirect to signed Cloudinary URL (owner only, `404` otherwise)              |
| DELETE | `/ai/attachments/:id`         | 🔒   | `204`, removes attachment from DB & storage (owner only)                                                       |
| GET    | `/ai/usage`                   | 🔒   | `{ "day": "2026-11-16", "tokensUsed": 12000, "tokenLimit": 100000, "requestsPerMinute": 20, "resetsAt": "…" }` |

### POST `/conversations/:id/messages` ✅

Req: `{ "content": "Explain recursion", "action": "explain_simple" | "example" | "quiz_me" | "summarize" | null, "selection"?: "text being referred to", "attachmentIds"?: ["uuid"] }`
`content` 1–8000 chars (may be empty when `action` is set and a previous assistant message exists, or when `attachmentIds` has 1–5 uploaded attachments).

### Study from Documents

| Method                                       | Path                                          | Auth | Description                                                                                                               |
| -------------------------------------------- | --------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| POST                                         | `/documents`                                  | ✅   | `multipart/form-data` (`file`, `type`: `past_question\|slides\|notes`, `title?`, `courseId?`) → `202` `{ document, job }` |
| GET                                          | `/documents`                                  | 🔒   | List user's documents (`?type=&courseId=&q=`)                                                                             |
| GET                                          | `/documents/:id`                              | 🔒   | Document detail, `latestJob` progress, `extractedQuestions`, and `questionSets`                                           |
| GET                                          | `/documents/:id/content`                      | 🔒   | Streams file or `302` signed URL (owner only, `404` otherwise)                                                            |
| DELETE                                       | `/documents/:id`                              | 🔒   | `204`, deletes storage file and all cascading rows                                                                        |
| POST                                         | `/documents/:id/detect-questions`             | ✅   | `202` `{ job }` (chunked Mode 1 question detection)                                                                       |
| PATCH                                        | `/documents/:id/questions`                    | 🔒   | Confirm, edit, merge, split, reorder, or toggle detected questions                                                        |
| POST                                         | `/documents/:id/questions/:qid/answer`        | ✅   | **Streaming** (SSE): `{ mode: "full_worked"\|"answers_only"\|"marking_scheme", useCourseNotes, refinement? }`             |
| POST                                         | `/documents/:id/export`                       | 🔒   | `{ format: "pdf"\|"docx" }` → binary file download of answered questions                                                  |
| POST                                         | `/documents/:id/save-to-notes`                | 🔒   | `{ title?, courseId? }` → `201` `{ noteId, title }`                                                                       |
| POST                                         | `/documents/:id/generate-questions`           | ✅   | `202` `{ job }` (chunked Mode 2 generation: `types`, `count`, `difficulty`, `scope`, `selectedPages?`, `topic?`, `style`) |
| POST                                         | `/question-sets/:setId/questions/:qid/refine` | ✅   | `{ action: "regenerate"\|"harder"\|"easier"\|"more_on_topic" }`                                                           |
| POST                                         | `/question-sets/:setId/attempts`              | 🔒   | `{ answers: { [questionId]: string } }` → `201` `{ attempt }` (with weak topics & feedback)                               |
| POST                                         | `/question-sets/:setId/save-to-library`       | 🔒   | `{ target: "quiz"\|"deck"\|"both", title? }` → `201` `{ quizId, deckId }`                                                 |
| POST                                         | `/question-sets/:setId/export`                | 🔒   | `{ format: "pdf"\|"docx" }` → binary file download of generated question set                                              |
| Res `200` `Content-Type: text/event-stream`: |

```
event: meta
data: {"userMessageId":"…","assistantMessageId":"…"}

event: delta
data: {"text":"Recursion is when a function "}

event: done
data: {"messageId":"…","usage":{"inputTokens":120,"outputTokens":310},"title":"Recursion basics"}
```

In-stream failure: `event: error` / `data: {"code":"AI_PROVIDER_ERROR","message":"…"}` (partial text stored with `status: "partial"`).
Pre-stream failures are normal JSON errors: `VALIDATION_ERROR`, `NOT_FOUND`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`, `AI_BUDGET_EXCEEDED`, `AI_UNAVAILABLE`.

## 5. Courses and notes

**Course:** `{ "id", "name", "code", "credits", "semester", "instructor", "color", "archivedAt", "noteCount", ... }` · **Note:** `{ "id", "title", "body", "courseId", "aiSummary", "createdAt", "updatedAt" }`

| Method | Path                   | Auth | Description                                                                                                                                |
| ------ | ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/courses`             | 🔒   | List courses (`?archived=all\|active\|archived`, `?semester=`, `?q=`) with linked counts                                                   |
| POST   | `/courses`             | 🔒   | `{ "name", "code"?, "credits"?, "semester"?, "instructor"?, "color"? }` → `201`. `CONFLICT` on duplicate name                              |
| GET    | `/courses/:id`         | 🔒   | Course detail with linked notes, documents, tasks, timetable slots, exams, decks, quizzes, chats, and study sessions                       |
| PATCH  | `/courses/:id`         | 🔒   | Partial update including `archivedAt`                                                                                                      |
| DELETE | `/courses/:id`         | 🔒   | `?mode=unassign\|delete` → `204`; either unassigns linked records (`courseId: null`) or deletes linked notes/tasks/documents/decks/quizzes |
| GET    | `/notes`               | 🔒   | `?q=&courseId=&limit=&cursor=`; with `q`, results ranked by relevance and include `snippet`. `courseId=none` for uncategorised             |
| POST   | `/notes`               | 🔒   | `{ "title", "body", "courseId"? }` → `201` Note                                                                                            |
| GET    | `/notes/:id`           | 🔒   | Note                                                                                                                                       |
| PATCH  | `/notes/:id`           | 🔒   | `{ title?, body?, courseId?, aiSummary? }`                                                                                                 |
| DELETE | `/notes/:id`           | 🔒   | `204`                                                                                                                                      |
| POST   | `/notes/:id/summarize` | ✅   | Res `200 { "summary": "…" }`; also stored in `aiSummary`. Body ≥ 50 chars else `VALIDATION_ERROR`. Does not modify the body. `AI_*` errors |

## 6. Timetable, exams & revision plans

| Method | Path                                        | Auth | Description                                                                                              |
| ------ | ------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/timetable`                                | 🔒   | List weekly class slots (`dayOfWeek`, `startMinute`, `endMinute`, `venue`, `type`, `course`)             |
| POST   | `/timetable`                                | 🔒   | Create class slot (`409 CONFLICT` on overlapping time for the same weekday)                              |
| PATCH  | `/timetable/:id`                            | 🔒   | Update class slot (re-validates time overlaps)                                                           |
| DELETE | `/timetable/:id`                            | 🔒   | `204`                                                                                                    |
| GET    | `/exams`                                    | 🔒   | List exams (`?courseId=&upcoming=true`) sorted chronologically with countdown days/hours                 |
| POST   | `/exams`                                    | 🔒   | Create exam (`courseId`, `title`, `examType`, `startsAt`, `durationMinutes`, `venue?`, `weightPercent?`) |
| PATCH  | `/exams/:id`                                | 🔒   | Update exam (re-arms reminder if `startsAt` changes)                                                     |
| DELETE | `/exams/:id`                                | 🔒   | `204`                                                                                                    |
| GET    | `/revision-plans`                           | 🔒   | List saved revision plans and scheduled sessions                                                         |
| POST   | `/revision-plans/generate`                  | ✅   | Generate AI revision plan draft (`examId?`, `title?`, `dailyMinutes?`) without saving                    |
| POST   | `/revision-plans`                           | 🔒   | Save reviewed/edited revision plan and optionally sync sessions to Planner tasks (`syncToPlanner`)       |
| PATCH  | `/revision-plans/:planId/sessions/:sessId`  | 🔒   | Edit topic, date, duration, or completion status (keeps linked Planner task synced)                      |
| POST   | `/revision-plans/:planId/reschedule-missed` | 🔒   | Moves incomplete past sessions forward cleanly from today onward                                         |
| DELETE | `/revision-plans/:planId`                   | 🔒   | `204`                                                                                                    |

## 7. Tasks and notifications

**Task:** `{ "id", "title", "description", "courseId", "dueAt", "priority": "low|medium|high", "status": "todo|done", "completedAt", "reminderOffsetMinutes": null|0|60|1440, "createdAt" }`

| Method | Path                      | Auth | Description                                                                                                       |
| ------ | ------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/tasks`                  | 🔒   | `?view=today\|upcoming\|overdue\|done\|all&courseId=&limit=&cursor=`; "today" uses the user's timezone            |
| POST   | `/tasks`                  | 🔒   | `{ title, description?, courseId?, dueAt?, priority?, reminderOffsetMinutes? }` (offset requires `dueAt`) → `201` |
| PATCH  | `/tasks/:id`              | 🔒   | Any field; `{ "status": "done" }` sets `completedAt`. Changing due date or offset re-arms the reminder            |
| DELETE | `/tasks/:id`              | 🔒   | `204`                                                                                                             |
| GET    | `/notifications`          | 🔒   | `?unread=true&limit=&cursor=` → items + `unreadCount`                                                             |
| POST   | `/notifications/:id/read` | 🔒   | `204`                                                                                                             |
| POST   | `/notifications/read-all` | 🔒   | `204`                                                                                                             |

## 8. Study sessions (Pomodoro)

| Method | Path                  | Auth | Description                                                                                                                                                                      |
| ------ | --------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/study-sessions`     | 🔒   | `{ "startedAt": "…", "durationSeconds": 1500, "source": "pomodoro", "taskId"?: "uuid", "courseId"?: "uuid" }`. 60 ≤ duration ≤ 14400; idempotent on `(userId, startedAt)`. `201` |
| GET    | `/study-sessions`     | 🔒   | `?from=&to=` (max 90 days) → list + `totalSeconds`                                                                                                                               |
| DELETE | `/study-sessions/:id` | 🔒   | `204` (undo a mistaken log)                                                                                                                                                      |

## 9. Flashcards (SM-2) & quizzes

**Deck:** `{ "id", "title", "topic", "courseId", "noteId", "documentId", "cardCount", "dueCount", "createdAt" }` · **Card:** `{ "id", "front", "back", "topic", "imageUrl", "position", "easeFactor", "intervalDays", "repetitions", "lapses", "dueAt", "lastReviewedAt" }`

| Method | Path                    | Auth | Description                                                                                           |
| ------ | ----------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/decks`                | 🔒   | Paginated with `dueCount` per deck (`?courseId=`)                                                     |
| GET    | `/decks/due-summary`    | 🔒   | `{ totalDue, decks: [...] }` due counts across all decks                                              |
| POST   | `/decks`                | 🔒   | Manual: `{ title, courseId?, topic?, cards?: [{front, back, topic?}] }` → `201`                       |
| POST   | `/decks/generate`       | ✅   | `{ "noteId"?, "documentId"?, "topic"?, "courseId"?, "count": 12 }` → `201` Deck + cards               |
| GET    | `/decks/:id`            | 🔒   | Deck with `cards` and SM-2 state                                                                      |
| GET    | `/decks/:id/due`        | 🔒   | Due cards in deck ordered by `dueAt`                                                                  |
| POST   | `/decks/:id/import-csv` | 🔒   | Bulk import `{ csvText }` (`front,back[,topic]` rows) → `201`                                         |
| PATCH  | `/decks/:id`            | 🔒   | `{ title?, topic?, courseId? }`                                                                       |
| DELETE | `/decks/:id`            | 🔒   | `204` (also removes card images)                                                                      |
| POST   | `/decks/:id/cards`      | 🔒   | `{ front, back, topic? }` → `201`                                                                     |
| PATCH  | `/cards/:id`            | 🔒   | `{ front?, back?, topic?, position? }`                                                                |
| DELETE | `/cards/:id`            | 🔒   | `204`                                                                                                 |
| POST   | `/cards/:id/review`     | 🔒   | `{ rating: "again"\|"hard"\|"good"\|"easy" }` → updates SM-2 schedule & logs `ReviewLog`              |
| POST   | `/cards/:id/image`      | 🔒   | `multipart/form-data` (`file`, ≤ 5 MB) → sanitizes to WebP (EXIF stripped) and attaches diagram image |
| GET    | `/cards/:id/image`      | 🔒   | Streams card image bytes (`image/webp`) to deck owner (`404` otherwise)                               |
| DELETE | `/cards/:id/image`      | 🔒   | Removes card image from storage & clears `imageUrl`                                                   |

**Quiz (to take):** `{ "id", "title", "topic", "questions": [{ "id", "prompt", "options": ["A","B","C","D"] }] }` (no answers).

| Method | Path                    | Auth | Description                                                                                                                                                                                                         |
| ------ | ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/quizzes`              | 🔒   | List with `questionCount`, `attempts`, `bestScore`, `lastScore` (`?courseId=`)                                                                                                                                      |
| POST   | `/quizzes/generate`     | ✅   | `{ "noteId"?, "topic"?, "courseId"?, "count": 10 }` (count 5–20) → `201` Quiz                                                                                                                                       |
| GET    | `/quizzes/:id`          | 🔒   | Quiz without answers                                                                                                                                                                                                |
| PATCH  | `/quizzes/:id`          | 🔒   | `{ title?, topic?, courseId? }`                                                                                                                                                                                     |
| DELETE | `/quizzes/:id`          | 🔒   | `204`                                                                                                                                                                                                               |
| POST   | `/quizzes/:id/attempts` | 🔒   | `{ "answers": [2, 0, null, 1, …] }` (length = question count) → `201` `{ "attemptId", "score": 8, "total": 10, "takenAt", "results": [{ "questionId", "chosenIndex", "correctIndex", "correct", "explanation" }] }` |
| GET    | `/quizzes/:id/attempts` | 🔒   | Attempt history for one quiz                                                                                                                                                                                        |
| GET    | `/quiz-attempts`        | 🔒   | `?from=&to=` all attempts across quizzes (scores-over-time chart)                                                                                                                                                   |

## 10. GPA & Grades Calculator

| Method | Path               | Auth | Description                                                                                            |
| ------ | ------------------ | ---- | ------------------------------------------------------------------------------------------------------ |
| GET    | `/gpa/overview`    | 🔒   | Active scale (`University 4.0 Scale` auto-provisioned), presets, grade records, semester/CGPA & trend  |
| POST   | `/gpa/scales`      | 🔒   | Create custom grading scale (boundaries, degree classes, `retakePolicy`, `setActive`)                  |
| PATCH  | `/gpa/scales/:id`  | 🔒   | Update or activate a grading scale (`4.0`, `4.0 +/-`, `5.0`, custom)                                   |
| DELETE | `/gpa/scales/:id`  | 🔒   | Delete non-last grading scale                                                                          |
| POST   | `/gpa/records`     | 🔒   | Log course grade (`courseCode`, `courseTitle`, `creditHours`, `semester`, `score?` / `gradeLabel?`)    |
| PATCH  | `/gpa/records/:id` | 🔒   | Edit grade record or retake status                                                                     |
| DELETE | `/gpa/records/:id` | 🔒   | Delete grade record and recompute overview                                                             |
| POST   | `/gpa/what-if`     | 🔒   | Target CGPA calculator (`targetCgpa`, `remainingCredits`) returning required average GPA & feasibility |

## 11. Dashboard & Progress Analytics

### GET `/dashboard` 🔒

Returns `greetingName`, `isFirstVisit`, `lastLoginAt`, `onboardingCompleted`, `onboardingSteps`, `timezone`, `todayTasks`, `overdueCount`, `upcoming`, `todayClasses`, `nextClass`, `upcomingExams`, `nextExam`, `dueFlashcardsCount`, `todayStudyHours`, `todayTasksDoneCount`, `stats` (`streakDays`, `hoursLast7Days`), `recentConversations`, and `unreadNotifications`.

- `POST /api/v1/users/me/first-visit` 🔒 — Marks `firstLoginAt` after a verified user loads the dashboard for the first time (`isFirstVisit` becomes `false` on subsequent sessions/devices).
- `POST /api/v1/users/me/onboarding-complete` 🔒 — Sets `onboardingCompleted = true` when the user finishes or dismisses the Getting Started card.

### GET `/analytics?range=7d|30d|semester` 🔒

Returns real-activity analytics in the user's configured timezone: `summary` (`totalStudyHours`, `studySessionCount`, `averageQuizAccuracy`, `flashcardReviews`, `flashcardAccuracy`, `tasksCompleted`, `streakDays`, `longestStreakDays`, `bestStudyHour`), `studyTimeByCourse`, `quizScoreTrend`, `flashcardActivityTrend`, `tasksCompletedTrend`, `bestStudyHours`, and `weakTopics` (topics `< 75%` across quizzes, flashcards, and document practice).

## 12. Admin Dashboard & Student Engagement

### Auth 2FA & Student Engagement (`/api/v1/*`)

- `POST /api/v1/auth/admin-2fa/verify` — Verifies a 6-digit email OTP (`{ "userId", "code" }`) when an admin has `twoFactorEnabled = true`.
- `GET /api/v1/announcements/active` — Returns `{ maintenanceMode, maintenanceMessage, announcements }` scoped to the signed-in student's `programme` / `level`.
- `POST /api/v1/feedback` — Submit student feedback (`{ category: "bug" | "suggestion" | "abuse", subject, message }`).
- `POST /api/v1/ai/messages/:id/flag` — Flag an AI chat message (`{ reason }`) for admin moderation.

### Admin API (`/api/admin/*`)

All `/api/admin/*` routes require `requireAuth` + `requireAdmin` (verified `admin` or `super_admin` and `status === "active"`). Role changes require `requireSuperAdmin`.

- **Overview:** `GET /overview?range=7d|30d|90d|custom&from=&to=`
- **Users:** `GET /users`, `GET /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/force-logout`, `POST /users/:id/resend-verification` (returns `{ sent, maskedEmail }`), `POST /users/:id/mark-verified` (requires `reason` + step-up), `POST /users/:id/trigger-reset`, `PATCH /users/:id/role` (`super_admin` only), `DELETE /users/:id`, `POST /users/bulk`
- **AI Usage & Limits:** `GET /ai-usage`, `PATCH /ai-usage/limits`
- **Moderation & Uploads:** `GET /conversations` (metadata only), `POST /conversations/:id/inspect` (requires `reason`, audited), `GET /uploads`, `POST /uploads/:kind/:id/inspect` (requires `reason`, audited), `DELETE /uploads/:kind/:id`, `GET /flagged`, `PATCH /flagged/:id`
- **Learning:** `GET /learning`
- **Announcements & Feedback:** `GET /announcements`, `POST /announcements`, `PATCH /announcements/:id`, `DELETE /announcements/:id`, `GET /feedback`, `PATCH /feedback/:id`, `POST /feedback/:id/reply`
- **Audit, System & Settings:** `GET /audit-logs?format=json|csv`, `GET /login-history`, `GET /error-logs`, `GET /health`, `GET /settings`, `PATCH /settings`
- **Reports & Exports:** `GET /exports`, `POST /exports` (`users`, `usage`, `ai_costs`, `feedback`, `overview_pdf`), `GET /exports/:id/download`

## 13. Voice Dictation

### POST `/ai/transcribe` 🔒✉️

Multipart `form-data` (`audio` file ≤ 10 MB, max 120 seconds, plus optional `language`, `durationSeconds`, and comma-separated academic `hints`). Verifies audio magic bytes (`webm`, `mp4`, `ogg`, `wav`, `mp3`), converts to 16-bit mono 16 kHz WAV via `ffmpeg`, and transcribes using the configured `STT_PROVIDER` (default: NVIDIA `parakeet-tdt-0.6b-v2` via `grpc.nvcf.nvidia.com:443`). Audio is never stored and transcripts are never logged.

Res `200`: `{ "text": "...", "language": "en-GH", "duration": 4 }`.  
Errors: `401 UNAUTHENTICATED`, `403 EMAIL_NOT_VERIFIED`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `429 RATE_LIMITED`, `503 AI_UNAVAILABLE`.

## 14. Course Resource Web Search (Books & Past Questions)

### Student Endpoints (`/api/v1/courses/:id/*`) 🔒✅

- `GET /courses/:id/recommendations` — Returns `recommendations` (`book`, `past_question`, `video`, `notes`), saved `resources`, `useResourcesInAssistant`, `latestJob`, `dailySearchesUsed`, `dailySearchLimit`, `featureEnabled`, and `pastQuestionsGuidance`.
- `POST /courses/:id/recommendations/refresh` — Body `{ mode?: "refresh" | "find_more", force?: boolean }`. Queues a background search job (`202 Accepted`), enforcing per-user daily limits and global monthly cost caps.
- `POST /courses/:id/recommendations/:recId/save` — Saves a recommended item into `course_resources` (`201 Created`).
- `DELETE /courses/:id/resources/:resourceId` — Removes a saved course resource (`204`).
- `PATCH /courses/:id/resources/assistant-toggle` — Body `{ useResourcesInAssistant: boolean }`. Enables/disables using saved course resources in course-scoped AI Assistant chats.
- `POST /courses/:id/recommendations/:recId/hide` — Marks a recommendation as not relevant (`204`).
- `POST /courses/:id/recommendations/:recId/report` — Body `{ reason: string }`. Submits a bad/dead link report (`201`).

### Admin Endpoints (`/api/admin/recommendations/*`)

- `GET /api/admin/recommendations/overview` — Monthly search usage/costs, active cache count, allow/block domain lists, and reported links.
- `PATCH /api/admin/recommendations/settings` (`super_admin` + step-up) — Updates `featureCourseRecommendations`, `dailyCourseSearchLimit`, `monthlySearchCostCapUsd`, `allowDomains`, and `blockDomains`.
- `POST /api/admin/recommendations/reports/:id/resolve` — Body `{ action: "dismiss" | "mark_dead" | "block_domain" }`.

## 15. Collaboration & Course Community

### Student Endpoints (`/api/v1/community/*`) 🔒✅

- `GET /community/home` — Returns `rulesAccepted`, `profile`, `examNotice`, `communities`, `myGroups`, `unanswered`, and `trending`.
- `POST /community/rules/accept` — Records community rules acceptance.
- `PATCH /community/profile` — Updates `hideStats` and `showInClassmates`.
- `POST /community/courses/:courseId/switch` — Switches a course between university-scoped and global community.
- `GET /community/courses/:communityId` / `POST /community/courses/:communityId/leave` — View community details/classmates or leave.
- `GET /community/courses/:communityId/posts` (cursor paginated) / `POST /community/courses/:communityId/posts` — Q&A feed (`question`, `discussion`, `resource`, `announcement`).
- `GET /community/posts/:postId`, `PATCH /community/posts/:postId`, `DELETE /community/posts/:postId`
- `POST /community/posts/:postId/replies`, `POST /community/posts/:postId/accept/:replyId`
- `POST /community/votes` — Toggle helpful vote (`post | reply | resource`).
- `POST /community/ai/ask-awal` — Instant AI explanation or helper draft (`ask_first | draft_helper`), logged in `UsageEvent`.
- `POST /community/reports`, `POST /community/blocks`, `DELETE /community/blocks/:userId`, `POST /community/courses/:communityId/moderate`
- `GET /community/courses/:communityId/groups`, `POST /community/groups`, `POST /community/groups/:groupId/join`, `POST /community/groups/join-code`, `POST /community/groups/:groupId/leave`, `PATCH /community/groups/:groupId/mute`, `POST /community/groups/:groupId/invite/:targetUserId`
- `GET /community/groups/:groupId`, `GET /community/groups/:groupId/messages` (cursor paginated), `POST /community/groups/:groupId/messages`, `PATCH/DELETE /community/groups/:groupId/messages/:messageId`, `POST .../pin`, `POST .../typing`, `GET /community/groups/:groupId/stream` (SSE real-time stream)
- `POST /community/groups/:groupId/tasks`, `PATCH .../tasks/:taskId`, `POST .../tasks/:taskId/sync-planner`, `POST .../focus`
- `GET /community/courses/:communityId/resources`, `POST /community/resources`, `POST /community/resources/:resourceId/save`
- `POST /community/attachments`, `GET /community/attachments/:attachmentId/content`
- `GET /community/notifications/preferences`, `PATCH /community/notifications/preferences`

### Admin Endpoints (`/api/admin/community/*`)

- `GET /api/admin/community/overview` — Community stats, open reports queue, flagged posts, and safety settings.
- `POST /api/admin/community/reports/:id/resolve` — `dismiss | hide | delete | warn | mute | suspend`.
- `PATCH /api/admin/community/settings` (`super_admin` + step-up) — `featureCommunity`, `bannedWords`, `examNoticeEnabled`, `examNoticeMessage`, `pausedCourseSlugs`.
- `POST /api/admin/community/moderators` — Assign `member | moderator | course_rep` per course community.

## Ghanaian SHS, Guardian Consent & WASSCE Prep Endpoints

- `GET /api/v1/shs/catalogue` — Returns official NaCCA/GES SHS programmes, core/elective subjects, syllabus topics, and citation.
- `POST /api/v1/shs/onboarding/subjects` — Sets SHS profile (`schoolYear`, `schoolName`, `programme`) and creates `Course` records (`type: 'subject'`) from catalogue IDs or custom names.
- `GET /api/v1/shs/consent/status` — Returns current `ageGroup`, `guardianConsentStatus`, and latest `GuardianConsent` request.
- `POST /api/v1/shs/consent/request` — Sends or resends a guardian consent email with signed approve/withdraw links.
- `POST /api/v1/shs/consent/approve` — Public signed-token endpoint for parent/guardian approval (records `consentedAt` + IP).
- `POST /api/v1/shs/consent/withdraw` — Public signed-token endpoint for parent/guardian withdrawal (locks the account and rotates `tokensValidAfter`).
- `GET /api/v1/shs/wassce/attempts` — Returns recent `WassceMockAttempt` history, aggregated weak topics, and official WAEC/NaCCA/GES links.
- `POST /api/v1/shs/wassce/mock` — Generates original WASSCE-style `objective`, `theory`, or `mixed` mock questions from syllabus topics and student notes.
- `POST /api/v1/shs/wassce/mock/:id/submit` — Grades objective items, returns theory marking guidance, and updates `weakTopicsJson`.
- `GET /api/admin/shs/overview`, `PATCH /api/admin/shs/settings`, `PATCH /api/admin/shs/flags/:id`, `POST /api/admin/shs/subjects`, `PATCH /api/admin/shs/subjects/:id`, `POST /api/admin/shs/subjects/:id/topics` — Audit-logged admin controls for SHS features, safety flags, and syllabus catalogue.
