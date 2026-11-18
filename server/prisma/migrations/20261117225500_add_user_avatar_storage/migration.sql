-- AlterTable users: store optional illustrated avatar creator configuration
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarConfig" JSONB;

-- CreateTable user_avatars: persistent database storage for user profile avatars when Cloudinary is not configured
CREATE TABLE IF NOT EXISTS "user_avatars" (
    "userId" UUID NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "data" BYTEA NOT NULL,
    "etag" VARCHAR(64) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "user_avatars"
DROP CONSTRAINT IF EXISTS "user_avatars_userId_fkey";

ALTER TABLE "user_avatars"
ADD CONSTRAINT "user_avatars_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

