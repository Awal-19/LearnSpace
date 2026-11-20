-- AlterEnum
ALTER TYPE "UsageFeature" ADD VALUE IF NOT EXISTS 'course_resource_search';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RecommendationCategory" AS ENUM ('book', 'past_question', 'video', 'notes');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecommendationAccessType" AS ENUM ('free', 'preview', 'borrow', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecommendationStatus" AS ENUM ('active', 'saved', 'hidden', 'dead');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecommendationJobTrigger" AS ENUM ('auto_create', 'refresh', 'find_more', 'link_recheck');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecommendationJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecommendationReportStatus" AS ENUM ('open', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable courses
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "useResourcesInAssistant" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable app_settings
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "featureCourseRecommendations" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "dailyCourseSearchLimit" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "monthlySearchCostCapUsd" DOUBLE PRECISION NOT NULL DEFAULT 25.0,
  ADD COLUMN IF NOT EXISTS "recommendationAllowDomainsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "recommendationBlockDomainsJson" JSONB NOT NULL DEFAULT '[]';

-- CreateTable course_recommendations
CREATE TABLE IF NOT EXISTS "course_recommendations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "courseId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "cacheKey" VARCHAR(200),
  "category" "RecommendationCategory" NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "authors" VARCHAR(240),
  "edition" VARCHAR(80),
  "year" INTEGER,
  "institutionOrBody" VARCHAR(180),
  "paperType" VARCHAR(60),
  "topicsJson" JSONB NOT NULL DEFAULT '[]',
  "url" VARCHAR(1200) NOT NULL,
  "sourceDomain" VARCHAR(255) NOT NULL,
  "accessType" "RecommendationAccessType" NOT NULL DEFAULT 'free',
  "reason" VARCHAR(600) NOT NULL,
  "status" "RecommendationStatus" NOT NULL DEFAULT 'active',
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "lastCheckedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable course_resources
CREATE TABLE IF NOT EXISTS "course_resources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "courseId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "recommendationId" UUID,
  "category" "RecommendationCategory" NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "authors" VARCHAR(240),
  "year" INTEGER,
  "url" VARCHAR(1200) NOT NULL,
  "sourceDomain" VARCHAR(255) NOT NULL,
  "accessType" "RecommendationAccessType" NOT NULL DEFAULT 'free',
  "reason" VARCHAR(600),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable recommendation_jobs
CREATE TABLE IF NOT EXISTS "recommendation_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "courseId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "trigger" "RecommendationJobTrigger" NOT NULL DEFAULT 'auto_create',
  "status" "RecommendationJobStatus" NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "searchesRun" INTEGER NOT NULL DEFAULT 0,
  "resultsCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" VARCHAR(80),
  "errorMessage" VARCHAR(500),
  "startedAt" TIMESTAMPTZ(3),
  "finishedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recommendation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable recommendation_cache
CREATE TABLE IF NOT EXISTS "recommendation_cache" (
  "cacheKey" VARCHAR(200) NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recommendation_cache_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateTable recommendation_reports
CREATE TABLE IF NOT EXISTS "recommendation_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recommendationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "url" VARCHAR(1200) NOT NULL,
  "sourceDomain" VARCHAR(255) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "status" "RecommendationReportStatus" NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recommendation_reports_pkey" PRIMARY KEY ("id")
);

-- Indexes & Foreign Keys
CREATE UNIQUE INDEX IF NOT EXISTS "course_recommendations_courseId_url_key" ON "course_recommendations"("courseId", "url");
CREATE INDEX IF NOT EXISTS "course_recommendations_courseId_category_hidden_status_idx" ON "course_recommendations"("courseId", "category", "hidden", "status");
CREATE INDEX IF NOT EXISTS "course_recommendations_userId_createdAt_idx" ON "course_recommendations"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "course_recommendations_status_lastCheckedAt_idx" ON "course_recommendations"("status", "lastCheckedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "course_resources_courseId_url_key" ON "course_resources"("courseId", "url");
CREATE INDEX IF NOT EXISTS "course_resources_courseId_userId_idx" ON "course_resources"("courseId", "userId");

CREATE INDEX IF NOT EXISTS "recommendation_jobs_status_createdAt_idx" ON "recommendation_jobs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "recommendation_jobs_courseId_createdAt_idx" ON "recommendation_jobs"("courseId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "recommendation_jobs_userId_createdAt_idx" ON "recommendation_jobs"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "recommendation_cache_expiresAt_idx" ON "recommendation_cache"("expiresAt");

CREATE INDEX IF NOT EXISTS "recommendation_reports_status_createdAt_idx" ON "recommendation_reports"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "recommendation_reports_recommendationId_idx" ON "recommendation_reports"("recommendationId");

DO $$ BEGIN
  ALTER TABLE "course_recommendations" ADD CONSTRAINT "course_recommendations_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_recommendations" ADD CONSTRAINT "course_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "course_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recommendation_jobs" ADD CONSTRAINT "recommendation_jobs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recommendation_jobs" ADD CONSTRAINT "recommendation_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recommendation_reports" ADD CONSTRAINT "recommendation_reports_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "course_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recommendation_reports" ADD CONSTRAINT "recommendation_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

