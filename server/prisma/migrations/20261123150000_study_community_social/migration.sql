-- Add CommunityBookmark and CommunityFollow tables for Study Community social features
CREATE TABLE IF NOT EXISTS "community_bookmarks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "postId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_bookmarks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_bookmarks_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_bookmarks_userId_postId_key"
  ON "community_bookmarks"("userId", "postId");
CREATE INDEX IF NOT EXISTS "community_bookmarks_userId_createdAt_idx"
  ON "community_bookmarks"("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "community_follows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "followerId" UUID NOT NULL,
  "followingId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_follows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "community_follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_follows_followerId_followingId_key"
  ON "community_follows"("followerId", "followingId");
CREATE INDEX IF NOT EXISTS "community_follows_followingId_idx"
  ON "community_follows"("followingId");

