# LearnSpace Security Audit (Phase 1)

**Date:** 2026-11-19  
**Scope:** Full static codebase, configuration, dependency, and git-history audit (`client/`, `server/`, `netlify/`, `.github/`, Docker/deployment configs).  
**Mode:** Read-only audit — no application code modified; no live production or third-party endpoints scanned.

---

## Executive Summary

LearnSpace already has a strong security foundation in several core areas (Argon2id password hashing, in-memory access tokens with `httpOnly` rotating refresh cookies, Prisma parameterized queries, strict Zod `.strict()` schemas on most endpoints, magic-byte file checks, and `rehype-sanitize` Markdown rendering).

However, the audit identified **3 Critical**, **11 High**, **10 Medium**, and **8 Low** findings that must be addressed before relying on the deployment against determined attackers or abusers — led by an authentication bypass in `verifyOtp`, a privilege escalation in `bulkUsers`, leaked secrets in git history (`dcf2ef5`), AI budget/concurrency bypasses, zip-bomb DoS vectors, and production source maps / dropped Nginx security headers.

| Severity     | Count |
| ------------ | ----: |
| **Critical** |     3 |
| **High**     |    11 |
| **Medium**   |    10 |
| **Low**      |     8 |

---

## What Is Already Done Well

1. **Password Hashing (`server/src/lib/password.ts:27-36`, `server/src/modules/auth/auth.service.ts:36-37,297,346`)**: Uses `argon2id` (`memoryCost: 19_456`, `timeCost: 2`, `parallelism: 1`) and runs `verifyPassword(DUMMY_HASH, ...)` on unknown or Google-only emails to equalize timing.
2. **JWT & Refresh Token Rotation (`server/src/lib/tokens.ts:19-47`, `server/src/modules/auth/auth.service.ts:503-549`)**: Pins `HS256` on both `jwt.sign` and `jwt.verify`, enforces `JWT_SECRET >= 32` chars and blocks `change-me*` in production (`server/src/config/env.ts:51-53,120-122`), stores 256-bit opaque refresh tokens as SHA-256 hashes, rotates atomically, and revokes the entire `familyId` on reuse detection.
3. **In-Memory Access Tokens & Cookie Hygiene (`client/src/lib/apiClient.ts`, `client/src/app/AuthContext.tsx`, `server/src/modules/auth/auth.routes.ts:22-30`)**: Access tokens are stored strictly in JS module memory (never `localStorage`/`sessionStorage`). `ls_refresh` is `httpOnly`, `secure: isProd`, scoped to `/api/v1/auth`, and protected by `csrfGuard` (`X-Requested-With: learnspace`).
4. **Consistent IDOR / 404 Discipline**: Domain services (`courses`, `timetable`, `exams`, `notes`, `planner`, `focus`, `gpa`, `study`, `documents`, `ai`, `rag`) scope queries by `userId: req.user!.id`, verify cross-referenced IDs (`courseId`, `taskId`, `noteId`, `documentId`, `scaleId`), and return `404 NOT_FOUND` rather than `403` to prevent resource ID enumeration.
5. **SQL Injection & Command Injection Resistance**: Zero `$queryRawUnsafe`, zero SQL string concatenation (all 3 `$queryRaw` usages in `admin.service.ts:253,1638`, `notes.service.ts:75`, and `documents.jobs.ts:389,437` use Prisma tagged template literals), and zero `child_process` calls on user input.
6. **Magic-Byte File Validation & Private Storage (`server/src/modules/ai/attachments.service.ts:64-155`, `server/src/lib/storage.ts:18-46,81-94,266-297`, `server/src/modules/rag/rag.service.ts:88-90`)**: Validates file magic bytes and ZIP structure (rejecting SVG/HTML), strips avatar EXIF via `sharp`, stores attachments/documents as Cloudinary `authenticated` assets served via 300s signed URLs, and checks `path.resolve(DEV_DIR)` prefix for local dev storage.
7. **Frontend XSS Hygiene (`client/src/features/chat/MarkdownContent.tsx`, `client/index.html:13`, `client/public/theme-init.js`)**: Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `document.write()` calls; Markdown runs `rehypeSanitize` before `rehypeKatex`/`rehypeHighlight` and adds `target="_blank" rel="noopener noreferrer"`; theme init is externalized to allow strict CSP.
8. **Log Redaction & Error Scrubbing (`server/src/lib/logger.ts:5-20`, `server/src/middleware/errorHandler.ts:27-84`)**: Pino redacts `authorization`, `cookie`, `set-cookie`, `password`, `token`, and `apiKey`; production 500 responses strip stack traces and internal details.

