-- Extend enums for exam reminders and revision plan usage tracking
ALTER TYPE "UsageFeature" ADD VALUE IF NOT EXISTS 'revision_plan';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'exam_reminder';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExamType') THEN
    CREATE TYPE "ExamType" AS ENUM ('midterm', 'final', 'quiz', 'practical', 'oral', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RevisionPlanStatus') THEN
    CREATE TYPE "RevisionPlanStatus" AS ENUM ('active', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RevisionSessionStatus') THEN
    CREATE TYPE "RevisionSessionStatus" AS ENUM ('planned', 'completed', 'missed', 'rescheduled');
  END IF;
END$$;

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "examReminderMinutes" INTEGER NOT NULL DEFAULT 1440;

ALTER TABLE "user_settings" DROP CONSTRAINT IF EXISTS "user_settings_examReminderMinutes_check";
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_examReminderMinutes_check"
  CHECK ("examReminderMinutes" >= 0 AND "examReminderMinutes" <= 10080);

-- Exams table
CREATE TABLE IF NOT EXISTS "exams" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "examType" "ExamType" NOT NULL DEFAULT 'final',
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "durationMinutes" INTEGER,
  "venue" VARCHAR(120),
  "weightPercent" DOUBLE PRECISION,
  "topicsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "notes" VARCHAR(2000),
  "reminderSentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "exams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exams_durationMinutes_check" CHECK ("durationMinutes" IS NULL OR ("durationMinutes" >= 5 AND "durationMinutes" <= 720)),
  CONSTRAINT "exams_weightPercent_check" CHECK ("weightPercent" IS NULL OR ("weightPercent" >= 0 AND "weightPercent" <= 100)),
  CONSTRAINT "exams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "exams_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "exams_userId_startsAt_idx" ON "exams"("userId", "startsAt");
CREATE INDEX IF NOT EXISTS "exams_userId_courseId_startsAt_idx" ON "exams"("userId", "courseId", "startsAt");

-- AI revision plans and sessions
CREATE TABLE IF NOT EXISTS "revision_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "hoursPerDay" DOUBLE PRECISION NOT NULL,
  "daysOffJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "preferredTimesJson" JSONB NOT NULL DEFAULT '["evening"]'::jsonb,
  "status" "RevisionPlanStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "revision_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "revision_plans_hoursPerDay_check" CHECK ("hoursPerDay" > 0 AND "hoursPerDay" <= 24),
  CONSTRAINT "revision_plans_endDate_check" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "revision_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "revision_plans_userId_status_createdAt_idx"
  ON "revision_plans"("userId", "status", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "revision_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "planId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "examId" UUID,
  "courseId" UUID,
  "taskId" UUID,
  "scheduledDate" DATE NOT NULL,
  "startTime" VARCHAR(5) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "topic" VARCHAR(200) NOT NULL,
  "notes" VARCHAR(1000),
  "status" "RevisionSessionStatus" NOT NULL DEFAULT 'planned',
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "revision_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "revision_sessions_durationMinutes_check" CHECK ("durationMinutes" >= 5 AND "durationMinutes" <= 720),
  CONSTRAINT "revision_sessions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "revision_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "revision_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "revision_sessions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "revision_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "revision_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "revision_sessions_taskId_key" ON "revision_sessions"("taskId");
CREATE INDEX IF NOT EXISTS "revision_sessions_userId_scheduledDate_idx"
  ON "revision_sessions"("userId", "scheduledDate");
CREATE INDEX IF NOT EXISTS "revision_sessions_planId_scheduledDate_position_idx"
  ON "revision_sessions"("planId", "scheduledDate", "position");

-- Link exam reminders on notifications
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "examId" UUID;
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_examId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "notifications_examId_idx" ON "notifications"("examId");

