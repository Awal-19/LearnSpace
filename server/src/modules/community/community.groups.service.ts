import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import { sharpSafe } from '../../lib/fileSafety';
import type { LLMProvider } from '../../lib/llm/provider';
import type { StorageService } from '../../lib/storage';
import { recordUsageEvent } from '../admin/admin.logging';
import { enforceAiQuota } from '../ai/aiQuota';
import {
  detectAttachmentType,
  MAX_DOC_BYTES,
  MAX_IMAGE_BYTES,
  noopMalwareScanner,
  type MalwareScanner,
} from '../ai/attachments.service';
import { extractDomain, isDomainDenied } from '../courses/recommendations.safety';
import type { CommunityRealtimeHub } from './community.realtime';
import {
  assertSafeCommunityLinks,
  buildSafeLinkPreview,
  checkProfanityAndBannedWords,
  sanitizeCommunityText,
} from './community.safety';
import type { createCommunityService } from './community.service';

const MAX_NEW_GROUPS_PER_DAY = 3;

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createCommunityGroupsService(deps: {
  prisma: PrismaClient;
  core: ReturnType<typeof createCommunityService>;
  realtime: CommunityRealtimeHub;
  storage?: StorageService;
  malwareScanner?: MalwareScanner;
  llm?: LLMProvider;
  dailyTokenLimit?: number | null;
  logger: Logger;
}) {
  const {
    prisma,
    core,
    realtime,
    storage,
    malwareScanner = noopMalwareScanner,
    llm,
    dailyTokenLimit = null,
    logger,
  } = deps;

  async function assertGroupMember(userId: string, groupId: string) {
    const member = await prisma.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: {
        group: {
          include: {
            community: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    if (!member) throw new AppError('NOT_FOUND', 'Study group not found');
    return member;
  }

  return {
    async listCommunityGroups(userId: string, communityId: string) {
      await core.assertCommunityFeatureEnabled();
      await core.assertCommunityMember(userId, communityId);

      const groups = await prisma.studyGroup.findMany({
        where: {
          communityId,
          OR: [{ visibility: 'public_course' }, { members: { some: { userId } } }],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { members: true, messages: true } },
          members: { where: { userId }, select: { role: true, muted: true } },
        },
      });

      return groups.map((g) => ({
        id: g.id,
        communityId: g.communityId,
        name: g.name,
        description: g.description,
        visibility: g.visibility,
        inviteCode: g.members.length > 0 ? g.inviteCode : null,
        memberCount: g._count.members,
        messageCount: g._count.messages,
        isMember: g.members.length > 0,
        myRole: g.members[0]?.role ?? null,
        muted: g.members[0]?.muted ?? false,
        createdAt: g.createdAt,
      }));
    },

    async createGroup(
      userId: string,
      input: {
        communityId: string;
        name: string;
        description?: string | null;
        visibility: 'public_course' | 'invite_only';
      },
    ) {
      await core.assertCommunityFeatureEnabled();
      await core.assertRulesAccepted(userId);
      await core.assertCommunityMember(userId, input.communityId);

      const dayStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
      );
      const createdToday = await prisma.studyGroup.count({
        where: { creatorId: userId, createdAt: { gte: dayStart } },
      });
      if (createdToday >= MAX_NEW_GROUPS_PER_DAY) {
        throw new AppError(
          'RATE_LIMITED',
          `Daily limit of ${MAX_NEW_GROUPS_PER_DAY} new study groups reached.`,
        );
      }

      const inviteCode = randomBytes(6).toString('hex');
      const group = await prisma.studyGroup.create({
        data: {
          communityId: input.communityId,
          creatorId: userId,
          name: sanitizeCommunityText(input.name, 100),
          description: input.description ? sanitizeCommunityText(input.description, 500) : null,
          visibility: input.visibility,
          inviteCode,
          members: {
            create: { userId, role: 'owner' },
          },
        },
      });
      return group;
    },

    async joinGroup(userId: string, groupId: string) {
      await core.assertCommunityFeatureEnabled();
      const group = await prisma.studyGroup.findUnique({ where: { id: groupId } });
      if (!group) throw new AppError('NOT_FOUND', 'Study group not found');
      await core.assertCommunityMember(userId, group.communityId);

      if (group.visibility === 'invite_only') {
        const existing = await prisma.studyGroupMember.findUnique({
          where: { groupId_userId: { groupId, userId } },
        });
        if (!existing) {
          throw new AppError(
            'FORBIDDEN',
            'This study group is invite-only. Use an invite link or code.',
          );
        }
      }

      await prisma.studyGroupMember.upsert({
        where: { groupId_userId: { groupId, userId } },
        create: { groupId, userId, role: 'member' },
        update: {},
      });
      return { joined: true, groupId };
    },

    async joinByInviteCode(userId: string, inviteCode: string) {
      await core.assertCommunityFeatureEnabled();
      const group = await prisma.studyGroup.findUnique({
        where: { inviteCode: inviteCode.trim() },
      });
      if (!group) throw new AppError('NOT_FOUND', 'Invalid or expired group invite code.');

      await prisma.communityMember.upsert({
        where: { communityId_userId: { communityId: group.communityId, userId } },
        create: { communityId: group.communityId, userId, role: 'member' },
        update: {},
      });
      await prisma.studyGroupMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId, role: 'member' },
        update: {},
      });
      return { joined: true, groupId: group.id, name: group.name };
    },

    async leaveGroup(userId: string, groupId: string) {
      await assertGroupMember(userId, groupId);
      await prisma.studyGroupMember.delete({
        where: { groupId_userId: { groupId, userId } },
      });
    },

    async toggleMuteGroup(userId: string, groupId: string, muted: boolean) {
      await assertGroupMember(userId, groupId);
      await prisma.studyGroupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { muted },
      });
      return { muted };
    },

    async inviteClassmateToGroup(userId: string, groupId: string, targetUserId: string) {
      const membership = await assertGroupMember(userId, groupId);
      const blockedIds = await core.getBlockedUserIds(userId);
      if (blockedIds.has(targetUserId)) {
        throw new AppError('FORBIDDEN', 'Cannot invite this user.');
      }
      const inCommunity = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId: membership.group.communityId, userId: targetUserId },
        },
      });
      if (!inCommunity) {
        throw new AppError('NOT_FOUND', 'Classmate is not in this course community.');
      }

      await prisma.studyGroupMember.upsert({
        where: { groupId_userId: { groupId, userId: targetUserId } },
        create: { groupId, userId: targetUserId, role: 'member' },
        update: {},
      });
      await core.sendCommunityNotification({
        recipientId: targetUserId,
        prefField: 'inAppGroupInvite',
        title: `Invited to ${membership.group.name}`,
        body: `You were added to the study group "${membership.group.name}" in ${membership.group.community.displayName}.`,
        occurrenceKey: `group_invite:${groupId}:${targetUserId}`,
      });
      return { invited: true };
    },

    async getGroupDetail(userId: string, groupId: string) {
      await core.assertCommunityFeatureEnabled();
      const membership = await assertGroupMember(userId, groupId);
      const group = membership.group;
      const [members, tasks, pinnedMessage] = await Promise.all([
        prisma.studyGroupMember.findMany({
          where: { groupId },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        }),
        prisma.studyGroupTask.findMany({
          where: { groupId },
          orderBy: [{ done: 'asc' }, { createdAt: 'asc' }],
        }),
        group.pinnedMessageId
          ? prisma.studyGroupMessage.findUnique({
              where: { id: group.pinnedMessageId },
              include: { author: { select: { id: true, name: true } } },
            })
          : null,
      ]);

      return {
        id: group.id,
        communityId: group.communityId,
        communityName: group.community.displayName,
        name: group.name,
        description: group.description,
        visibility: group.visibility,
        inviteCode: group.inviteCode,
        myRole: membership.role,
        muted: membership.muted,
        activeFocusTitle:
          group.activeFocusEndsAt && group.activeFocusEndsAt > new Date()
            ? group.activeFocusTitle
            : null,
        activeFocusEndsAt:
          group.activeFocusEndsAt && group.activeFocusEndsAt > new Date()
            ? group.activeFocusEndsAt
            : null,
        onlineParticipants: realtime.getActiveParticipants(groupId),
        pinnedMessage:
          pinnedMessage && !pinnedMessage.hidden
            ? {
                id: pinnedMessage.id,
                body: pinnedMessage.body,
                authorName: pinnedMessage.author?.name ?? '[Deleted user]',
              }
            : null,
        members: members.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
        })),
        tasks,
      };
    },

    async listGroupMessages(
      userId: string,
      groupId: string,
      query: { cursor?: string; limit: number },
    ) {
      await assertGroupMember(userId, groupId);
      const blockedIds = Array.from(await core.getBlockedUserIds(userId));

      const rows = await prisma.studyGroupMessage.findMany({
        where: {
          groupId,
          hidden: false,
          ...(blockedIds.length ? { authorId: { notIn: blockedIds } } : {}),
        },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          replyTo: {
            select: {
              id: true,
              body: true,
              author: { select: { name: true } },
            },
          },
          attachments: {
            select: { id: true, originalName: true, mimeType: true, kind: true, sizeBytes: true },
          },
        },
      });

      const hasMore = rows.length > query.limit;
      const items = (hasMore ? rows.slice(0, query.limit) : rows).reverse();
      const nextCursor = hasMore ? rows[query.limit - 1]!.id : null;

      return {
        items: items.map((m) => ({
          id: m.id,
          groupId: m.groupId,
          body: m.body,
          isAiGenerated: m.isAiGenerated,
          linkPreview: m.linkPreviewJson,
          replyTo: m.replyTo
            ? {
                id: m.replyTo.id,
                body: m.replyTo.body.slice(0, 120),
                authorName: m.replyTo.author?.name ?? '[Deleted user]',
              }
            : null,
          isOwn: m.authorId === userId,
          author: m.isAiGenerated
            ? { id: null, name: 'AWAL (AI)', avatarUrl: null }
            : m.author
              ? { id: m.author.id, name: m.author.name, avatarUrl: m.author.avatarUrl }
              : { id: null, name: '[Deleted user]', avatarUrl: null },
          attachments: m.attachments,
          createdAt: m.createdAt,
        })),
        nextCursor,
      };
    },

    async sendGroupMessage(
      userId: string,
      groupId: string,
      input: {
        body: string;
        replyToId?: string | null;
        clientMessageId?: string;
        attachmentIds: string[];
      },
    ) {
      const settings = await core.assertCommunityFeatureEnabled();
      await core.assertRulesAccepted(userId);
      const membership = await assertGroupMember(userId, groupId);

      // Idempotent deduplication for flaky mobile reconnects
      if (input.clientMessageId) {
        const dup = await prisma.studyGroupMessage.findUnique({
          where: {
            groupId_clientMessageId: { groupId, clientMessageId: input.clientMessageId },
          },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
            attachments: true,
          },
        });
        if (dup) return dup;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true, createdAt: true },
      });
      const body = sanitizeCommunityText(input.body, 4000);
      const adminBlockDomains = parseStringArray(settings?.recommendationBlockDomainsJson);

      try {
        assertSafeCommunityLinks(body, user?.createdAt ?? new Date(), adminBlockDomains);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'NEW_ACCOUNT_LINK_LIMIT') {
          throw new AppError(
            'FORBIDDEN',
            'New accounts (<24h) can include at most 1 link per message.',
          );
        }
        throw new AppError('VALIDATION_ERROR', 'Message contains a blocked or unsafe domain.');
      }

      const bannedWords = parseStringArray(settings?.communityBannedWordsJson);
      const profanity = checkProfanityAndBannedWords(body, bannedWords);
      const linkPreview = buildSafeLinkPreview(body, adminBlockDomains);

      const message = await prisma.studyGroupMessage.create({
        data: {
          groupId,
          authorId: userId,
          replyToId: input.replyToId ?? null,
          clientMessageId: input.clientMessageId ?? null,
          body,
          linkPreviewJson: linkPreview ? (linkPreview as Prisma.InputJsonValue) : undefined,
          flaggedByFilter: profanity.flagged,
        },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          attachments: true,
        },
      });

      if (input.attachmentIds.length > 0) {
        await prisma.communityAttachment.updateMany({
          where: { id: { in: input.attachmentIds }, userId, messageId: null },
          data: { messageId: message.id },
        });
      }

      const payload = {
        id: message.id,
        groupId: message.groupId,
        body: message.body,
        isAiGenerated: false,
        linkPreview,
        replyTo: null,
        isOwn: false,
        author: user
          ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl }
          : { id: null, name: 'Student', avatarUrl: null },
        attachments: message.attachments,
        createdAt: message.createdAt,
      };
      realtime.publish(groupId, 'message', payload, message.id);

      // Handle @AWAL mention in group chat
      if (/@awal\b/i.test(body) && llm && llm.isConfigured()) {
        void (async () => {
          try {
            await enforceAiQuota(prisma, userId, dailyTokenLimit);
            const start = Date.now();
            const aiRes = await llm.generateText(
              `Study group (${membership.group.name} - ${membership.group.community.displayName}). Member ${user?.name ?? 'Student'} asked: ${body}`,
              {
                systemPrompt:
                  'You are AWAL, an AI study assistant in a LearnSpace student study group. Give a concise, helpful explanation or practice quiz question using LaTeX math ($...$) where helpful.',
                temperature: 0.3,
                maxOutputTokens: 700,
              },
            );
            await recordUsageEvent(prisma, {
              userId,
              feature: 'community_ai',
              model: llm.modelName,
              tokensIn: aiRes.usage?.inputTokens ?? 0,
              tokensOut: aiRes.usage?.outputTokens ?? 0,
              durationMs: Date.now() - start,
              status: 'success',
              route: 'community:group_mention',
            });
            const aiMsg = await prisma.studyGroupMessage.create({
              data: {
                groupId,
                authorId: null,
                replyToId: message.id,
                body: aiRes.text,
                isAiGenerated: true,
              },
            });
            realtime.publish(
              groupId,
              'message',
              {
                id: aiMsg.id,
                groupId,
                body: aiMsg.body,
                isAiGenerated: true,
                linkPreview: null,
                replyTo: {
                  id: message.id,
                  body: body.slice(0, 120),
                  authorName: user?.name ?? 'Student',
                },
                isOwn: false,
                author: { id: null, name: 'AWAL (AI)', avatarUrl: null },
                attachments: [],
                createdAt: aiMsg.createdAt,
              },
              aiMsg.id,
            );
          } catch (err) {
            logger.warn({ err, groupId }, '@AWAL group mention failed');
          }
        })();
      }

      return payload;
    },

    async editGroupMessage(userId: string, groupId: string, messageId: string, body: string) {
      await assertGroupMember(userId, groupId);
      const msg = await prisma.studyGroupMessage.findFirst({ where: { id: messageId, groupId } });
      if (!msg || msg.hidden) throw new AppError('NOT_FOUND', 'Message not found');
      if (msg.authorId !== userId)
        throw new AppError('FORBIDDEN', 'You can only edit your own messages.');

      const updated = await prisma.studyGroupMessage.update({
        where: { id: msg.id },
        data: { body: sanitizeCommunityText(body, 4000) },
      });
      realtime.publish(groupId, 'message_updated', { id: updated.id, body: updated.body });
      return updated;
    },

    async deleteGroupMessage(userId: string, groupId: string, messageId: string) {
      const membership = await assertGroupMember(userId, groupId);
      const msg = await prisma.studyGroupMessage.findFirst({ where: { id: messageId, groupId } });
      if (!msg) throw new AppError('NOT_FOUND', 'Message not found');
      const isMod = membership.role === 'owner' || membership.role === 'moderator';
      if (msg.authorId !== userId && !isMod) {
        throw new AppError('FORBIDDEN', 'You cannot delete this message.');
      }
      await prisma.studyGroupMessage.update({ where: { id: msg.id }, data: { hidden: true } });
      realtime.publish(groupId, 'message_deleted', { id: msg.id });
    },

    async pinGroupMessage(userId: string, groupId: string, messageId: string) {
      const membership = await assertGroupMember(userId, groupId);
      if (membership.role !== 'owner' && membership.role !== 'moderator') {
        throw new AppError('FORBIDDEN', 'Only group owners or moderators can pin messages.');
      }
      const msg = await prisma.studyGroupMessage.findFirst({
        where: { id: messageId, groupId, hidden: false },
      });
      if (!msg) throw new AppError('NOT_FOUND', 'Message not found');
      await prisma.studyGroup.update({
        where: { id: groupId },
        data: { pinnedMessageId: msg.id },
      });
      realtime.publish(groupId, 'pinned_updated', { id: msg.id, body: msg.body });
      return { pinnedMessageId: msg.id };
    },

    async createGroupTask(
      userId: string,
      groupId: string,
      input: { title: string; dueAt?: string | null },
    ) {
      await assertGroupMember(userId, groupId);
      const task = await prisma.studyGroupTask.create({
        data: {
          groupId,
          creatorId: userId,
          title: sanitizeCommunityText(input.title, 180),
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        },
      });
      realtime.publish(groupId, 'task_created', task);
      return task;
    },

    async toggleGroupTask(userId: string, groupId: string, taskId: string, done: boolean) {
      await assertGroupMember(userId, groupId);
      const task = await prisma.studyGroupTask.update({
        where: { id: taskId },
        data: { done },
      });
      realtime.publish(groupId, 'task_updated', task);
      return task;
    },

    async syncGroupTaskToPlanner(userId: string, groupId: string, taskId: string) {
      const membership = await assertGroupMember(userId, groupId);
      const groupTask = await prisma.studyGroupTask.findFirst({ where: { id: taskId, groupId } });
      if (!groupTask) throw new AppError('NOT_FOUND', 'Group task not found');

      const course = await prisma.course.findFirst({
        where: { userId, communityId: membership.group.communityId },
        select: { id: true },
      });
      const personalTask = await prisma.task.create({
        data: {
          userId,
          courseId: course?.id ?? null,
          title: `[${membership.group.name}] ${groupTask.title}`.slice(0, 180),
          dueAt: groupTask.dueAt,
          priority: 'medium',
          status: groupTask.done ? 'done' : 'todo',
        },
      });
      return personalTask;
    },

    async startGroupFocus(
      userId: string,
      groupId: string,
      input: { title: string; durationMinutes: number },
    ) {
      await assertGroupMember(userId, groupId);
      const endsAt = new Date(Date.now() + input.durationMinutes * 60 * 1000);
      const updated = await prisma.studyGroup.update({
        where: { id: groupId },
        data: {
          activeFocusTitle: sanitizeCommunityText(input.title, 120),
          activeFocusEndsAt: endsAt,
        },
      });
      realtime.publish(groupId, 'focus_started', {
        title: updated.activeFocusTitle,
        endsAt: updated.activeFocusEndsAt,
      });
      return { title: updated.activeFocusTitle, endsAt: updated.activeFocusEndsAt };
    },

    async listSharedResources(
      userId: string,
      params: { communityId: string; groupId?: string; cursor?: string; limit: number },
    ) {
      await core.assertCommunityFeatureEnabled();
      await core.assertCommunityMember(userId, params.communityId);
      if (params.groupId) {
        await assertGroupMember(userId, params.groupId);
      }
      const blockedIds = Array.from(await core.getBlockedUserIds(userId));

      const rows = await prisma.sharedResource.findMany({
        where: {
          communityId: params.communityId,
          ...(params.groupId ? { groupId: params.groupId } : { groupId: null }),
          hidden: false,
          ...(blockedIds.length ? { authorId: { notIn: blockedIds } } : {}),
        },
        take: params.limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          community: { select: { displayName: true } },
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              communityProfile: { select: { helpedCount: true, hideStats: true } },
            },
          },
        },
      });

      const hasMore = rows.length > params.limit;
      const items = hasMore ? rows.slice(0, params.limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]!.id : null;

      return {
        items: items.map((r) => ({
          id: r.id,
          communityId: r.communityId,
          communityName: r.community.displayName,
          groupId: r.groupId,
          sourceType: r.sourceType,
          title: r.title,
          description: r.description,
          bodySnapshot: r.bodySnapshot,
          url: r.url,
          sourceDomain: r.sourceDomain,
          helpfulCount: r.helpfulCount,
          isOwn: r.authorId === userId,
          author: core.formatAuthor(r.author, false),
          createdAt: r.createdAt,
        })),
        nextCursor,
      };
    },

    async shareResource(
      userId: string,
      input: {
        communityId: string;
        groupId?: string | null;
        sourceType: 'note_copy' | 'document' | 'link' | 'recommendation';
        sourceId?: string;
        title: string;
        description?: string | null;
        url?: string | null;
      },
    ) {
      const settings = await core.assertCommunityFeatureEnabled();
      await core.assertRulesAccepted(userId);
      await core.assertCommunityMember(userId, input.communityId);
      if (input.groupId) {
        await assertGroupMember(userId, input.groupId);
      }

      const adminBlockDomains = parseStringArray(settings?.recommendationBlockDomainsJson);
      let bodySnapshot: string | null = null;
      let finalUrl: string | null = input.url ?? null;
      let sourceDomain: string | null = finalUrl ? extractDomain(finalUrl) : null;

      if (finalUrl && isDomainDenied(finalUrl, adminBlockDomains)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'This link domain is blocked by LearnSpace safety rules.',
        );
      }

      if (input.sourceType === 'note_copy' && input.sourceId) {
        const note = await prisma.note.findFirst({
          where: { id: input.sourceId, userId },
          select: { title: true, body: true },
        });
        if (!note) throw new AppError('NOT_FOUND', 'Note not found');
        // Create a read-only snapshot copy (never grants access to the original Note)
        bodySnapshot = sanitizeCommunityText(note.body, 20_000);
      } else if (input.sourceType === 'document' && input.sourceId) {
        const doc = await prisma.document.findFirst({
          where: { id: input.sourceId, userId },
          select: { title: true, extractedText: true },
        });
        if (!doc) throw new AppError('NOT_FOUND', 'Document not found');
        bodySnapshot = sanitizeCommunityText(doc.extractedText, 20_000);
      } else if (input.sourceType === 'recommendation' && input.sourceId) {
        const rec = await prisma.courseRecommendation.findFirst({
          where: { id: input.sourceId, userId },
          select: { url: true, sourceDomain: true },
        });
        if (!rec) throw new AppError('NOT_FOUND', 'Course recommendation not found');
        finalUrl = rec.url;
        sourceDomain = rec.sourceDomain;
      }

      return prisma.sharedResource.create({
        data: {
          communityId: input.communityId,
          groupId: input.groupId ?? null,
          authorId: userId,
          sourceType: input.sourceType,
          title: sanitizeCommunityText(input.title, 200),
          description: input.description ? sanitizeCommunityText(input.description, 600) : null,
          bodySnapshot,
          url: finalUrl,
          sourceDomain,
        },
      });
    },

    async saveSharedResourceToCourse(userId: string, resourceId: string) {
      const shared = await prisma.sharedResource.findUnique({ where: { id: resourceId } });
      if (!shared || shared.hidden) throw new AppError('NOT_FOUND', 'Shared resource not found');
      await core.assertCommunityMember(userId, shared.communityId);

      const course = await prisma.course.findFirst({
        where: { userId, communityId: shared.communityId },
        select: { id: true },
      });
      if (!course) {
        throw new AppError(
          'NOT_FOUND',
          'Link a course to this community before saving resources to it.',
        );
      }

      if (shared.sourceType === 'note_copy' || shared.bodySnapshot) {
        const note = await prisma.note.create({
          data: {
            userId,
            courseId: course.id,
            title: shared.title.slice(0, 200),
            body: shared.bodySnapshot ?? shared.description ?? '',
          },
        });
        return { savedAs: 'note', id: note.id };
      }

      if (shared.url) {
        const saved = await prisma.courseResource.upsert({
          where: { courseId_url: { courseId: course.id, url: shared.url } },
          create: {
            courseId: course.id,
            userId,
            category: 'notes',
            title: shared.title.slice(0, 240),
            url: shared.url,
            sourceDomain: shared.sourceDomain ?? extractDomain(shared.url),
            accessType: 'free',
            reason: shared.description ?? 'Saved from course community',
          },
          update: {},
        });
        return { savedAs: 'course_resource', id: saved.id };
      }

      throw new AppError(
        'VALIDATION_ERROR',
        'This shared resource has no downloadable copy or URL.',
      );
    },

    async uploadAttachment(
      userId: string,
      file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    ) {
      if (!storage || !storage.isConfigured()) {
        throw new AppError('STORAGE_UNAVAILABLE', 'File storage is not configured.');
      }
      const detected = detectAttachmentType(file.buffer, file.mimetype, file.originalname);
      if (!detected) {
        throw new AppError(
          'UNSUPPORTED_MEDIA_TYPE',
          'Supported files: JPEG, PNG, WebP, HEIC, PDF, DOCX, PPTX, TXT, CSV.',
        );
      }
      const maxBytes = detected.kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
      if (file.size > maxBytes) {
        throw new AppError(
          'PAYLOAD_TOO_LARGE',
          `File exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit.`,
        );
      }

      const scan = await malwareScanner.scan(file.buffer, file.originalname);
      if (!scan.clean) {
        throw new AppError('VALIDATION_ERROR', scan.reason ?? 'File failed security scan.');
      }

      let uploadBuffer = file.buffer;
      let finalMime = detected.mimeType;
      if (detected.kind === 'image') {
        uploadBuffer = await sharpSafe(file.buffer)
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 84 })
          .toBuffer();
        finalMime = 'image/webp';
      }

      const stored = await storage.uploadAttachment(
        uploadBuffer,
        userId,
        detected.kind,
        detected.kind === 'image' ? 'webp' : detected.extension,
      );

      const row = await prisma.communityAttachment.create({
        data: {
          userId,
          originalName: file.originalname.slice(0, 255),
          mimeType: finalMime,
          kind: detected.kind,
          sizeBytes: uploadBuffer.length,
          storageKey: stored.storageKey,
          storageUrl: stored.storageUrl,
        },
      });
      return {
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        kind: row.kind,
        sizeBytes: row.sizeBytes,
      };
    },

    async getAttachmentBytes(userId: string, attachmentId: string) {
      if (!storage) throw new AppError('STORAGE_UNAVAILABLE', 'File storage unavailable');
      const att = await prisma.communityAttachment.findUnique({
        where: { id: attachmentId },
        include: {
          post: { select: { communityId: true } },
          reply: { select: { post: { select: { communityId: true } } } },
          message: { select: { groupId: true } },
        },
      });
      if (!att) throw new AppError('NOT_FOUND', 'Attachment not found');

      if (att.userId !== userId) {
        const communityId = att.post?.communityId ?? att.reply?.post.communityId;
        if (communityId) {
          await core.assertCommunityMember(userId, communityId);
        } else if (att.message?.groupId) {
          await assertGroupMember(userId, att.message.groupId);
        } else {
          throw new AppError('NOT_FOUND', 'Attachment not found');
        }
      }

      const bytes = await storage.readAttachmentBytes(att.storageKey, att.storageUrl, att.kind);
      return { bytes, mimeType: att.mimeType, originalName: att.originalName };
    },
  };
}