---

## Findings

### Critical

#### C-1. Authentication Bypass in `verifyOtp` for Already-Verified Accounts

- **Location:** `server/src/modules/auth/auth.service.ts:823-837`, `server/src/modules/auth/auth.routes.ts:91-108`
- **Issue & Exploit:** `POST /api/v1/auth/verify-otp` is a public unauthenticated route. When `user.emailVerified` is already `true` (`auth.service.ts:835-837`), `verifyOtp` immediately calls `return issueSession(user, false, meta)` **without checking `code`, checking a password, or enforcing admin 2FA**. Knowing any verified user's email (including `admin` or `super_admin` accounts), an attacker can submit any 6-digit string (e.g., `"000000"`) and immediately receive a valid access token and refresh cookie (full account takeover).
- **Fix:** Remove the `if (user.emailVerified) return issueSession(...)` branch. Return the same generic `'Invalid verification code.'` error (`VALIDATION_ERROR`) when `user.emailVerified` is `true` so already-verified accounts cannot bypass login and cannot be enumerated.

#### C-2. Regular `admin` Can Suspend `super_admin` and Other Admins via `bulkUsers`

- **Location:** `server/src/modules/admin/admin.service.ts:679-707`, `server/src/modules/admin/admin.routes.ts:243-257`
- **Issue & Exploit:** Unlike `setUserStatus` (`admin.service.ts:465-473`) and `deleteUser` (`admin.service.ts:651-656`), `bulkUsers` (`POST /api/admin/users/bulk`) only filters out `actorId` and does not check the target users' roles or require `can_manage_users`. A compromised or malicious regular `admin` can suspend any `super_admin` or fellow `admin` (and revoke all their refresh tokens), locking out platform governance.
- **Fix:** Query target users' `role` before mutating in `bulkUsers`; if `actor.role !== 'super_admin'` and any target is `admin` or `super_admin`, reject with `403 FORBIDDEN`. Enforce `requirePermission('can_manage_users')` on `POST /api/admin/users/bulk`.

#### C-3. Real Secrets Committed to Git History (`.env` in Commit `dcf2ef5`)

