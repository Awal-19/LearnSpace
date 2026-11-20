import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const cursorQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listPostsQuerySchema = cursorQuerySchema.extend({
  filter: z.enum(['all', 'unanswered', 'my_questions', 'my_answers', 'resources']).default('all'),
  topic: z.string().trim().max(60).optional(),
  q: z.string().trim().max(120).optional(),
});

export const switchCourseCommunitySchema = z
  .object({
    scope: z.enum(['university', 'global']).optional(),
    communityId: z.string().uuid().optional(),
  })
  .strict();

export const createPostSchema = z
  .object({
    type: z.enum(['question', 'discussion', 'resource', 'announcement']).default('question'),
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
    body: z.string().trim().min(5, 'Details must be at least 5 characters').max(10_000),
    topicTag: z.string().trim().max(60).nullable().optional(),
    isAnonymous: z.boolean().default(false),
    aiAttempt: z.string().trim().max(6000).nullable().optional(),
    attachmentIds: z.array(z.string().uuid()).max(4).default([]),
  })
  .strict();

export const updatePostSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    body: z.string().trim().min(5).max(10_000).optional(),
    topicTag: z.string().trim().max(60).nullable().optional(),
    status: z.enum(['unanswered', 'answered', 'resolved']).optional(),
  })
  .strict();

export const createReplySchema = z
  .object({
    body: z.string().trim().min(1, 'Reply cannot be empty').max(6000),
    parentReplyId: z.string().uuid().nullable().optional(),
    isAnonymous: z.boolean().default(false),
    isAiGenerated: z.boolean().default(false),
    attachmentIds: z.array(z.string().uuid()).max(3).default([]),
  })
  .strict();

export const updateReplySchema = z
  .object({
    body: z.string().trim().min(1).max(6000),
  })
  .strict();

export const askAwalFirstSchema = z
  .object({
    courseId: z.string().uuid().optional(),
    communityId: z.string().uuid().optional(),
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().min(3).max(4000),
    mode: z.enum(['ask_first', 'draft_helper']).default('ask_first'),
  })
  .strict();

export const voteSchema = z
  .object({
    targetType: z.enum(['post', 'reply', 'resource']),
    targetId: z.string().uuid(),
  })
  .strict();

export const updateCommunityProfileSchema = z
  .object({
    hideStats: z.boolean().optional(),
    showInClassmates: z.boolean().optional(),
  })
  .strict();

export const createGroupSchema = z
  .object({
    communityId: z.string().uuid(),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).nullable().optional(),
    visibility: z.enum(['public_course', 'invite_only']).default('public_course'),
  })
  .strict();

export const joinGroupByCodeSchema = z
  .object({
    inviteCode: z.string().trim().min(4).max(32),
  })
  .strict();

export const sendGroupMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
    replyToId: z.string().uuid().nullable().optional(),
    clientMessageId: z.string().trim().max(80).optional(),
    attachmentIds: z.array(z.string().uuid()).max(3).default([]),
  })
  .strict();

export const updateGroupMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

export const createGroupTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(180),
    dueAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export const startGroupFocusSchema = z
  .object({
    title: z.string().trim().min(2).max(120).default('Group Focus Session'),
    durationMinutes: z.coerce.number().int().min(5).max(120).default(25),
  })
  .strict();

export const shareResourceSchema = z
  .object({
    communityId: z.string().uuid(),
    groupId: z.string().uuid().nullable().optional(),
    sourceType: z.enum(['note_copy', 'document', 'link', 'recommendation']),
    sourceId: z.string().uuid().optional(),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(600).nullable().optional(),
    url: z.string().trim().url().max(1200).nullable().optional(),
    rightConfirmed: z.literal(true, {
      errorMap: () => ({ message: 'You must confirm you have the right to share this material.' }),
    }),
  })
  .strict();

export const reportContentSchema = z
  .object({
    targetType: z.enum(['post', 'reply', 'message', 'resource', 'user']),
    targetId: z.string().uuid(),
    reason: z.string().trim().min(5, 'Please describe the issue').max(600),
  })
  .strict();

export const blockUserSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();

export const moderateCommunityContentSchema = z
  .object({
    action: z.enum(['pin', 'unpin', 'hide', 'unhide', 'delete', 'mute_user']),
    targetType: z.enum(['post', 'reply', 'resource', 'user']),
    targetId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
    muteHours: z.coerce.number().int().min(1).max(168).default(24),
  })
  .strict();

export const updateNotifPrefsSchema = z
  .object({
    inAppAnswer: z.boolean().optional(),
    inAppAccepted: z.boolean().optional(),
    inAppReply: z.boolean().optional(),
    inAppGroupInvite: z.boolean().optional(),
    inAppMention: z.boolean().optional(),
    emailAnswer: z.boolean().optional(),
    emailAccepted: z.boolean().optional(),
    emailReply: z.boolean().optional(),
    emailGroupInvite: z.boolean().optional(),
    emailMention: z.boolean().optional(),
    emailDailyDigest: z.boolean().optional(),
  })
  .strict();
