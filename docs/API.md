# API Reference

Base URL: `/api/v1` (local: `http://localhost:4000/api/v1`). JSON in/out (`Content-Type: application/json`) unless noted. Timestamps are ISO-8601 UTC.

## Conventions

**Auth column:** 🔓 public · 🔒 requires `Authorization: Bearer <accessToken>` · ✅ also requires verified email · 🍪 uses the httpOnly refresh cookie (and the `X-Requested-With: learnspace` header, which acts as the CSRF guard).

**Error envelope (all errors):**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": [{ "path": "email", "message": "Invalid email" }], "requestId": "9f1c…" } }
```

**Pagination** (list endpoints): `?limit=20&cursor=<opaque>` → `{ "items": [...], "nextCursor": "…" | null }`. Max `limit` 100.

**Ownership:** resources belonging to another user always return `404 NOT_FOUND` (never 403) to avoid leaking existence.

## Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query/params failed Zod validation (`details` lists fields) |
| 400 | `INVALID_TOKEN` | Email/reset token invalid, used or expired |
| 401 | `UNAUTHENTICATED` | Missing/invalid access token |
| 401 | `TOKEN_EXPIRED` | Access token expired, client should refresh |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password (or wrong current password) |
| 401 | `REFRESH_INVALID` | Refresh cookie missing/invalid/revoked |
| 403 | `EMAIL_NOT_VERIFIED` | Action requires a verified email |
| 403 | `CSRF_BLOCKED` | Missing `X-Requested-With` on a cookie endpoint |
| 404 | `NOT_FOUND` | Missing, or not yours |
| 409 | `EMAIL_TAKEN` | Signup/email conflict |
| 409 | `CONFLICT` | Other uniqueness conflict (e.g. course name) |
| 413 | `PAYLOAD_TOO_LARGE` | Body or file exceeds limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Avatar not JPEG/PNG/WebP |
| 423 | `ACCOUNT_LOCKED` | Too many failed logins (`retryAfterSeconds`) |
| 429 | `RATE_LIMITED` | Per-IP/user request limit (`Retry-After` header) |
| 429 | `AI_BUDGET_EXCEEDED` | Daily token budget used (`resetsAt`) |
| 502 | `AI_PROVIDER_ERROR` | LLM upstream error |
| 502 | `AI_BAD_OUTPUT` | LLM returned invalid structured output after retry |
| 503 | `AI_UNAVAILABLE` | AI not configured or provider down |
| 503 | `STORAGE_UNAVAILABLE` | Cloudinary failure |
| 500 | `INTERNAL` | Unexpected; see `requestId` in logs |

**Rate limits (defaults):** global 300 req/min/IP · auth endpoints 10/min/IP · forgot/resend 3/hour/email · AI endpoints 20/min/user · avatar 10/hour/user.

---

## 1. Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | 🔓 | Liveness: `{ "status": "ok" }` |
| GET | `/health/ready` | 🔓 | Readiness; checks DB. `200 {status:"ok"}` / `503` |

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
{ "id": "uuid", "email": "ama@uni.edu", "name": "Ama Mensah", "emailVerified": true,
  "studentId": "12345678", "programme": "BSc Computer Science", "level": "Year 2",
  "university": "University of Ghana", "bio": "…", "avatarUrl": "https://res.cloudinary.com/…",
  "hasPassword": true, "createdAt": "…" }
```

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | 🔒 | Returns User |
| PATCH | `/users/me` | 🔒 | Partial update of `name, studentId, programme, level, university, bio` (strings trimmed, bio ≤ 500; `null` clears optional fields). Returns User |
| POST | `/users/me/avatar` | 🔒 | `multipart/form-data` field `avatar` (≤ 2 MB; JPEG/PNG/WebP, magic-bytes checked). Res `{ "avatarUrl": "…" }`. Errors: `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `STORAGE_UNAVAILABLE` |
| DELETE | `/users/me/avatar` | 🔒 | Removes avatar. `204` |
| POST | `/users/me/change-password` | 🔒 | `{ "currentPassword", "newPassword" }` → `204`; other sessions revoked, current kept. Google-only users (no password) may set one with only `newPassword` |
| DELETE | `/users/me` | 🔒 | `{ "password": "…" }` (Google-only: `{ "confirm": "DELETE" }` within 10 min of login) → `204`; cascades all data |
| GET | `/users/me/stats` | 🔒 | See below |
| GET | `/users/me/settings` | 🔒 | Returns Settings |
| PATCH | `/users/me/settings` | 🔒 | Partial update of Settings |

**Stats** `GET /users/me/stats`
```json
{ "streakDays": 5, "longestStreakDays": 12, "hoursStudied": 38.5, "hoursLast7Days": 6.25,
  "notesCreated": 14, "quizzesTaken": 9, "averageQuizScore": 0.78 }