- **Location:** Git commit `dcf2ef5156e75a3c7729d50b2f80c6c32fb4b0ad` (`.env`, removed in `47dfc84db7a6dea448695dac8b0c23a8cf269116`)
- **Issue & Exploit:** `.env` containing `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and a 43-character `JWT_SECRET` was committed to `main` and remains readable in git history (`git show dcf2ef5:.env`). Anyone with repository access can forge JWTs or access any service still reusing those values.
- **Fix:** Rotate `JWT_SECRET` and any reused Postgres passwords in production/local environments, purge `.env` from git history if desired (`git filter-repo`), and enforce secret scanning (`gitleaks`) in CI.

---

### High

#### H-1. OAuth Account Pre-Hijacking via Auto-Linking to Unverified Password Accounts

- **Location:** `server/src/modules/auth/auth.service.ts:757-773`
- **Issue & Exploit:** In `completeGoogleOAuth`, when a Google user's email matches an existing `User` row (`existingByEmail`), it links the Google `AuthIdentity` and sets `emailVerified: true` without clearing `passwordHash`. An attacker can pre-register an unverified account with a victim's email and an attacker-chosen password (`signup`, `auth.service.ts:272-285`); once the victim logs in with Google, `emailVerified` flips to `true` and the attacker can log in using that password.
- **Fix:** If `existingByEmail` was `!emailVerified` and has `passwordHash !== null`, clear `passwordHash: null` and revoke all existing tokens/sessions upon verified Google OAuth linking.

#### H-2. Missing Attempt Limit on Admin 2FA Verification (`verifyAdminTwoFactor`)

- **Location:** `server/src/modules/auth/auth.service.ts:404-428,446-470`, `server/src/modules/auth/auth.routes.ts:144-146`
- **Issue & Exploit:** Admin 2FA codes are 6-digit numbers stored in `prisma.emailToken`, which has **no `attempts` counter** and no invalidation after failed guesses (unlike `otpCode`). `/auth/admin-2fa/verify` only has IP-based `authLimiter` (10 req/min), allowing distributed brute-force over the 10-minute TTL. _(Also a bug at `auth.service.ts:419-423`: the raw 6-digit code is passed as `verifyUrl` to `sendVerificationEmail` instead of `sendOtpEmail`.)_
- **Fix:** Store admin 2FA codes in `otpCode` with a 5-attempt limit + invalidation, add an email-keyed rate limiter to `/auth/admin-2fa/verify`, and send via `email.sendOtpEmail`.

#### H-3. `requireAuth` Does Not Re-Check User Existence, Suspension, or Token Revocation

- **Location:** `server/src/middleware/auth.ts:8-28`, `server/src/app.ts:166-197`, `server/src/modules/users/users.service.ts:191-205`
- **Issue & Exploit:** Non-admin routes rely solely on stateless JWT verification in `requireAuth`. A suspended or deleted user—or an attacker holding a stolen access token after `logout`, `logoutAll`, `changePassword`, or `resetPassword`—retains API access until the 15-minute access token expires. `verifyEmailCheck` (`app.ts:166-197`) only checks `emailVerified`, not `status === 'suspended'`.
- **Fix:** Check `status !== 'suspended'`, user existence, and a `tokensValidAfter` timestamp (or `tokenVersion`) on `User` inside `requireAuth` (updated on `logoutAll`, `changePassword`, `resetPassword`, and suspension).

#### H-4. Missing `requirePermission('can_export_data')` on Exports & Fail-Open `requirePermission`

- **Location:** `server/src/modules/admin/admin.routes.ts:687-716`, `server/src/middleware/auth.ts:121-133`
- **Issue & Exploit:** `POST /api/admin/exports` and `GET /api/admin/exports/:id/download` lack `requirePermission('can_export_data')` (only `GET /exports` has it). In addition, `requirePermission` checks `req.adminPermissions?.[permission] === false` (fail-open when a permission key is missing), and most granular admin routes (`users`, `flagged`, `ai-usage`, `conversations/:id/inspect`, `uploads/:kind/:id/inspect`, `announcements`) do not call `requirePermission` at all.
- **Fix:** Make `requirePermission` fail-closed (`!== true`), enforce `requirePermission('can_export_data')` on export creation/download, and wire `can_manage_users`, `can_moderate_content`, `can_view_ai_usage`, and `can_send_announcements` across all matching admin routes.

#### H-5. Super-Admin Step-Up Bypassed by Shared `ADMIN_CONSOLE_PASSWORD` & Missing on Sensitive Routes

- **Location:** `server/src/modules/admin/admin.service.ts:1902-1915`, `server/src/modules/admin/admin.routes.ts:214-231,269-278,504-513`
- **Issue & Exploit:** `verifyStepUp` accepts the shared `ADMIN_CONSOLE_PASSWORD` (known to regular admins) as a valid `super_admin` step-up credential, and three `superAdminOnly` mutation endpoints (`PATCH /users/:id/role`, `PATCH /ai-usage/limits`, `PATCH /settings`) do not enforce `requireStepUp`.
- **Fix:** Remove `env.ADMIN_CONSOLE_PASSWORD` from `verifyStepUp` (require the `super_admin`'s personal password or OTP) and add `requireStepUp` to `PATCH /users/:id/role`, `PATCH /ai-usage/limits`, and `PATCH /settings`.

#### H-6. AI Quotas, Global Monthly Cost Cap, and Concurrency Limits Bypassed Across Endpoints

- **Location:** `server/src/modules/ai/ai.service.ts:33,281-287`, `server/src/modules/documents/documents.jobs.ts:108-333`, `server/src/modules/documents/documents.service.ts:812-1003`, `server/src/modules/notes/notes.service.ts:164-193`
- **Issue & Exploit:** `AppSettings.monthlyCostCapUsd` (`schema.prisma:1081`) is never enforced before LLM calls. `documents.jobs.ts`, `documents.service.ts` (question refine / AI grading), and `notes.service.ts` (`summarizeNote`) never check or increment `AiUsageDaily`. `ai.service.ts` has a read-then-increment TOCTOU race and no per-user concurrency cap, allowing parallel requests to drain the LLM budget.
- **Fix:** Create a shared pre-flight AI budget & concurrency guard checking `AppSettings.monthlyCostCapUsd`, `dailyMessageLimit`, `dailyTokenLimit`, and an atomic per-user active-request cap before every LLM call.

#### H-7. Zip Bomb / Decompression Bomb & Unbounded PDF/Image Resource Exhaustion

- **Location:** `server/src/modules/ai/attachments.service.ts:116,165-183,330`, `server/src/modules/documents/documents.extract.ts:73-105,249,300-303`, `server/src/modules/rag/rag.service.ts:174-184`
- **Issue & Exploit:** `AdmZip(buffer)` and `mammoth` decompress `.docx`/`.pptx` archives in memory without checking total uncompressed size or entry count; `PDFParse` has no page-count cap; `sharp(buffer)` uses default high pixel limits. A 1 MB crafted `.pptx`/`.docx` zip bomb can OOM-crash the server.
- **Fix:** Inspect `zip.getEntries()` `header.size` and entry count before decompression (cap at e.g. 50 MB uncompressed / 2,000 entries), cap PDF page counts (e.g. 200 pages), and pass `{ limitInputPixels: 25_000_000 }` to `sharp`.

#### H-8. Prompt Injection Delimiter Escape in RAG, Attachments, and Document Q&A

- **Location:** `server/src/modules/ai/ai.service.ts:379`, `server/src/modules/rag/rag.service.ts:136`, `server/src/modules/documents/documents.service.ts:638-645`, `server/src/modules/documents/documents.prompts.ts:27-89`, `server/src/modules/notes/notes.service.ts:176-184`
- **Issue & Exploit:** Untrusted document text is wrapped in `<attached_document>`, `<lecture_notes>`, or `<course_material>` without escaping closing tags (`</attached_document>` etc.), and document/OCR/note prompts lack explicit untrusted-data boundary instructions. Uploaded text can close the XML tag and inject instructions.
- **Fix:** Escape/strip closing delimiter tags (or use per-request random nonce delimiters) and add explicit system-prompt instructions treating all document/OCR text strictly as untrusted data.

#### H-9. Audit Log Erasure via `onDelete: Cascade` on `AuditLog.actor`

- **Location:** `server/prisma/schema.prisma:1043-1058`, `server/src/modules/admin/admin.service.ts:665`
- **Issue & Exploit:** Deleting an admin via `DELETE /api/admin/users/:id` cascades and permanently deletes all `AuditLog` entries authored by that admin, destroying forensic accountability.
- **Fix:** Make `AuditLog.actorId` nullable with `onDelete: SetNull` (and store an `actorEmail` snapshot in `metadataJson`).

#### H-10. Production Source Maps Exposed (`client/vite.config.ts:18`)

- **Location:** `client/vite.config.ts:18`
- **Issue & Exploit:** `build: { sourcemap: true }` publishes `.js.map` files in `client/dist/assets/`, exposing full TypeScript sources, comments, and admin endpoints in production.
- **Fix:** Set `sourcemap: false` (or `'hidden'` if uploading maps privately to Sentry).

#### H-11. Missing / Dropped Security Headers in Nginx & Netlify

- **Location:** `client/nginx.conf:22-36`, `netlify.toml:1-13`
- **Issue & Exploit:** In `client/nginx.conf`, `add_header Cache-Control ...` inside `location /assets/` and `location /` silently cancels inheritance of `server`-level `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers, and CSP/HSTS/`Permissions-Policy` are missing. `netlify.toml` also defines no `[[headers]]` security headers.
- **Fix:** Repeat all security headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) inside every `location` block in `client/nginx.conf` and add `[[headers]]` to `netlify.toml`.

