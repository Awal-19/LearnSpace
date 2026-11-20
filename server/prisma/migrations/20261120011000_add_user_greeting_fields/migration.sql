ALTER TABLE "users"
  ADD COLUMN "firstLoginAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastLoginAt" TIMESTAMPTZ(3),
  ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing verified accounts as returning users with onboarding completed.
UPDATE "users"
SET
  "firstLoginAt" = COALESCE("lastActiveAt", "createdAt"),
  "lastLoginAt" = COALESCE("lastActiveAt", "createdAt"),
  "onboardingCompleted" = true
WHERE "emailVerified" = true;