```
**Settings**
```json
{ "theme": "system", "timezone": "Africa/Accra", "notifyInApp": true, "notifyEmailReminders": false,
  "notifyProductEmail": false, "focusMinutes": 25, "shortBreakMinutes": 5, "longBreakMinutes": 15 }
```
Enabling `notifyEmailReminders` requires a verified email (`EMAIL_NOT_VERIFIED`).

## 4. AI assistant

**Conversation:** `{ "id", "title", "createdAt", "updatedAt" }` · **Message:** `{ "id", "role": "user|assistant", "content", "status": "complete|partial|error", "action": null, "attachments": Attachment[], "createdAt" }` · **Attachment:** `{ "id", "originalName", "mimeType", "kind": "image|document", "sizeBytes", "truncated": boolean, "url": "/api/v1/ai/attachments/:id/content", "createdAt" }`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/conversations` | 🔒 | Paginated, newest activity first. `?q=` filters by title |
| POST | `/conversations` | 🔒 | `{ "title"?: "…" }` → `201` Conversation (default "New chat") |
| GET | `/conversations/:id` | 🔒 | Conversation + `messages` (`?limit=50&before=<messageId>` for older pages) |
| PATCH | `/conversations/:id` | 🔒 | `{ "title": "Calculus revision" }` (1–120 chars) |
| DELETE | `/conversations/:id` | 🔒 | `204`, messages & attachments cascade (cloud assets deleted) |
| POST | `/conversations/:id/messages` | ✅ | **Streaming** (SSE), see below |
| POST | `/ai/attachments` | ✅ | `multipart/form-data` (`file`, `conversationId`) → `201` Attachment (30/hr rate limit, 50/day quota) |
| GET | `/ai/attachments/:id/content` | 🔒 | Streams attachment bytes or `302` redirect to signed Cloudinary URL (owner only, `404` otherwise) |
| DELETE | `/ai/attachments/:id` | 🔒 | `204`, removes attachment from DB & storage (owner only) |
| GET | `/ai/usage` | 🔒 | `{ "day": "2026-11-16", "tokensUsed": 12000, "tokenLimit": 100000, "requestsPerMinute": 20, "resetsAt": "…" }` |

### POST `/conversations/:id/messages` ✅
Req: `{ "content": "Explain recursion", "action": "explain_simple" | "example" | "quiz_me" | "summarize" | null, "selection"?: "text being referred to", "attachmentIds"?: ["uuid"] }`
`content` 1–8000 chars (may be empty when `action` is set and a previous assistant message exists, or when `attachmentIds` has 1–5 uploaded attachments).