---

### Medium

| ID       | Finding                                                                 | Location                                                                                                                                                                                          | Exploit / Impact & Fix                                                                                                                                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M-1**  | Pre-auth user enumeration & suspension reason leak                      | `server/src/modules/auth/auth.service.ts:263-266,309-343,828-852`                                                                                                                                 | `ACCOUNT_SUSPENDED` (with `suspendedReason`) and `ACCOUNT_LOCKED` are returned before password check; `verifyOtp` differs between missing user and missing/expired OTP. Check password before lock/suspension status and unify OTP errors.                                                                     |
| **M-2**  | Unbounded IP abuse on `/auth/forgot-password`                           | `server/src/modules/auth/auth.routes.ts:53-60,237-245`                                                                                                                                            | `emailLimiter` keys only by `email` when unauthenticated; one IP can spam 120 distinct emails/min or lock victims out of resets. Add an IP-based limiter alongside `emailLimiter`.                                                                                                                             |
| **M-3**  | Google OAuth `redirect_uri` falls back to `Host` header                 | `server/src/modules/auth/auth.routes.ts:257-258`                                                                                                                                                  | If `GOOGLE_CALLBACK_URL` is unset, `resolveGoogleCallbackUrl` trusts `req.get('host')`. Require `GOOGLE_CALLBACK_URL` (or explicit `API_URL`) when Google OAuth is enabled.                                                                                                                                    |
| **M-4**  | In-memory rate limiters + missing bot protection                        | `server/src/app.ts:95-120`, `server/src/modules/auth/auth.routes.ts:36-70`, `server/src/modules/admin/admin.routes.ts:56-62`                                                                      | `express-rate-limit` uses default `MemoryStore` (resets on restart / per replica) and has no Turnstile/hCaptcha on signup/OTP resend. Add a shared Postgres-backed store and optional Turnstile hook.                                                                                                          |
| **M-5**  | Direct `fetch()` omits `X-Requested-With` & token refresh               | `client/src/features/admin/adminApi.ts:189-194,467-470,580-583`, `client/src/features/documents/documentsApi.ts:246-259,327-332,425-430`, `client/src/features/settings/SettingsPage.tsx:287-290` | Bypasses `apiClient.request()` CSRF header and `TOKEN_EXPIRED` refresh-and-retry. Route blob/stream fetches through a shared `apiClient` helper.                                                                                                                                                               |
| **M-6**  | Image EXIF fallback skips stripping in `documents.service.ts`           | `server/src/modules/documents/documents.service.ts:303-312`                                                                                                                                       | Catching `sharp` errors stores raw unstripped image bytes (retaining EXIF GPS/camera data). Reject with `UNSUPPORTED_MEDIA_TYPE` instead.                                                                                                                                                                      |
| **M-7**  | CSV formula injection in admin exports                                  | `server/src/modules/admin/admin.service.ts:70-76,726-741,1576-1589,1729-1791`                                                                                                                     | `csvEscape` does not prefix leading `=`, `+`, `-`, `@`, `\t`, `\r` with `'`. Neutralize formula prefixes in `csvEscape`.                                                                                                                                                                                       |
| **M-8**  | No timeout in Gemini LLM provider & no-op malware hook                  | `server/src/lib/llm/gemini.ts:79,175`, `server/src/modules/rag/rag.service.ts:163`, `attachments.service.ts:25-29`                                                                                | Add `AbortSignal.timeout(180_000)` to `gemini.ts`; wire optional ClamAV/scanner command/HTTP hook across `attachments`, `documents`, and `rag`.                                                                                                                                                                |
| **M-9**  | Client Nginx runs as `root` & forwards raw `X-Forwarded-Proto`          | `client/nginx.conf:15`, `client/Dockerfile:34-39`                                                                                                                                                 | Switch client image to `nginxinc/nginx-unprivileged:1.27-alpine` (non-root) and avoid blindly trusting client-supplied `X-Forwarded-Proto` when not behind a trusted proxy.                                                                                                                                    |
| **M-10** | Production dependency vulnerabilities (`npm audit`) & minimal CI checks | `package-lock.json`, `.github/workflows/ci.yml:43-48`                                                                                                                                             | `npm audit --omit=dev` reports **8 vulnerabilities** (2 high: `nodemailer <=10.1.3`, `zod <4.6.6`; 2 moderate: `react-router` / `react-router-dom <=7.17.0`; 4 low: `katex`, `remark-math`, `rehype-katex`, `micromark-extension-math`). CI only greps 3 keys and lacks `npm audit` / `gitleaks` / Dependabot. |

