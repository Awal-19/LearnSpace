-- Ensure Google OAuth users are marked verified and revoke any stale sessions
-- belonging to unverified non-Google accounts so they verify at next login.

UPDATE "users"
SET "emailVerified" = true
WHERE "emailVerified" = false
  AND EXISTS (
    SELECT 1
    FROM "auth_identities" ai
    WHERE ai."userId" = "users"."id"
      AND ai."provider" = 'google'
  );

UPDATE "refresh_tokens"
SET "revokedAt" = NOW()
WHERE "revokedAt" IS NULL
  AND "userId" IN (
    SELECT "id" FROM "users" WHERE "emailVerified" = false
  );