### Study from Documents

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/documents` | ✅ | `multipart/form-data` (`file`, `type`: `past_question\|slides\|notes`, `title?`, `courseId?`) → `202` `{ document, job }` |
| GET | `/documents` | 🔒 | List user's documents (`?type=&courseId=&q=`) |
| GET | `/documents/:id` | 🔒 | Document detail, `latestJob` progress, `extractedQuestions`, and `questionSets` |
| GET | `/documents/:id/content` | 🔒 | Streams file or `302` signed URL (owner only, `404` otherwise) |
| DELETE | `/documents/:id` | 🔒 | `204`, deletes storage file and all cascading rows |
| POST | `/documents/:id/detect-questions` | ✅ | `202` `{ job }` (chunked Mode 1 question detection) |
| PATCH | `/documents/:id/questions` | 🔒 | Confirm, edit, merge, split, reorder, or toggle detected questions |
| POST | `/documents/:id/questions/:qid/answer` | ✅ | **Streaming** (SSE): `{ mode: "full_worked"\|"answers_only"\|"marking_scheme", useCourseNotes, refinement? }` |
| POST | `/documents/:id/export` | 🔒 | `{ format: "pdf"\|"docx" }` → binary file download of answered questions |
| POST | `/documents/:id/save-to-notes` | 🔒 | `{ title?, courseId? }` → `201` `{ noteId, title }` |
| POST | `/documents/:id/generate-questions` | ✅ | `202` `{ job }` (chunked Mode 2 generation: `types`, `count`, `difficulty`, `scope`, `selectedPages?`, `topic?`, `style`) |
| POST | `/question-sets/:setId/questions/:qid/refine` | ✅ | `{ action: "regenerate"\|"harder"\|"easier"\|"more_on_topic" }` |
| POST | `/question-sets/:setId/attempts` | 🔒 | `{ answers: { [questionId]: string } }` → `201` `{ attempt }` (with weak topics & feedback) |
| POST | `/question-sets/:setId/save-to-library` | 🔒 | `{ target: "quiz"\|"deck"\|"both", title? }` → `201` `{ quizId, deckId }` |
| POST | `/question-sets/:setId/export` | 🔒 | `{ format: "pdf"\|"docx" }` → binary file download of generated question set |
Res `200` `Content-Type: text/event-stream`:
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

**Course:** `{ "id", "name", "color", "noteCount" }` · **Note:** `{ "id", "title", "body", "courseId", "aiSummary", "createdAt", "updatedAt" }`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/courses` | 🔒 | All courses with `noteCount` |
| POST | `/courses` | 🔒 | `{ "name": "MATH 201", "color": "#6366F1"? }` → `201`. `CONFLICT` on duplicate name |
| PATCH | `/courses/:id` | 🔒 | `{ name?, color? }` |
| DELETE | `/courses/:id` | 🔒 | `204`; notes and tasks keep existing with `courseId: null` |
| GET | `/notes` | 🔒 | `?q=&courseId=&limit=&cursor=`; with `q`, results ranked by relevance and include `snippet`. `courseId=none` for uncategorised |
| POST | `/notes` | 🔒 | `{ "title", "body", "courseId"? }` → `201` Note |
| GET | `/notes/:id` | 🔒 | Note |
| PATCH | `/notes/:id` | 🔒 | `{ title?, body?, courseId?, aiSummary? }` |
| DELETE | `/notes/:id` | 🔒 | `204` |
| POST | `/notes/:id/summarize` | ✅ | Res `200 { "summary": "…" }`; also stored in `aiSummary`. Body ≥ 50 chars else `VALIDATION_ERROR`. Does not modify the body. `AI_*` errors |

## 6. Tasks and notifications

**Task:** `{ "id", "title", "description", "courseId", "dueAt", "priority": "low|medium|high", "status": "todo|done", "completedAt", "reminderOffsetMinutes": null|0|60|1440, "createdAt" }`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tasks` | 🔒 | `?view=today\|upcoming\|overdue\|done\|all&courseId=&limit=&cursor=`; "today" uses the user's timezone |
| POST | `/tasks` | 🔒 | `{ title, description?, courseId?, dueAt?, priority?, reminderOffsetMinutes? }` (offset requires `dueAt`) → `201` |
| PATCH | `/tasks/:id` | 🔒 | Any field; `{ "status": "done" }` sets `completedAt`. Changing due date or offset re-arms the reminder |
| DELETE | `/tasks/:id` | 🔒 | `204` |
| GET | `/notifications` | 🔒 | `?unread=true&limit=&cursor=` → items + `unreadCount` |
| POST | `/notifications/:id/read` | 🔒 | `204` |
| POST | `/notifications/read-all` | 🔒 | `204` |

## 7. Study sessions (Pomodoro)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/study-sessions` | 🔒 | `{ "startedAt": "…", "durationSeconds": 1500, "source": "pomodoro", "taskId"?: "uuid" }`. Rules: 60 ≤ duration ≤ 14400; `startedAt` not in the future and not older than 24 h; `startedAt + duration ≤ now + 1 min`. Idempotent on `(userId, startedAt)` so retries don't double-count. `201` |
| GET | `/study-sessions` | 🔒 | `?from=&to=` (max 90 days) → list + `totalSeconds` |
| DELETE | `/study-sessions/:id` | 🔒 | `204` (undo a mistaken log) |

## 8. Flashcards

