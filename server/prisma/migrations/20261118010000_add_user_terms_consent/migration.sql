-- AlterTable users: store explicit Terms and Conditions and Privacy Policy acceptance metadata
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "termsVersion" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "privacyPolicyVersion" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "privacyPolicyAcceptedAt" TIMESTAMPTZ(3);

