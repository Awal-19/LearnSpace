-- Extend courses with rich academic metadata and archive/update timestamps
ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "code" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "lecturer" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "creditHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "semester" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "level" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "courseNotes" VARCHAR(4000),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_creditHours_check";
ALTER TABLE "courses" ADD CONSTRAINT "courses_creditHours_check"
  CHECK ("creditHours" IS NULL OR "creditHours" >= 0);

CREATE INDEX IF NOT EXISTS "courses_userId_archivedAt_idx" ON "courses"("userId", "archivedAt");
CREATE INDEX IF NOT EXISTS "courses_userId_semester_idx" ON "courses"("userId", "semester");

-- Optional courseId links for existing study features (existing rows stay NULL / unassigned)
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "courseId" UUID;
ALTER TABLE "study_sessions" ADD COLUMN IF NOT EXISTS "courseId" UUID;
ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "courseId" UUID;
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "courseId" UUID;
ALTER TABLE "study_documents" ADD COLUMN IF NOT EXISTS "courseId" UUID;

ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_courseId_fkey";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "study_sessions" DROP CONSTRAINT IF EXISTS "study_sessions_courseId_fkey";
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "decks" DROP CONSTRAINT IF EXISTS "decks_courseId_fkey";
ALTER TABLE "decks" ADD CONSTRAINT "decks_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quizzes" DROP CONSTRAINT IF EXISTS "quizzes_courseId_fkey";
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "study_documents" DROP CONSTRAINT IF EXISTS "study_documents_courseId_fkey";
ALTER TABLE "study_documents" ADD CONSTRAINT "study_documents_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "tasks_userId_courseId_idx" ON "tasks"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "conversations_userId_courseId_idx" ON "conversations"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "study_sessions_userId_courseId_idx" ON "study_sessions"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "decks_userId_courseId_idx" ON "decks"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "quizzes_userId_courseId_idx" ON "quizzes"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "study_documents_userId_courseId_idx" ON "study_documents"("userId", "courseId");

