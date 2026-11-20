-- AlterEnum
ALTER TYPE "UsageFeature" ADD VALUE IF NOT EXISTS 'community_ai';

-- CreateEnums
DO $$ BEGIN CREATE TYPE "CommunityMemberRole" AS ENUM ('member', 'moderator', 'course_rep'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommunityPostType" AS ENUM ('question', 'discussion', 'resource', 'announcement'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommunityPostStatus" AS ENUM ('unanswered', 'answered', 'resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommunityVoteTargetType" AS ENUM ('post', 'reply', 'resource'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StudyGroupVisibility" AS ENUM ('public_course', 'invite_only'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StudyGroupMemberRole" AS ENUM ('owner', 'moderator', 'member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SharedResourceSourceType" AS ENUM ('note_copy', 'document', 'link', 'recommendation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommunityReportTargetType" AS ENUM ('post', 'reply', 'message', 'resource', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommunityReportStatus" AS ENUM ('open', 'dismissed', 'resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable app_settings
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "featureCommunity" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "communityBannedWordsJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "communityExamNoticeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "communityExamNoticeMessage" VARCHAR(500) NOT NULL DEFAULT 'Exam period notice: remember academic integrity rules—no cheating or sharing live exam answers.',
  ADD COLUMN IF NOT EXISTS "communityPausedCourseSlugsJson" JSONB NOT NULL DEFAULT '[]';

-- CreateTable communities
CREATE TABLE IF NOT EXISTS "communities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(200) NOT NULL,
  "normalizedName" VARCHAR(120) NOT NULL,
  "displayName" VARCHAR(120) NOT NULL,
  "universityKey" VARCHAR(120),
  "universityName" VARCHAR(120),
  "isPaused" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "communities_slug_key" ON "communities"("slug");
CREATE INDEX IF NOT EXISTS "communities_normalizedName_idx" ON "communities"("normalizedName");
CREATE INDEX IF NOT EXISTS "communities_universityKey_idx" ON "communities"("universityKey");

-- AlterTable courses
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "communityId" UUID;
DO $$ BEGIN
  ALTER TABLE "courses" ADD CONSTRAINT "courses_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable community_members
CREATE TABLE IF NOT EXISTS "community_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "communityId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "CommunityMemberRole" NOT NULL DEFAULT 'member',
  "mutedUntil" TIMESTAMPTZ(3),
  "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "community_members_communityId_userId_key" ON "community_members"("communityId", "userId");
CREATE INDEX IF NOT EXISTS "community_members_userId_idx" ON "community_members"("userId");

-- CreateTable user_community_profiles
CREATE TABLE IF NOT EXISTS "user_community_profiles" (
  "userId" UUID NOT NULL,
  "helpedCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "hideStats" BOOLEAN NOT NULL DEFAULT false,
  "showInClassmates" BOOLEAN NOT NULL DEFAULT true,
  "rulesAcceptedAt" TIMESTAMPTZ(3),
  "mutedUntil" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_community_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable community_posts
CREATE TABLE IF NOT EXISTS "community_posts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "communityId" UUID NOT NULL,
  "authorId" UUID,
  "type" "CommunityPostType" NOT NULL DEFAULT 'question',
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "topicTag" VARCHAR(60),
  "status" "CommunityPostStatus" NOT NULL DEFAULT 'unanswered',
  "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "acceptedReplyId" UUID,
  "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "replyCount" INTEGER NOT NULL DEFAULT 0,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "flaggedByFilter" BOOLEAN NOT NULL DEFAULT false,
  "flagReason" VARCHAR(200),
  "aiAttempt" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "community_posts_communityId_hidden_isPinned_createdAt_idx" ON "community_posts"("communityId", "hidden", "isPinned" DESC, "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "community_posts_communityId_status_createdAt_idx" ON "community_posts"("communityId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "community_posts_authorId_idx" ON "community_posts"("authorId");

-- CreateTable community_replies
CREATE TABLE IF NOT EXISTS "community_replies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "postId" UUID NOT NULL,
  "parentReplyId" UUID,
  "authorId" UUID,
  "body" TEXT NOT NULL,
  "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "flaggedByFilter" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_replies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "community_replies_postId_hidden_createdAt_idx" ON "community_replies"("postId", "hidden", "createdAt");
CREATE INDEX IF NOT EXISTS "community_replies_authorId_idx" ON "community_replies"("authorId");

-- CreateTable community_votes
CREATE TABLE IF NOT EXISTS "community_votes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "targetType" "CommunityVoteTargetType" NOT NULL,
  "targetId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_votes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "community_votes_userId_targetType_targetId_key" ON "community_votes"("userId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "community_votes_targetType_targetId_idx" ON "community_votes"("targetType", "targetId");

-- CreateTable study_groups
CREATE TABLE IF NOT EXISTS "study_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "communityId" UUID NOT NULL,
  "creatorId" UUID,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500),
  "visibility" "StudyGroupVisibility" NOT NULL DEFAULT 'public_course',
  "inviteCode" VARCHAR(32) NOT NULL,
  "pinnedMessageId" UUID,
  "activeFocusTitle" VARCHAR(120),
  "activeFocusEndsAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "study_groups_inviteCode_key" ON "study_groups"("inviteCode");
CREATE INDEX IF NOT EXISTS "study_groups_communityId_visibility_createdAt_idx" ON "study_groups"("communityId", "visibility", "createdAt" DESC);

-- CreateTable study_group_members
CREATE TABLE IF NOT EXISTS "study_group_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "StudyGroupMemberRole" NOT NULL DEFAULT 'member',
  "muted" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_group_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "study_group_members_groupId_userId_key" ON "study_group_members"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "study_group_members_userId_idx" ON "study_group_members"("userId");

-- CreateTable study_group_messages
CREATE TABLE IF NOT EXISTS "study_group_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL,
  "authorId" UUID,
  "replyToId" UUID,
  "clientMessageId" VARCHAR(80),
  "body" TEXT NOT NULL,
  "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "linkPreviewJson" JSONB,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "flaggedByFilter" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_group_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "study_group_messages_groupId_clientMessageId_key" ON "study_group_messages"("groupId", "clientMessageId");
CREATE INDEX IF NOT EXISTS "study_group_messages_groupId_createdAt_idx" ON "study_group_messages"("groupId", "createdAt" DESC);

-- CreateTable community_attachments
CREATE TABLE IF NOT EXISTS "community_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "postId" UUID,
  "replyId" UUID,
  "messageId" UUID,
  "originalName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(120) NOT NULL,
  "kind" "AttachmentKind" NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" VARCHAR(255) NOT NULL,
  "storageUrl" VARCHAR(1024) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "community_attachments_postId_idx" ON "community_attachments"("postId");
CREATE INDEX IF NOT EXISTS "community_attachments_replyId_idx" ON "community_attachments"("replyId");
CREATE INDEX IF NOT EXISTS "community_attachments_messageId_idx" ON "community_attachments"("messageId");
CREATE INDEX IF NOT EXISTS "community_attachments_userId_idx" ON "community_attachments"("userId");

-- CreateTable study_group_tasks
CREATE TABLE IF NOT EXISTS "study_group_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "groupId" UUID NOT NULL,
  "creatorId" UUID,
  "title" VARCHAR(180) NOT NULL,
  "dueAt" TIMESTAMPTZ(3),
  "done" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "study_group_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "study_group_tasks_groupId_done_createdAt_idx" ON "study_group_tasks"("groupId", "done", "createdAt");

-- CreateTable shared_resources
CREATE TABLE IF NOT EXISTS "shared_resources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "communityId" UUID NOT NULL,
  "groupId" UUID,
  "authorId" UUID,
  "sourceType" "SharedResourceSourceType" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(600),
  "bodySnapshot" TEXT,
  "url" VARCHAR(1200),
  "sourceDomain" VARCHAR(255),
  "attachmentKey" VARCHAR(255),
  "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shared_resources_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "shared_resources_communityId_hidden_createdAt_idx" ON "shared_resources"("communityId", "hidden", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "shared_resources_groupId_hidden_createdAt_idx" ON "shared_resources"("groupId", "hidden", "createdAt" DESC);

-- CreateTable community_reports
CREATE TABLE IF NOT EXISTS "community_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reporterId" UUID NOT NULL,
  "targetType" "CommunityReportTargetType" NOT NULL,
  "targetId" UUID NOT NULL,
  "targetUserId" UUID,
  "reason" VARCHAR(600) NOT NULL,
  "status" "CommunityReportStatus" NOT NULL DEFAULT 'open',
  "reviewNote" VARCHAR(500),
  "reviewedById" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "community_reports_status_createdAt_idx" ON "community_reports"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "community_reports_targetType_targetId_idx" ON "community_reports"("targetType", "targetId");

-- CreateTable user_blocks
CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "blockerId" UUID NOT NULL,
  "blockedId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_blocks_blockerId_blockedId_key" ON "user_blocks"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");

-- CreateTable moderation_actions
CREATE TABLE IF NOT EXISTS "moderation_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "communityId" UUID,
  "actorId" UUID NOT NULL,
  "targetUserId" UUID,
  "targetType" VARCHAR(40) NOT NULL,
  "targetId" UUID NOT NULL,
  "action" VARCHAR(60) NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "moderation_actions_communityId_createdAt_idx" ON "moderation_actions"("communityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "moderation_actions_createdAt_idx" ON "moderation_actions"("createdAt" DESC);

-- CreateTable community_notification_preferences
CREATE TABLE IF NOT EXISTS "community_notification_preferences" (
  "userId" UUID NOT NULL,
  "inAppAnswer" BOOLEAN NOT NULL DEFAULT true,
  "inAppAccepted" BOOLEAN NOT NULL DEFAULT true,
  "inAppReply" BOOLEAN NOT NULL DEFAULT true,
  "inAppGroupInvite" BOOLEAN NOT NULL DEFAULT true,
  "inAppMention" BOOLEAN NOT NULL DEFAULT true,
  "emailAnswer" BOOLEAN NOT NULL DEFAULT false,
  "emailAccepted" BOOLEAN NOT NULL DEFAULT true,
  "emailReply" BOOLEAN NOT NULL DEFAULT false,
  "emailGroupInvite" BOOLEAN NOT NULL DEFAULT true,
  "emailMention" BOOLEAN NOT NULL DEFAULT true,
  "emailDailyDigest" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- Foreign Keys
DO $$ BEGIN ALTER TABLE "community_members" ADD CONSTRAINT "community_members_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_members" ADD CONSTRAINT "community_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "user_community_profiles" ADD CONSTRAINT "user_community_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_parentReplyId_fkey" FOREIGN KEY ("parentReplyId") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_attachments" ADD CONSTRAINT "community_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_attachments" ADD CONSTRAINT "community_attachments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_attachments" ADD CONSTRAINT "community_attachments_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "community_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_attachments" ADD CONSTRAINT "community_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "study_group_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_group_messages" ADD CONSTRAINT "study_group_messages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_group_messages" ADD CONSTRAINT "study_group_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_group_messages" ADD CONSTRAINT "study_group_messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "study_group_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_group_tasks" ADD CONSTRAINT "study_group_tasks_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "study_group_tasks" ADD CONSTRAINT "study_group_tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "shared_resources" ADD CONSTRAINT "shared_resources_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "shared_resources" ADD CONSTRAINT "shared_resources_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "shared_resources" ADD CONSTRAINT "shared_resources_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "community_notification_preferences" ADD CONSTRAINT "community_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

