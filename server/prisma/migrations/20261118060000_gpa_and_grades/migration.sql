DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RetakePolicy') THEN
    CREATE TYPE "RetakePolicy" AS ENUM ('latest', 'highest', 'include_all');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "grading_scales" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "maxGpa" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
  "retakePolicy" "RetakePolicy" NOT NULL DEFAULT 'latest',
  "boundariesJson" JSONB NOT NULL,
  "degreeClassesJson" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grading_scales_maxGpa_check" CHECK ("maxGpa" > 0 AND "maxGpa" <= 10),
  CONSTRAINT "grading_scales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "grading_scales_userId_isDefault_idx" ON "grading_scales"("userId", "isDefault");

CREATE TABLE IF NOT EXISTS "grade_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "courseId" UUID,
  "scaleId" UUID,
  "semester" VARCHAR(60) NOT NULL,
  "semesterOrder" INTEGER NOT NULL DEFAULT 1,
  "courseCode" VARCHAR(24) NOT NULL,
  "courseTitle" VARCHAR(120) NOT NULL,
  "creditHours" DOUBLE PRECISION NOT NULL,
  "score" DOUBLE PRECISION,
  "gradeLabel" VARCHAR(12) NOT NULL,
  "gradePoint" DOUBLE PRECISION NOT NULL,
  "excludeFromGpa" BOOLEAN NOT NULL DEFAULT false,
  "isRetake" BOOLEAN NOT NULL DEFAULT false,
  "retakeGroupKey" VARCHAR(40),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "grade_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grade_records_creditHours_check" CHECK ("creditHours" >= 0 AND "creditHours" <= 30),
  CONSTRAINT "grade_records_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
  CONSTRAINT "grade_records_gradePoint_check" CHECK ("gradePoint" >= 0 AND "gradePoint" <= 10),
  CONSTRAINT "grade_records_semesterOrder_check" CHECK ("semesterOrder" >= 1 AND "semesterOrder" <= 50),
  CONSTRAINT "grade_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "grade_records_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "grade_records_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "grading_scales"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "grade_records_userId_semesterOrder_createdAt_idx" ON "grade_records"("userId", "semesterOrder", "createdAt");
CREATE INDEX IF NOT EXISTS "grade_records_userId_retakeGroupKey_idx" ON "grade_records"("userId", "retakeGroupKey");

