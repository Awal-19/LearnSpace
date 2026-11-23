import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { safeContentDispositionFilename } from '../../lib/http';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import { MAX_DOC_BYTES } from '../ai/attachments.service';
import type { createCommunityGroupsService } from './community.groups.service';
import type { CommunityRealtimeHub } from './community.realtime';
import {
  askAwalFirstSchema,
  blockUserSchema,
  createGroupSchema,
  createGroupTaskSchema,
  createPostSchema,
  createReplySchema,
  cursorQuerySchema,
  joinGroupByCodeSchema,
  listFeedQuerySchema,
  listPostsQuerySchema,
  moderateCommunityContentSchema,
  reportContentSchema,
  searchQuerySchema,
  sendGroupMessageSchema,
  shareResourceSchema,
  startGroupFocusSchema,
  switchCourseCommunitySchema,
  updateCommunityProfileSchema,
  updateGroupMessageSchema,
  updateNotifPrefsSchema,
  updatePostSchema,
  uuidSchema,
  voteSchema,
} from './community.schemas';
import type { createCommunityService } from './community.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES, files: 1 },
});

const handleMulter: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('PAYLOAD_TOO_LARGE', 'File must be 20 MB or smaller.'));
      return;
    }
    next(new AppError('VALIDATION_ERROR', 'Invalid file upload.'));
  });
};

