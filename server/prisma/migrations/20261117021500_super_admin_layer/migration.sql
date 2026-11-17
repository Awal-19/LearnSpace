-- AlterEnum
ALTER TYPE "EmailTokenType" ADD VALUE IF NOT EXISTS 'super_step_up';

-- AlterTable users
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "adminPermissionsJson" JSONB NOT NULL DEFAULT '{"can_manage_users":true,"can_moderate_content":true,"can_view_ai_usage":true,"can_send_announcements":true,"can_export_data":true}';

-- AlterTable audit_logs
ALTER TABLE "audit_logs"
ADD COLUMN IF NOT EXISTS "beforeJson" JSONB,
ADD COLUMN IF NOT EXISTS "afterJson" JSONB,
ADD COLUMN IF NOT EXISTS "userAgent" VARCHAR(400);

-- AlterTable app_settings
ALTER TABLE "app_settings"
ADD COLUMN IF NOT EXISTS "featureGoogleLogin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "maintenanceAllowlistJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "monthlyCostCapUsd" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
ADD COLUMN IF NOT EXISTS "sessionLifetimeMinutes" INTEGER NOT NULL DEFAULT 10080,
ADD COLUMN IF NOT EXISTS "minPasswordLength" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN IF NOT EXISTS "requireEmailVerification" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "requireAdminOtp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "lockoutMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN IF NOT EXISTS "aiModel" VARCHAR(120) NOT NULL DEFAULT 'z-ai/glm-5.3-flash',
ADD COLUMN IF NOT EXISTS "aiSystemPromptVersion" VARCHAR(40) NOT NULL DEFAULT 'v1',
ADD COLUMN IF NOT EXISTS "aiMaxTokens" INTEGER NOT NULL DEFAULT 2048,
ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable app_settings_versions
CREATE TABLE IF NOT EXISTS "app_settings_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "app_settings_versions_version_idx" ON "app_settings_versions"("version" DESC);

-- CreateTable admin_invites
CREATE TABLE IF NOT EXISTS "admin_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'admin',
    "permissionsJson" JSONB NOT NULL DEFAULT '{}',
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_invites_tokenHash_key" ON "admin_invites"("tokenHash");
CREATE INDEX IF NOT EXISTS "admin_invites_email_createdAt_idx" ON "admin_invites"("email", "createdAt" DESC);

-- Enforce append-only immutability on audit_logs at the database level
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON "audit_logs";
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

