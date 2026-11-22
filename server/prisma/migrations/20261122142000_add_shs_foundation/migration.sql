-- AlterEnum
ALTER TYPE "UsageFeature" ADD VALUE IF NOT EXISTS 'shs_ai';

-- CreateEnums
DO $$ BEGIN CREATE TYPE "LearnerType" AS ENUM ('university', 'shs'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AgeGroup" AS ENUM ('adult_18_plus', 'under_18'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "GuardianConsentStatus" AS ENUM ('not_required', 'pending', 'given', 'withdrawn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CourseItemType" AS ENUM ('course', 'subject'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WassceMockFormat" AS ENUM ('objective', 'theory', 'mixed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ModerationPriority" AS ENUM ('normal', 'high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable users (existing users default to university, adult_18_plus, not_required)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "learnerType" "LearnerType" NOT NULL DEFAULT 'university',
  ADD COLUMN IF NOT EXISTS "schoolYear" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "schoolName" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "ageGroup" "AgeGroup" NOT NULL DEFAULT 'adult_18_plus',
  ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE,
  ADD COLUMN IF NOT EXISTS "guardianConsentStatus" "GuardianConsentStatus" NOT NULL DEFAULT 'not_required';

-- AlterTable app_settings
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "featureShsSignups" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featureShsCommunity" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "shsDailyTokenLimit" INTEGER NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS "shsBannedWordsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "shsSyllabusSource" VARCHAR(300) NOT NULL DEFAULT 'NaCCA / GES Senior High School Curriculum Framework (nacca.gov.gh)';

-- AlterTable communities & community_reports
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "learnerScope" "LearnerType" NOT NULL DEFAULT 'university';
CREATE INDEX IF NOT EXISTS "communities_learnerScope_idx" ON "communities"("learnerScope");

ALTER TABLE "community_reports"
  ADD COLUMN IF NOT EXISTS "learnerScope" "LearnerType" NOT NULL DEFAULT 'university',
  ADD COLUMN IF NOT EXISTS "priority" "ModerationPriority" NOT NULL DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS "community_reports_status_priority_createdAt_idx" ON "community_reports"("status", "priority", "createdAt" DESC);

-- CreateTable shs_programmes
CREATE TABLE IF NOT EXISTS "shs_programmes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(300),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shs_programmes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "shs_programmes_slug_key" ON "shs_programmes"("slug");
CREATE INDEX IF NOT EXISTS "shs_programmes_active_sortOrder_idx" ON "shs_programmes"("active", "sortOrder");

-- CreateTable subject_catalogue
CREATE TABLE IF NOT EXISTS "subject_catalogue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(100) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "code" VARCHAR(24),
  "isCore" BOOLEAN NOT NULL DEFAULT false,
  "programmeSlugs" JSONB NOT NULL DEFAULT '[]',
  "syllabusVersion" VARCHAR(60) NOT NULL DEFAULT 'NaCCA-2024',
  "sourceCitation" VARCHAR(300) NOT NULL DEFAULT 'NaCCA / GES Senior High School Curriculum Framework (nacca.gov.gh)',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subject_catalogue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "subject_catalogue_slug_key" ON "subject_catalogue"("slug");
CREATE INDEX IF NOT EXISTS "subject_catalogue_active_isCore_name_idx" ON "subject_catalogue"("active", "isCore", "name");

-- AlterTable courses
ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "type" "CourseItemType" NOT NULL DEFAULT 'course',
  ADD COLUMN IF NOT EXISTS "catalogueSubjectId" UUID;
DO $$ BEGIN
  ALTER TABLE "courses" ADD CONSTRAINT "courses_catalogueSubjectId_fkey" FOREIGN KEY ("catalogueSubjectId") REFERENCES "subject_catalogue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable subject_topics
CREATE TABLE IF NOT EXISTS "subject_topics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subjectId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "schoolYear" VARCHAR(20),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subject_topics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "subject_topics_subjectId_title_key" ON "subject_topics"("subjectId", "title");
CREATE INDEX IF NOT EXISTS "subject_topics_subjectId_active_sortOrder_idx" ON "subject_topics"("subjectId", "active", "sortOrder");
DO $$ BEGIN
  ALTER TABLE "subject_topics" ADD CONSTRAINT "subject_topics_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subject_catalogue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable guardian_consents
CREATE TABLE IF NOT EXISTS "guardian_consents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "guardianEmail" CITEXT,
  "guardianPhone" VARCHAR(32),
  "tokenHash" TEXT NOT NULL,
  "status" "GuardianConsentStatus" NOT NULL DEFAULT 'pending',
  "consentedAt" TIMESTAMPTZ(3),
  "withdrawnAt" TIMESTAMPTZ(3),
  "ip" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardian_consents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_consents_tokenHash_key" ON "guardian_consents"("tokenHash");
CREATE INDEX IF NOT EXISTS "guardian_consents_userId_createdAt_idx" ON "guardian_consents"("userId", "createdAt" DESC);
DO $$ BEGIN
  ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable wassce_mock_attempts
CREATE TABLE IF NOT EXISTS "wassce_mock_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "format" "WassceMockFormat" NOT NULL DEFAULT 'objective',
  "topicsJson" JSONB NOT NULL DEFAULT '[]',
  "questionsJson" JSONB NOT NULL DEFAULT '[]',
  "answersJson" JSONB NOT NULL DEFAULT '{}',
  "score" INTEGER,
  "total" INTEGER NOT NULL DEFAULT 0,
  "weakTopicsJson" JSONB NOT NULL DEFAULT '[]',
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wassce_mock_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "wassce_mock_attempts_userId_courseId_createdAt_idx" ON "wassce_mock_attempts"("userId", "courseId", "createdAt" DESC);
DO $$ BEGIN
  ALTER TABLE "wassce_mock_attempts" ADD CONSTRAINT "wassce_mock_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "wassce_mock_attempts" ADD CONSTRAINT "wassce_mock_attempts_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable shs_moderation_flags
CREATE TABLE IF NOT EXISTS "shs_moderation_flags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "source" VARCHAR(40) NOT NULL,
  "direction" VARCHAR(20) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "excerpt" VARCHAR(500) NOT NULL,
  "reviewed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shs_moderation_flags_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "shs_moderation_flags_reviewed_createdAt_idx" ON "shs_moderation_flags"("reviewed", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "shs_moderation_flags_userId_idx" ON "shs_moderation_flags"("userId");
DO $$ BEGIN
  ALTER TABLE "shs_moderation_flags" ADD CONSTRAINT "shs_moderation_flags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

