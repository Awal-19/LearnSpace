-- Constraints and indexes that Prisma's schema language cannot express.

-- Value ranges (DATABASE.md)
ALTER TABLE "user_settings"
  ADD CONSTRAINT "user_settings_focusMinutes_check" CHECK ("focusMinutes" BETWEEN 1 AND 180),
  ADD CONSTRAINT "user_settings_shortBreakMinutes_check" CHECK ("shortBreakMinutes" BETWEEN 1 AND 60),
  ADD CONSTRAINT "user_settings_longBreakMinutes_check" CHECK ("longBreakMinutes" BETWEEN 1 AND 60);

ALTER TABLE "study_sessions"
  ADD CONSTRAINT "study_sessions_durationSeconds_check" CHECK ("durationSeconds" BETWEEN 60 AND 14400);

ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "quiz_questions_correctIndex_check" CHECK ("correctIndex" BETWEEN 0 AND 3);

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_score_check" CHECK ("total" > 0 AND "score" >= 0 AND "score" <= "total");

-- A reminder offset only makes sense when the task has a due date
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_reminder_requires_due_check"
  CHECK ("reminderOffsetMinutes" IS NULL OR "dueAt" IS NOT NULL);

-- Course names are unique per user, case-insensitively
CREATE UNIQUE INDEX "courses_userId_lower_name_key" ON "courses"("userId", lower("name"));

-- Full-text search over notes
CREATE INDEX "notes_searchVector_idx" ON "notes" USING GIN ("searchVector");

-- Scheduler hot path: only unsent, pending reminders are indexed
CREATE INDEX "tasks_remindAt_pending_idx" ON "tasks"("remindAt")
  WHERE "reminderSentAt" IS NULL AND "status" = 'todo' AND "remindAt" IS NOT NULL;

