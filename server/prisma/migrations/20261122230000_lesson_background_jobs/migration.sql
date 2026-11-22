-- Add needs_review status and background job tracking fields to topic_lessons
ALTER TYPE "LessonStatus" ADD VALUE IF NOT EXISTS 'needs_review';

DO $$
BEGIN
  CREATE TYPE "LessonJobStatus" AS ENUM ('queued', 'generating', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END
$$;

ALTER TABLE "topic_lessons"
  ADD COLUMN IF NOT EXISTS "jobStatus" "LessonJobStatus" NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS "generationError" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "generationLockedUntil" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "generationStartedAt" TIMESTAMPTZ(3);

CREATE INDEX IF NOT EXISTS "topic_lessons_jobStatus_updatedAt_idx"
  ON "topic_lessons"("jobStatus", "updatedAt" DESC);

