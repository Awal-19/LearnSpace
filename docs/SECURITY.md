# Security

Baseline: OWASP ASVS Level 1, OWASP Top 10 (2021), with extra care for the AI proxy and personal data.

## 1. Assets
Account credentials and sessions · personal profile data (name, student ID, university) · academic content (notes, chats) · the LLM API key and other server secrets · availability and cost of the AI quota.

## 2. Threat model (STRIDE-style)

| # | Threat | Vector | Mitigation |
|---|---|---|---|
| T1 | Credential stuffing / brute force | Repeated login attempts | Per-IP rate limit (10/min), per-account counter and temporary lockout (5 fails/15 min → 15 min), argon2id cost, generic error messages |
| T2 | Account enumeration | Signup/forgot/login responses | Forgot-password response identical; login error generic; signup reveals "email taken" (accepted trade-off, rate limited) |
| T3 | Token theft via XSS | Injected script reads storage | Access token in memory only; refresh in httpOnly cookie; strict CSP; React escapes output; Markdown rendered with sanitiser (no raw HTML) |
| T4 | CSRF | Cross-site form post to cookie endpoint | Cookie scoped to `/api/v1/auth`, `SameSite=Lax`, only refresh/logout use the cookie, and require custom header `X-Requested-With` (not sendable cross-origin without CORS preflight, which we deny); CORS allow-list; all other endpoints use Bearer headers, so are immune |
| T5 | Refresh token replay | Stolen cookie | Rotation on every use, family revocation on reuse, hashed storage, short idle expiry, `logout-all`, revoke-all on password change/reset |
| T6 | Injection (SQL/NoSQL/command) | Request fields | Prisma parameterised queries; `$queryRaw` only with tagged templates; Zod validation on every input; no shell calls |
| T7 | Stored XSS via notes/chat/AI output | Markdown content | Render Markdown with `react-markdown` + `rehype-sanitize`; links forced `rel="noopener noreferrer"`; no `dangerouslySetInnerHTML` (lint rule) |
| T8 | IDOR | Guessing IDs | Every query filters by `userId`; cross-user access returns 404; integration tests per resource |
| T9 | Malicious file upload | Avatar, AI attachment & document endpoints | Avatars ≤ 2 MB (JPEG/PNG/WebP). AI attachments & Study Documents: images ≤ 10 MB (JPEG/PNG/WebP/HEIC), docs ≤ 20 MB (PDF/DOCX/PPTX/TXT/CSV); magic-byte inspection rejects spoofed extensions/MIME types; filenames sanitised & stored under random UUID keys; `sharp` strips EXIF/GPS metadata from images; `MalwareScanner` interface hook (ClamAV-ready); no SVG or executables |
| T10 | LLM abuse / cost exhaustion | Spam requests, giant prompts, oversized uploads | Verified-email requirement, per-user rate limits (20/min chat & AI actions, 30/hr attachment upload, 20/hr document upload), daily token budget & upload quotas (50/day attachments, 30/day documents) in DB, input & extracted-text length caps, chunked processing, upstream timeout 60 s, abort on disconnect |
| T11 | Prompt injection | User text, note contents, or extracted document text telling the model to misbehave | Model has no tools and no access to other users' data or secrets; the system prompt holds no secrets; user content & `<attached_document>` blocks are delimited and treated as untrusted data; output only rendered as sanitised text |
| T12 | Secret leakage | Repo, logs, client bundle | `.env` git-ignored, `.env.example` only, Zod-validated env on server, pino redaction, secret scanning (gitleaks) in CI, only `VITE_*` public values in client |
| T13 | Email token abuse | Guessing reset/verify links | 256-bit random tokens, SHA-256 hashed at rest, single use, short expiry, rate limits; reset invalidates sessions |
| T14 | Clickjacking / MIME sniffing | Embedding | `helmet` defaults, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff` |
| T15 | Dependency vulnerabilities | Supply chain | Lockfile, `npm audit --omit=dev` and Dependabot, minimal dependencies |
| T16 | DoS | Large bodies, slow clients | JSON body limit 100 KB (notes route 300 KB), global rate limit, DB pool limits, request timeouts |
| T17 | OAuth account takeover | Google account with unverified email | Link only if `email_verified=true`; verify `state` + PKCE; verify ID token `aud`/`iss`/`exp` |
| T18 | Data retention after deletion | Orphaned rows or cloud files | FK cascades; avatars and `message_attachments` removed from Cloudinary/storage on attachment, conversation, or account deletion; tested |

## 3. Authentication strategy

- **Passwords:** argon2id (memory 19 MiB, t=2, p=1, OWASP minimum; tune on hosts), unique salt per hash. Policy: ≥ 8 chars, letter + number, max 128 (argon2 has no 72-byte limit, which is one reason it's chosen over bcrypt). Check against a small common-password list.
- **Access token:** JWT (HS256 with ≥ 256-bit secret, or EdDSA), `sub`, `iat`, `exp` 15 min, `jti`; contains no PII beyond the user id. Sent as `Authorization: Bearer`. Kept in JS memory.
- **Refresh token:** 256-bit random value, stored hashed. Cookie `ls_refresh`: `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`. Lifetime 30 days if "Remember me", otherwise a session cookie with a 24 h server-side cap. Rotated on every refresh; reuse detection revokes the family.
- **Cookie site-ness in production:** client and API must be same-site (e.g., `app.example.com` and `api.example.com`), otherwise browsers that block third-party cookies (Safari, Chrome soon) break refresh. Fallback if no custom domain: proxy `/api/*` through Vercel rewrites so the browser sees one origin. Streaming through the proxy must be verified in Phase 8; the custom-domain route is the recommended one.
- **Email verification:** required for AI endpoints and email notifications (cost/abuse control), not for basic use.
- **Authorization:** one role; every service function takes `userId` from the verified token, never from the request body.
- **Sessions UI:** "Log out everywhere" in Settings.
- **Google:** Authorization Code + PKCE, server-side exchange; never place tokens in URLs.

## 4. Transport and headers
HTTPS only in production (HSTS via helmet, `trust proxy` configured for Render). CORS: single allow-listed origin from `CORS_ORIGIN`, `credentials: true`, methods/headers explicit. CSP on the client host (Vercel headers): `default-src 'self'; img-src 'self' https://res.cloudinary.com data:; connect-src 'self' <API origin>; frame-ancestors 'none'`. Referrer-Policy `strict-origin-when-cross-origin`; Permissions-Policy denies camera/mic/geolocation.

## 5. Input handling
Zod validates body, query and params; unknown keys are stripped (`.strict()` on mutation bodies). Strings trimmed and length-capped. Text containing control characters is rejected. Output encoding is React's default; the server never builds HTML except from fixed email templates with escaped variables. UUID params validated before DB access.

## 6. Data protection
| Data | At rest | In transit | Notes |
|---|---|---|---|
| Passwords | argon2id hash | TLS | Never logged |
| Tokens (refresh, email) | SHA-256 hash | TLS | Raw values only in cookie/email |
| Profile, notes, chats | Provider-managed disk encryption (Render Postgres) | TLS | Stored plaintext in DB; end-to-end encryption out of scope |
| Avatars | Cloudinary | HTTPS | Public URL with unguessable ID; documented as public |
| Chat attachments | Cloudinary (`authenticated`) / dev temp dir | HTTPS | Owner-only access via `GET /ai/attachments/:id/content` (`404` on cross-user access) or short-lived signed URL |
| Logs | n/a | n/a | Redact auth headers, cookies, passwords, tokens; no message bodies logged; retention 14 days |

- **Privacy with the LLM provider:** note and chat text sent to Gemini only on explicit user actions; privacy notice states this. Free-tier Gemini may use data to improve products; users are told, and a paid-tier switch is documented for stricter terms. (Decision for you: see questions in the Phase 0 summary.)
- **Account deletion:** complete cascade delete; backups roll off within the provider's retention window (documented).
- **Least privilege:** DB user with only app privileges; Cloudinary key limited to server; no secrets in client.

## 7. Secure development
ESLint security rules (`eslint-plugin-security`, no `dangerouslySetInnerHTML`), Prettier, typed Zod schemas, code review checklist from this doc, gitleaks + `npm audit` + CodeQL in GitHub Actions, Dependabot weekly. Phase 7 includes a security review against this threat table, with a test for each row that can be automated.

## 8. Incident basics
Rotate `JWT_SECRET` (invalidates all access tokens; refresh tokens survive) and `DATABASE_URL`/API keys via the host dashboards; revoke all refresh tokens with a single SQL update; logs carry request IDs for tracing. Sentry alerts on error spikes (Phase 8).