---

### Low

| ID      | Finding                                                                                                           | Location                                                                                                                                       | Fix                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L-1** | Missing OIDC `nonce` and `id_token` (`iss`/`aud`) verification                                                    | `server/src/modules/auth/auth.service.ts:681-745`                                                                                              | Add OIDC `nonce` to OAuth state cookie and verify `id_token` `iss`, `aud`, `nonce`, and `email_verified`.                                          |
| **L-2** | `refresh` doesn't revoke token family on suspension; `clearCookie` flag mismatch                                  | `server/src/modules/auth/auth.service.ts:520-522`, `server/src/modules/users/users.routes.ts:153,165`, `auth.routes.ts:279`                    | Revoke `familyId` when suspended user calls `refresh`; pass matching `httpOnly/secure/sameSite` to `clearCookie`.                                  |
| **L-3** | `ensureBootstrapAdmin` auto-promotes existing user & small `COMMON_PASSWORDS` list                                | `server/src/server.ts:84-139`, `server/src/lib/password.ts:4-16`                                                                               | Do not auto-promote pre-existing unverified users; validate `ADMIN_CONSOLE_PASSWORD`; expand common/breached password list.                        |
| **L-4** | `Content-Disposition` filename & `signedUrl` scheme validation                                                    | `server/src/modules/ai/attachments.routes.ts:100`, `client/src/features/admin/AdminContentPage.tsx:385-393`                                    | Strip `["\r\n]` in `attachments.routes.ts` header; validate `https://` / `/` scheme and use `rel="noopener noreferrer"` in `AdminContentPage.tsx`. |
| **L-5** | `AuthenticatedCardImage` sends Bearer/cookies without origin check                                                | `client/src/features/study/AuthenticatedCardImage.tsx:27-31`                                                                                   | Only send `Authorization` and `credentials: 'include'` if `src` is relative `/` or matches `API_BASE_URL` origin.                                  |
| **L-6** | Unvalidated `courseId` query param (`GET /ai/documents`) & dead invite route                                      | `server/src/modules/rag/rag.routes.ts:79-90`, `server/src/modules/admin/admin.routes.ts:718-726`                                               | Validate `courseId` query (`'none' \| uuid`); remove unreachable `/api/admin/auth/admin-invite/accept` route.                                      |
| **L-7** | Hardcoded upload quotas ignore `AppSettings` & personal placeholder email in UI                                   | `attachments.service.ts:15,291`, `documents.service.ts:44,256`, `client/src/features/admin/RequireAdmin.tsx:136`                               | Read `AppSettings.dailyUploadQuota` / `maxUploadBytes`; replace `awalsarpong4@gmail.com` placeholder with generic `admin@learnspace.app`.          |
| **L-8** | Unpinned Docker tags, `0.0.0.0:5433` DB bind in `docker-compose`, `safeNext` backslash, `client/.env.example` IDs | `server/Dockerfile`, `client/Dockerfile`, `docker-compose.yml:16`, `client/src/features/auth/LoginPage.tsx:20-23`, `client/.env.example:12-14` | Pin base images/tags, bind local Postgres to `127.0.0.1:5433:5432`, reject `/\` in `safeNext`, clear real IDs from `.env.example`.                 |

---

## Route-by-Route Access Control Matrix

| Route Group                                                                                                                            | Auth Gate                                              | Email Verified Gate               | Role / Permission                           | Ownership / IDOR                             | Mass Assignment          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------ |
| `GET /api/health`, `/api/health/ready`                                                                                                 | Public                                                 | —                                 | —                                           | None                                         | —                        |
| `/api/v1/auth/*` (login, signup, verify-otp, forgot/reset, google)                                                                     | Public (except `/sessions`, `/logout*`)                | —                                 | —                                           | Token/user-scoped (`verify-otp` has **C-1**) | `.strict()` schemas      |
| `/api/v1/users/me*`                                                                                                                    | `requireAuth` (**H-3**)                                | Global `verifyEmailCheck`         | Any verified user                           | `req.user!.id` only                          | Explicit allowlist       |
| `/api/v1/courses*`, `/timetable*`, `/tasks*`, `/notifications*`, `/study-sessions*`, `/gpa*`, `/notes*`, `/exams*`, `/revision-plans*` | `requireAuth` (**H-3**)                                | Global + explicit on AI routes    | Any verified user                           | Owner-scoped, returns `404`                  | `.strict()` / allowlists |
| `/api/v1/conversations*`, `/ai/attachments*`, `/ai/documents*`, `/documents*`, `/question-sets*`                                       | `requireAuth` (**H-3**)                                | Global + explicit on uploads & AI | Any verified user                           | Owner-scoped, returns `404`                  | `.strict()` / allowlists |
| `/api/v1/dashboard`, `/analytics`, `/announcements/active`, `/feedback`, `/ai/messages/:id/flag`                                       | `requireAuth` (**H-3**)                                | Global                            | Any verified user                           | `req.user!.id` only (`404` on flag)          | `.strict()` schemas      |
| `/api/admin/*`                                                                                                                         | `requireAuth` + `requireAdmin` + `isConsoleUnlocked`   | Checked in `requireAdmin`         | `admin` / `super_admin` (**C-2, H-4, H-5**) | Reason-logged inspection (`min 5 chars`)     | `.strict()` schemas      |
| `/api/admin/super/*`                                                                                                                   | Same + `requireSuperAdmin` + `requireStepUp` (**H-5**) | Checked in `requireAdmin`         | `super_admin` only                          | Audit-logged                                 | `.strict()` schemas      |

---

## Prioritized Fix Plan (Phases 2–11)

1. **Immediate Hotfixes (Phases 2–4 — Critical & High Auth/Access/Secrets):**
   - **Phase 2 (Secrets & Config):** Rotate exposed secrets from `dcf2ef5` (`JWT_SECRET`, local/reused DB creds), clean `.env.example`, harden production env startup checks (`server/src/config/env.ts`), verify zero secrets in built `client/dist`.
   - **Phase 3 (Auth & Sessions):** Fix `verifyOtp` bypass (**C-1**), clear `passwordHash` on unverified Google auto-link (**H-1**), add 5-attempt cap + `sendOtpEmail` to Admin 2FA (**H-2**), add `requireAuth` suspension/revocation check (**H-3**), fix auth enumeration/lockout/IP limiters (**M-1, M-2, M-3, L-1, L-2, L-3**).
   - **Phase 4 (AuthZ & Access Control):** Fix `bulkUsers` role escalation (**C-2**), make `requirePermission` fail-closed + enforce on exports & granular admin routes (**H-4**), fix `verifyStepUp` + add `requireStepUp` to `role`/`limits`/`settings` (**H-5**), fix `AuditLog` `onDelete: SetNull` (**H-9**), and add full route × role matrix tests.
2. **Validation, Headers & Rate Limiting (Phases 5–7):**
   - **Phase 5:** Fix CSV formula injection (**M-7**), `Content-Disposition` sanitization (**L-4**), `courseId` query validation (**L-6**), `safeNext` hardening (**L-8**), `AuthenticatedCardImage` origin guard (**L-5**).
   - **Phase 6:** Disable production sourcemaps (**H-10**), fix Nginx `location` header inheritance + add CSP/HSTS/`Permissions-Policy` in `client/nginx.conf`, `netlify.toml`, and `client/vercel.json` (**H-11**), unify `apiClient` CSRF/refresh helper for blob/stream `fetch` (**M-5**).
   - **Phase 7:** Add Postgres-backed shared rate-limit store + Turnstile/hCaptcha hook (**M-4**), enforce `monthlyCostCapUsd`, `dailyMessageLimit`, `dailyTokenLimit`, and per-user concurrency across all AI endpoints (**H-6**).
3. **Uploads, AI, Infra, Monitoring & Attack Simulation (Phases 8–11):**
   - **Phase 8:** Add ZIP decompression/entry-count bounds, PDF page caps, strict `sharp` pixel limits + fail-closed EXIF stripping (**H-7, M-6**), prompt-injection delimiter escaping/nonces (**H-8**), Gemini timeout + scanner hooks (**M-8**).
   - **Phase 9:** Run dependency updates (`npm audit`), add CI `npm audit` + `gitleaks` + Dependabot (**M-10**), switch client Docker to non-root `nginxinc/nginx-unprivileged` (**M-9**), document DB least-privilege/backup plan.
   - **Phase 10:** Wire Sentry scrubbing & security anomaly alerts, verify data export/deletion privacy completeness.
   - **Phase 11:** Run local automated attack simulation suite across all vectors and write `SECURITY_REPORT.md`.
