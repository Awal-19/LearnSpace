-- CreateTable otp_codes
CREATE TABLE IF NOT EXISTS "otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "otp_codes_userId_purpose_createdAt_idx" ON "otp_codes"("userId", "purpose", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "otp_codes_expiresAt_idx" ON "otp_codes"("expiresAt");

ALTER TABLE "otp_codes"
DROP CONSTRAINT IF EXISTS "otp_codes_userId_fkey";

ALTER TABLE "otp_codes"
ADD CONSTRAINT "otp_codes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mark existing pre-OTP users as verified so they are not unexpectedly locked out
UPDATE "users" SET "emailVerified" = true WHERE "emailVerified" = false;