function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export function communityRouter(deps: {
  core: ReturnType<typeof createCommunityService>;
  groups: ReturnType<typeof createCommunityGroupsService>;
  realtime: CommunityRealtimeHub;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}): Router {
  const { core, groups, realtime, env, isEmailVerified } = deps;
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  const postLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 15,
    prefix: 'comm_post',
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test' && process.env.ENABLE_TEST_RATE_LIMIT !== '1',
  });

  const chatLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 40,
    prefix: 'comm_chat',
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test' && process.env.ENABLE_TEST_RATE_LIMIT !== '1',
  });

  const aiLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 12,
    prefix: 'comm_ai',
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test' && process.env.ENABLE_TEST_RATE_LIMIT !== '1',
  });

  // Home & Profile
  router.get(
    '/community/home',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await core.getHome(req.user!.id));
    }),
  );

  router.get(
    '/community/dashboard',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await core.hub.getDashboard(req.user!.id));
    }),
  );

  router.get(
    '/community/feed',
    auth,
    verified,
    validateQuery(listFeedQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await core.hub.listFeed(
          req.user!.id,
          req.query as unknown as z.infer<typeof listFeedQuerySchema>,
        ),
      );
    }),
  );

  router.get(
    '/community/discover',
    auth,
    verified,
    validateQuery(searchQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof searchQuerySchema>;
      res.json(await core.hub.discover(req.user!.id, query.q));
    }),
  );

  router.get(
    '/community/groups',
    auth,
    verified,
    validateQuery(searchQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await core.hub.listGroupsHub(
          req.user!.id,
          req.query as unknown as z.infer<typeof searchQuerySchema>,
        ),
      );
    }),
  );

  router.get(
    '/community/leaderboard',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await core.hub.getLeaderboard(req.user!.id));
    }),
  );

  router.post(
    '/community/courses/:communityId/join',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      res.json(await core.hub.joinCommunity(req.user!.id, communityId));
    }),
  );

  router.post(
    '/community/users/:targetUserId/follow',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const targetUserId = parseUuid(req.params.targetUserId, 'User');
      res.json(await core.hub.toggleFollow(req.user!.id, targetUserId));
    }),
  );

  router.post(
    '/community/posts/:postId/bookmark',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const postId = parseUuid(req.params.postId, 'Post');
      res.json(await core.hub.toggleBookmark(req.user!.id, postId));
    }),
  );

  router.post(
    '/community/rules/accept',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await core.acceptRules(req.user!.id));
    }),
  );

  router.patch(
    '/community/profile',
    auth,
    verified,
    validateBody(updateCommunityProfileSchema),
    asyncHandler(async (req, res) => {
      res.json(await core.updateProfile(req.user!.id, req.body));
    }),
  );

  router.get(
    '/community/notifications/preferences',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await core.getNotificationPreferences(req.user!.id));
    }),
  );

  router.patch(
    '/community/notifications/preferences',
    auth,
    verified,
    validateBody(updateNotifPrefsSchema),
    asyncHandler(async (req, res) => {
      res.json(await core.updateNotificationPreferences(req.user!.id, req.body));
    }),
  );

  // Course -> Community matching & leaving
  router.post(
    '/community/courses/:courseId/switch',
    auth,
    verified,
    validateBody(switchCourseCommunitySchema),
    asyncHandler(async (req, res) => {
      const courseId = parseUuid(req.params.courseId, 'Course');
      res.json(await core.switchCourseCommunity(req.user!.id, courseId, req.body));
    }),
  );

  router.get(
    '/community/courses/:communityId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      res.json(await core.getCommunityDetail(req.user!.id, communityId));
    }),
  );

  router.post(
    '/community/courses/:communityId/leave',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      await core.leaveCommunity(req.user!.id, communityId);
      res.status(204).end();
    }),
  );

  // Q&A Posts & Replies
  router.get(
    '/community/courses/:communityId/posts',
    auth,
    verified,
    validateQuery(listPostsQuerySchema),
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      res.json(
        await core.listPosts(
          req.user!.id,
          communityId,
          req.query as unknown as z.infer<typeof listPostsQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/community/courses/:communityId/posts',
    auth,
    verified,
    postLimiter,
    validateBody(createPostSchema),
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      res.status(201).json(await core.createPost(req.user!.id, communityId, req.body));
    }),
  );

  router.get(
    '/community/posts/:postId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const postId = parseUuid(req.params.postId, 'Post');
      res.json(await core.getPostDetail(req.user!.id, postId));
    }),
  );

  router.patch(
    '/community/posts/:postId',
    auth,
    verified,
    validateBody(updatePostSchema),
    asyncHandler(async (req, res) => {
      const postId = parseUuid(req.params.postId, 'Post');
      res.json(await core.updatePost(req.user!.id, postId, req.body));
    }),
  );

  router.delete(
    '/community/posts/:postId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const postId = parseUuid(req.params.postId, 'Post');
      await core.deletePost(req.user!.id, postId);
      res.status(204).end();
    }),
  );

  router.post(
    '/community/posts/:postId/replies',
    auth,
    verified,
    postLimiter,
    validateBody(createReplySchema),
    asyncHandler(async (req, res) => {
      const postId = parseUuid(req.params.postId, 'Post');
      res.status(201).json(await core.createReply(req.user!.id, postId, req.body));
    }),
  );

  router.post(
    '/community/posts/:postId/accept/:replyId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const postId = parseUuid(req.params.postId, 'Post');
      const replyId = parseUuid(req.params.replyId, 'Reply');
      res.json(await core.acceptReply(req.user!.id, postId, replyId));
    }),
  );

  router.post(
    '/community/votes',
    auth,
    verified,
    validateBody(voteSchema),
    asyncHandler(async (req, res) => {
      res.json(await core.toggleVote(req.user!.id, req.body.targetType, req.body.targetId));
    }),
  );

  router.post(
    '/community/ai/ask-awal',
    auth,
    verified,
    aiLimiter,
    validateBody(askAwalFirstSchema),
    asyncHandler(async (req, res) => {
      res.json(await core.askAwalFirst(req.user!.id, req.body));
    }),
  );

  // Moderation, Reporting & Blocking
  router.post(
    '/community/reports',
    auth,
    verified,
    postLimiter,
    validateBody(reportContentSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await core.reportContent(req.user!.id, req.body));
    }),
  );

  router.post(
    '/community/blocks',
    auth,
    verified,
    validateBody(blockUserSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await core.blockUser(req.user!.id, req.body.userId));
    }),
  );

  router.delete(
    '/community/blocks/:userId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const targetId = parseUuid(req.params.userId, 'User');
      res.json(await core.unblockUser(req.user!.id, targetId));
    }),
  );

  router.post(
    '/community/courses/:communityId/moderate',
    auth,
    verified,
    validateBody(moderateCommunityContentSchema),
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      res.json(await core.moderateInCommunity(req.user!.id, communityId, req.body));
    }),
  );

  // Study Groups & Real-Time Chat
  router.get(
    '/community/courses/:communityId/groups',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      res.json(await groups.listCommunityGroups(req.user!.id, communityId));
    }),
  );

  router.post(
    '/community/groups',
    auth,
    verified,
    postLimiter,
    validateBody(createGroupSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await groups.createGroup(req.user!.id, req.body));
    }),
  );

  router.post(
    '/community/groups/:groupId/join',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      res.json(await groups.joinGroup(req.user!.id, groupId));
    }),
  );

  router.post(
    '/community/groups/join-code',
    auth,
    verified,
    validateBody(joinGroupByCodeSchema),
    asyncHandler(async (req, res) => {
      res.json(await groups.joinByInviteCode(req.user!.id, req.body.inviteCode));
    }),
  );

  router.post(
    '/community/groups/:groupId/leave',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      await groups.leaveGroup(req.user!.id, groupId);
      res.status(204).end();
    }),
  );

  router.patch(
    '/community/groups/:groupId/mute',
    auth,
    verified,
    validateBody(z.object({ muted: z.boolean() }).strict()),
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      res.json(await groups.toggleMuteGroup(req.user!.id, groupId, req.body.muted));
    }),
  );

  router.post(
    '/community/groups/:groupId/invite/:targetUserId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const targetUserId = parseUuid(req.params.targetUserId, 'User');
      res.json(await groups.inviteClassmateToGroup(req.user!.id, groupId, targetUserId));
    }),
  );

  router.get(
    '/community/groups/:groupId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      res.json(await groups.getGroupDetail(req.user!.id, groupId));
    }),
  );

  router.get(
    '/community/groups/:groupId/messages',
    auth,
    verified,
    validateQuery(cursorQuerySchema),
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      res.json(
        await groups.listGroupMessages(
          req.user!.id,
          groupId,
          req.query as unknown as z.infer<typeof cursorQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/community/groups/:groupId/messages',
    auth,
    verified,
    chatLimiter,
    validateBody(sendGroupMessageSchema),
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      res.status(201).json(await groups.sendGroupMessage(req.user!.id, groupId, req.body));
    }),
  );

  router.patch(
    '/community/groups/:groupId/messages/:messageId',
    auth,
    verified,
    validateBody(updateGroupMessageSchema),
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const messageId = parseUuid(req.params.messageId, 'Message');
      res.json(await groups.editGroupMessage(req.user!.id, groupId, messageId, req.body.body));
    }),
  );

  router.delete(
    '/community/groups/:groupId/messages/:messageId',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const messageId = parseUuid(req.params.messageId, 'Message');
      await groups.deleteGroupMessage(req.user!.id, groupId, messageId);
      res.status(204).end();
    }),
  );

  router.post(
    '/community/groups/:groupId/messages/:messageId/pin',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const messageId = parseUuid(req.params.messageId, 'Message');
      res.json(await groups.pinGroupMessage(req.user!.id, groupId, messageId));
    }),
  );

  router.post(
    '/community/groups/:groupId/typing',
    auth,
    verified,
    chatLimiter,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const detail = await groups.getGroupDetail(req.user!.id, groupId);
      const me = detail.members.find((m) => m.userId === req.user!.id);
      realtime.setTyping(groupId, req.user!.id, me?.name ?? 'Classmate');
      res.status(204).end();
    }),
  );

  router.get(
    '/community/groups/:groupId/stream',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const detail = await groups.getGroupDetail(req.user!.id, groupId);
      const me = detail.members.find((m) => m.userId === req.user!.id);

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`event: connected\ndata: ${JSON.stringify({ groupId })}\n\n`);

      const unsubscribe = realtime.subscribe(groupId, req.user!.id, me?.name ?? 'Classmate', res);
      req.on('close', () => {
        unsubscribe();
      });
    }),
  );

  // Shared Group Tasks & Focus Timer
  router.post(
    '/community/groups/:groupId/tasks',
    auth,
    verified,
    validateBody(createGroupTaskSchema),
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      res.status(201).json(await groups.createGroupTask(req.user!.id, groupId, req.body));
    }),
  );

  router.patch(
    '/community/groups/:groupId/tasks/:taskId',
    auth,
    verified,
    validateBody(z.object({ done: z.boolean() }).strict()),
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const taskId = parseUuid(req.params.taskId, 'Task');
      res.json(await groups.toggleGroupTask(req.user!.id, groupId, taskId, req.body.done));
    }),
  );

  router.post(
    '/community/groups/:groupId/tasks/:taskId/sync-planner',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      const taskId = parseUuid(req.params.taskId, 'Task');
      res.status(201).json(await groups.syncGroupTaskToPlanner(req.user!.id, groupId, taskId));
    }),
  );

  router.post(
    '/community/groups/:groupId/focus',
    auth,
    verified,
    validateBody(startGroupFocusSchema),
    asyncHandler(async (req, res) => {
      const groupId = parseUuid(req.params.groupId, 'Group');
      res.json(await groups.startGroupFocus(req.user!.id, groupId, req.body));
    }),
  );

  // Shared Resources
  router.get(
    '/community/courses/:communityId/resources',
    auth,
    verified,
    validateQuery(cursorQuerySchema),
    asyncHandler(async (req, res) => {
      const communityId = parseUuid(req.params.communityId, 'Community');
      const query = req.query as unknown as z.infer<typeof cursorQuerySchema>;
      const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined;
      res.json(
        await groups.listSharedResources(req.user!.id, {
          communityId,
          groupId,
          cursor: query.cursor,
          limit: query.limit,
        }),
      );
    }),
  );

  router.post(
    '/community/resources',
    auth,
    verified,
    postLimiter,
    validateBody(shareResourceSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await groups.shareResource(req.user!.id, req.body));
    }),
  );

  router.post(
    '/community/resources/:resourceId/save',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const resourceId = parseUuid(req.params.resourceId, 'Resource');
      res.status(201).json(await groups.saveSharedResourceToCourse(req.user!.id, resourceId));
    }),
  );

  // Attachments
  router.post(
    '/community/attachments',
    auth,
    verified,
    postLimiter,
    handleMulter,
    asyncHandler(async (req, res) => {
      if (!req.file) throw new AppError('VALIDATION_ERROR', 'File is required');
      res.status(201).json(await groups.uploadAttachment(req.user!.id, req.file));
    }),
  );

  router.get(
    '/community/attachments/:attachmentId/content',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      const attachmentId = parseUuid(req.params.attachmentId, 'Attachment');
      const file = await groups.getAttachmentBytes(req.user!.id, attachmentId);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeContentDispositionFilename(file.originalName, 'attachment')}"`,
      );
      res.send(file.bytes);
    }),
  );

  return router;
}