**Deck:** `{ "id", "title", "topic", "noteId", "cardCount", "createdAt" }` · **Card:** `{ "id", "front", "back", "position" }`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/decks` | 🔒 | Paginated |
| POST | `/decks` | 🔒 | Manual: `{ title, cards?: [{front, back}] }` → `201` |
| POST | `/decks/generate` | ✅ | `{ "noteId"?: uuid, "topic"?: "…", "count": 12 }` (exactly one of noteId/topic; count 5–30) → `201` Deck + cards. Errors `AI_*`; nothing saved on failure |
| GET | `/decks/:id` | 🔒 | Deck with `cards` |
| PATCH | `/decks/:id` | 🔒 | `{ title? }` |
| DELETE | `/decks/:id` | 🔒 | `204` |
| POST | `/decks/:id/cards` | 🔒 | `{ front, back }` → `201` |
| PATCH | `/cards/:id` | 🔒 | `{ front?, back?, position? }` |
| DELETE | `/cards/:id` | 🔒 | `204` |

## 9. Quizzes

**Quiz (to take):** `{ "id", "title", "topic", "questions": [{ "id", "prompt", "options": ["A","B","C","D"] }] }` (no answers).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/quizzes` | 🔒 | List with `questionCount`, `attempts`, `bestScore`, `lastScore` |
| POST | `/quizzes/generate` | ✅ | `{ "noteId"?, "topic"?, "count": 10 }` (count 5–20) → `201` Quiz |
| GET | `/quizzes/:id` | 🔒 | Quiz without answers |
| DELETE | `/quizzes/:id` | 🔒 | `204` |
| POST | `/quizzes/:id/attempts` | 🔒 | `{ "answers": [2, 0, null, 1, …] }` (length = question count) → `201` `{ "attemptId", "score": 8, "total": 10, "takenAt", "results": [{ "questionId", "chosenIndex", "correctIndex", "correct", "explanation" }] }` |
| GET | `/quizzes/:id/attempts` | 🔒 | Attempt history for one quiz |
| GET | `/quiz-attempts` | 🔒 | `?from=&to=` all attempts across quizzes (scores-over-time chart) |

## 10. Dashboard

### GET `/dashboard` 🔒
```json
{ "greetingName": "Ama",
  "todayTasks": [ { "…Task" } ], "overdueCount": 1,
  "upcoming": [ { "…Task" } ],
  "stats": { "streakDays": 5, "hoursLast7Days": 6.25 },
  "recentConversations": [ { "id": "…", "title": "…", "updatedAt": "…" } ],
  "unreadNotifications": 2 }
```
One round trip for the dashboard; the greeting phrase (morning/afternoon/evening) is computed client-side from local time.

## 11. Endpoint count
Health 2 · Auth 13 · Users 9 · AI 7 · Courses/Notes 10 · Tasks/Notifications 7 · Study sessions 3 · Decks/Cards 9 · Quizzes 7 · Dashboard 1 · Student Engagement 3 · Admin `/api/admin/*` 36.

## 12. Admin Dashboard & Student Engagement

### Auth 2FA & Student Engagement (`/api/v1/*`)
- `POST /api/v1/auth/admin-2fa/verify` — Verifies a 6-digit email OTP (`{ "userId", "code" }`) when an admin has `twoFactorEnabled = true`.
- `GET /api/v1/announcements/active` — Returns `{ maintenanceMode, maintenanceMessage, announcements }` scoped to the signed-in student's `programme` / `level`.
- `POST /api/v1/feedback` — Submit student feedback (`{ category: "bug" | "suggestion" | "abuse", subject, message }`).
- `POST /api/v1/ai/messages/:id/flag` — Flag an AI chat message (`{ reason }`) for admin moderation.

### Admin API (`/api/admin/*`)
All `/api/admin/*` routes require `requireAuth` + `requireAdmin` (verified `admin` or `super_admin` and `status === "active"`). Role changes require `requireSuperAdmin`.

- **Overview:** `GET /overview?range=7d|30d|90d|custom&from=&to=`
- **Users:** `GET /users`, `GET /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/force-logout`, `POST /users/:id/resend-verification`, `POST /users/:id/trigger-reset`, `PATCH /users/:id/role` (`super_admin` only), `DELETE /users/:id`, `POST /users/bulk`
- **AI Usage & Limits:** `GET /ai-usage`, `PATCH /ai-usage/limits`
- **Moderation & Uploads:** `GET /conversations` (metadata only), `POST /conversations/:id/inspect` (requires `reason`, audited), `GET /uploads`, `POST /uploads/:kind/:id/inspect` (requires `reason`, audited), `DELETE /uploads/:kind/:id`, `GET /flagged`, `PATCH /flagged/:id`
- **Learning:** `GET /learning`
- **Announcements & Feedback:** `GET /announcements`, `POST /announcements`, `PATCH /announcements/:id`, `DELETE /announcements/:id`, `GET /feedback`, `PATCH /feedback/:id`, `POST /feedback/:id/reply`
- **Audit, System & Settings:** `GET /audit-logs?format=json|csv`, `GET /login-history`, `GET /error-logs`, `GET /health`, `GET /settings`, `PATCH /settings`
- **Reports & Exports:** `GET /exports`, `POST /exports` (`users`, `usage`, `ai_costs`, `feedback`, `overview_pdf`), `GET /exports/:id/download`

