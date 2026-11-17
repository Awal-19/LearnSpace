-- AlterEnum
ALTER TYPE "EmailTokenType" ADD VALUE 'admin_2fa';

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'admin', 'super_admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('all', 'programme', 'level');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('bug', 'suggestion', 'abuse');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('new', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('open', 'dismissed', 'warned', 'suspended');

-- CreateEnum
CREATE TYPE "UsageFeature" AS ENUM ('chat', 'document_answer', 'question_gen', 'summary', 'flashcards', 'quiz');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('success', 'error');

-- CreateEnum
CREATE TYPE "LoginMethod" AS ENUM ('email', 'google');

-- CreateEnum
CREATE TYPE "AdminExportKind" AS ENUM ('users', 'usage', 'ai_costs', 'feedback', 'overview_pdf');

-- CreateEnum
CREATE TYPE "AdminExportStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'student',
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "suspendedAt" TIMESTAMPTZ(3),
ADD COLUMN "suspendedReason" VARCHAR(500),
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastActiveAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt" DESC);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorId" UUID NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "targetType" VARCHAR(80) NOT NULL,
    "targetId" VARCHAR(120),
    "reason" VARCHAR(1000),
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "ip" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'global',
    "appName" VARCHAR(100) NOT NULL DEFAULT 'LearnSpace',
    "supportEmail" VARCHAR(200) NOT NULL DEFAULT 'support@learnspace.local',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" VARCHAR(500) NOT NULL DEFAULT 'LearnSpace is undergoing scheduled maintenance. Please check back shortly.',
    "featureChat" BOOLEAN NOT NULL DEFAULT true,
    "featureUploads" BOOLEAN NOT NULL DEFAULT true,
    "featureDocuments" BOOLEAN NOT NULL DEFAULT true,
    "featureSignups" BOOLEAN NOT NULL DEFAULT true,
    "dailyMessageLimit" INTEGER NOT NULL DEFAULT 100,
    "maxUploadBytes" INTEGER NOT NULL DEFAULT 20971520,
    "dailyUploadQuota" INTEGER NOT NULL DEFAULT 50,
    "dailyCostAlertUsd" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "allowedFileTypesJson" JSONB NOT NULL DEFAULT '["pdf","docx","pptx","txt","csv","jpg","png","webp","heic"]',
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "authorId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'all',
    "audienceValue" VARCHAR(120),
    "scheduledAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'new',
    "adminNotes" TEXT,
    "repliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flagged_contents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporterId" UUID,
    "targetUserId" UUID NOT NULL,
    "conversationId" UUID,
    "messageId" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "status" "FlagStatus" NOT NULL DEFAULT 'open',
    "reviewedById" UUID,
    "reviewNote" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flagged_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "feature" "UsageFeature" NOT NULL,
    "model" VARCHAR(120),
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" "UsageStatus" NOT NULL DEFAULT 'success',
    "errorCode" VARCHAR(80),
    "route" VARCHAR(160),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "email" VARCHAR(255) NOT NULL,
    "method" "LoginMethod" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "suspicious" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route" VARCHAR(200) NOT NULL,
    "method" VARCHAR(12) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "message" TEXT NOT NULL,
    "userId" UUID,
    "requestId" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_export_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adminId" UUID NOT NULL,
    "kind" "AdminExportKind" NOT NULL,
    "filtersJson" JSONB NOT NULL DEFAULT '{}',
    "status" "AdminExportStatus" NOT NULL DEFAULT 'queued',
    "filePath" TEXT,
    "fileName" VARCHAR(200),
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "admin_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt" DESC);
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt" DESC);
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);
CREATE INDEX "announcements_active_scheduledAt_idx" ON "announcements"("active", "scheduledAt");
CREATE INDEX "feedback_reports_status_createdAt_idx" ON "feedback_reports"("status", "createdAt" DESC);
CREATE INDEX "feedback_reports_userId_createdAt_idx" ON "feedback_reports"("userId", "createdAt" DESC);
CREATE INDEX "flagged_contents_status_createdAt_idx" ON "flagged_contents"("status", "createdAt" DESC);
CREATE INDEX "flagged_contents_targetUserId_idx" ON "flagged_contents"("targetUserId");
CREATE INDEX "usage_events_createdAt_idx" ON "usage_events"("createdAt" DESC);
CREATE INDEX "usage_events_userId_createdAt_idx" ON "usage_events"("userId", "createdAt" DESC);
CREATE INDEX "usage_events_feature_createdAt_idx" ON "usage_events"("feature", "createdAt" DESC);
CREATE INDEX "activity_events_userId_createdAt_idx" ON "activity_events"("userId", "createdAt" DESC);
CREATE INDEX "activity_events_action_createdAt_idx" ON "activity_events"("action", "createdAt" DESC);
CREATE INDEX "activity_events_createdAt_idx" ON "activity_events"("createdAt" DESC);
CREATE INDEX "login_history_createdAt_idx" ON "login_history"("createdAt" DESC);
CREATE INDEX "login_history_userId_createdAt_idx" ON "login_history"("userId", "createdAt" DESC);
CREATE INDEX "login_history_suspicious_createdAt_idx" ON "login_history"("suspicious", "createdAt" DESC);
CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt" DESC);
CREATE INDEX "admin_export_jobs_adminId_createdAt_idx" ON "admin_export_jobs"("adminId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flagged_contents" ADD CONSTRAINT "flagged_contents_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "flagged_contents" ADD CONSTRAINT "flagged_contents_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

