# LearnSpace Admin Dashboard Guide

This guide explains how to access and use each page of the LearnSpace Admin Console (`/admin`).

## Access & Roles

- **Roles:** `student` (default), `admin`, `super_admin`.
- **Server enforcement:** Every `/api/admin/*` endpoint requires a verified account with `admin` or `super_admin` role (`requireAdmin`), and role changes require `super_admin` (`requireSuperAdmin`).
- **Sessions & 2FA:** Admin access tokens expire after 5 minutes and refresh sessions after 4 hours. Admins with `twoFactorEnabled = true` must enter a 6-digit email OTP at sign-in (`/api/v1/auth/admin-2fa/verify`).
- **Creating the first admin:** Set `ADMIN_EMAIL` in `server/.env` (or your host environment) and run `npm run admin:seed -w server`.

---

## Pages

### 1. Overview (`/admin`)

- **KPI Stat Cards:** Total users, new sign-ups (today / 7d / 30d), active users (DAU / WAU / MAU), verified vs. unverified users, total AI messages, uploads, notes, quizzes taken, and documents processed.
- **Charts:** Sign-ups over time, daily active users, AI messages per day, uploads per day, and most active courses/features. Supports `7d`, `30d`, `90d`, and `custom` date ranges.
- **Live Panels:** Recent sign-ups, recent server errors, and system health status (API, database, email, AI provider).

### 2. Users (`/admin/users` & `/admin/users/:userId`)

- **Directory:** Searchable, sortable, paginated table with filters for role, verification, status (`active` / `suspended`), sign-up date, and sign-in method (`email` / `google`).
- **Bulk actions:** Export selected users to CSV or suspend multiple accounts at once.
- **User Detail:** View profile, programme/level, sign-up & last-active timestamps, usage stats (AI messages, uploads, notes, quizzes, study hours, streak), and recent activity timeline.
- **Actions:** Suspend/reactivate (with reason), force logout (revokes all refresh tokens), resend verification email, trigger password reset, change role (`super_admin` only), or permanently delete account (cascade delete with confirmation).

### 3. AI Usage (`/admin/ai-usage`)

- **Metrics:** Total requests, input/output tokens, estimated USD cost per day/month, average response latency, error rate, feature breakdown (`chat`, `document_qa`, `question_gen`), and top users by usage.
- **Cost Alerts:** Visual alert banner when today's estimated AI spend exceeds the configured `dailyCostAlertUsd` threshold.
- **Live Limits:** Edit global `dailyMessageLimit`, `maxUploadBytes`, `dailyUploadQuota`, and `dailyCostAlertUsd` — changes save to `app_settings` and take effect immediately.

### 4. Content & Moderation (`/admin/content`)

- **Conversations (Privacy-Aware):** Lists conversation metadata only (user, timestamp, message count, estimated tokens) by default. Viewing message text requires typing a moderation reason, which is recorded in `audit_logs`.
- **Flagged Content Queue:** Review messages flagged by users or the system; dismiss, warn, or suspend the offending user.
- **Uploads & Documents:** View total storage used and manage uploaded chat attachments and study documents (with audited inspection and delete).

### 5. Learning (`/admin/learning`)

- Totals and trends for quizzes, flashcard decks, notes, planner tasks, and study hours, plus average quiz scores, completion rates, most popular courses, and student programme/level breakdown.

### 6. Announcements (`/admin/announcements`)

- Create and schedule announcements targeted to `all` users, a specific `programme`, or a `level`, with optional email delivery.
- Toggle **Maintenance Mode** with a custom banner message shown to all students.

### 7. Feedback (`/admin/feedback`)

- Review bug reports, suggestions, and abuse reports submitted from the student Feedback widget.
- Update status (`new`, `in_progress`, `resolved`), save internal admin notes, and reply directly by email.

### 8. Audit Log (`/admin/audit-log`)

- Immutable, searchable, filterable log of all admin actions (actor, action, target, reason, IP, timestamp) with one-click CSV export.

### 9. System (`/admin/system`)

- **System Health:** Live checks for API, PostgreSQL, email service, AI provider, and file storage, plus app version.
- **Login History:** Successful and failed logins with `suspicious` activity flags.
- **Error Log:** Recent server errors with timestamp, route, HTTP status, and error message.

### 10. Settings (`/admin/settings`)

- Configure `appName`, `supportEmail`, feature toggles (`featureChat`, `featureUploads`, `featureDocuments`, `featureSignups`), rate/upload limits, and allowed file types.

### 11. Reports (`/admin/reports`)

- Generate background export jobs for **Users**, **Usage**, **AI Costs**, **Feedback** (CSV), and **Overview Report** (PDF), with optional date range filters and audit logging.
