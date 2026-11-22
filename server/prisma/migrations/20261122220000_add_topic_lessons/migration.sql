DO $$ BEGIN
  CREATE TYPE "LessonStatus" AS ENUM ('draft', 'reviewed', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LessonProgressStatus" AS ENUM ('not_started', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "subject_topics"
  ADD COLUMN IF NOT EXISTS "strand" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "subStrand" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "referenceNotes" TEXT;

CREATE TABLE IF NOT EXISTS "topic_lessons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "topicId" UUID NOT NULL,
  "contentJson" JSONB NOT NULL,
  "status" "LessonStatus" NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "languageLevel" VARCHAR(20) NOT NULL DEFAULT 'shs',
  "reviewerId" UUID,
  "reviewedAt" TIMESTAMPTZ(3),
  "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "model" VARCHAR(80) NOT NULL,
  "promptVersion" VARCHAR(32) NOT NULL DEFAULT 'v1',
  "opensCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "topic_lessons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topic_lessons_topicId_key" UNIQUE ("topicId"),
  CONSTRAINT "topic_lessons_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "subject_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "topic_lessons_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "topic_lessons_status_updatedAt_idx" ON "topic_lessons"("status", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "lesson_progress" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "status" "LessonProgressStatus" NOT NULL DEFAULT 'not_started',
  "positionPct" INTEGER NOT NULL DEFAULT 0,
  "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lesson_progress_userId_topicId_key" UNIQUE ("userId", "topicId"),
  CONSTRAINT "lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lesson_progress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "subject_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "lesson_progress_userId_status_idx" ON "lesson_progress"("userId", "status");

CREATE TABLE IF NOT EXISTS "lesson_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "status" "FlagStatus" NOT NULL DEFAULT 'open',
  "reviewNote" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lesson_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lesson_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lesson_reports_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "subject_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "lesson_reports_status_createdAt_idx" ON "lesson_reports"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "lesson_reports_topicId_idx" ON "lesson_reports"("topicId");

