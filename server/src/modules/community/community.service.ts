import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import { recordUsageEvent } from '../admin/admin.logging';
import { enforceAiQuota } from '../ai/aiQuota';
import {
  assertSafeCommunityLinks,
  buildCommunitySlug,
  checkProfanityAndBannedWords,
  helperBadgeForCount,
  sanitizeCommunityText,
} from './community.safety';

const MAX_NEW_GROUPS_PER_DAY = 3;
export { MAX_NEW_GROUPS_PER_DAY };

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CommunityAuthorView {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  helpedCount?: number;
  badge?: string | null;
  isAnonymous?: boolean;
}

export interface CommunityServiceDeps {
  prisma: PrismaClient;
  llm?: LLMProvider;
  dailyTokenLimit?: number | null;
  logger: Logger;
}

export function createCommunityService(deps: CommunityServiceDeps) {
  const { prisma, llm, dailyTokenLimit = null, logger } = deps;

  async function getSettings() {
    return prisma.appSettings.findUnique({ where: { id: 'global' } }).catch(() => null);
  }

  async function assertCommunityFeatureEnabled() {
    const s = await getSettings();
    if (s && s.featureCommunity === false) {
      throw new AppError(
        'AI_UNAVAILABLE',
        'Community feature is currently paused by an administrator.',
      );
    }
    return s;
  }

  async function getBlockedUserIds(userId: string): Promise<Set<string>> {
    const blocks = await prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const set = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId !== userId) set.add(b.blockerId);
      if (b.blockedId !== userId) set.add(b.blockedId);
    }
    return set;
  }

  async function ensureCommunityProfile(userId: string) {
    return prisma.userCommunityProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async function assertRulesAccepted(userId: string) {
    const profile = await ensureCommunityProfile(userId);
    if (!profile.rulesAcceptedAt) {
      throw new AppError('VALIDATION_ERROR', 'Please accept the community rules before posting.');
    }
    if (profile.mutedUntil && profile.mutedUntil > new Date()) {
      throw new AppError(
        'FORBIDDEN',
        'Your account is temporarily muted from posting in the community.',
      );
    }
    return profile;
  }

  async function assertCommunityMember(userId: string, communityId: string) {
    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!member) {
      throw new AppError('NOT_FOUND', 'Community not found');
    }
    return member;
  }

  function formatAuthor(
    author: {
      id: string;
      name: string;
      avatarUrl: string | null;
      communityProfile?: { helpedCount: number; hideStats: boolean } | null;
    } | null,
    isAnonymous: boolean,
  ): CommunityAuthorView {
    if (isAnonymous) {
      return { id: null, name: 'Anonymous student', avatarUrl: null, isAnonymous: true };
    }
    if (!author) {
      return { id: null, name: '[Deleted user]', avatarUrl: null };
    }
    const hideStats = author.communityProfile?.hideStats ?? false;
    const helped = author.communityProfile?.helpedCount ?? 0;
    return {
      id: author.id,
      name: author.name,
      avatarUrl: author.avatarUrl,
      ...(hideStats ? {} : { helpedCount: helped, badge: helperBadgeForCount(helped) }),
    };
  }

  async function sendCommunityNotification(params: {
    recipientId: string;
    prefField: 'inAppAnswer' | 'inAppAccepted' | 'inAppReply' | 'inAppGroupInvite' | 'inAppMention';
    title: string;
    body: string;
    occurrenceKey: string;
  }) {
    if (!prisma.notification?.create) return;
    const prefs = await prisma.communityNotificationPreference
      .findUnique({ where: { userId: params.recipientId } })
      .catch(() => null);
    if (prefs && prefs[params.prefField] === false) return;

    await prisma.notification
      .create({
        data: {
          userId: params.recipientId,
          type: 'system',
          title: params.title.slice(0, 200),
          body: params.body.slice(0, 500),
          occurrenceKey: params.occurrenceKey.slice(0, 160),
        },
      })
      .catch(() => undefined);
  }

  return {
    getSettings,
    assertCommunityFeatureEnabled,
    getBlockedUserIds,
    ensureCommunityProfile,
    assertRulesAccepted,
    assertCommunityMember,
    formatAuthor,
    sendCommunityNotification,

    async syncCourseToCommunity(userId: string, courseId: string) {
      const course = await prisma.course.findFirst({
        where: { id: courseId, userId },
        select: { id: true, name: true, communityId: true },
      });
      if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { university: true },
      });

      let communityId = course.communityId;
      if (!communityId) {
        const { slug, normalizedName, universityKey } = buildCommunitySlug(
          course.name,
          user?.university,
        );
        const community = await prisma.community.upsert({
          where: { slug },
          create: {
            slug,
            normalizedName,
            displayName: course.name.trim(),
            universityKey,
            universityName: user?.university?.trim() || null,
          },
          update: {},
        });
        communityId = community.id;
        await prisma.course.update({
          where: { id: course.id },
          data: { communityId },
        });
      }

      await prisma.communityMember.upsert({
        where: { communityId_userId: { communityId, userId } },
        create: { communityId, userId, role: 'member' },
        update: {},
      });

      return communityId;
    },

    async getHome(userId: string) {
      const settings = await assertCommunityFeatureEnabled();
      const [profile, courses, blockedIds] = await Promise.all([
        ensureCommunityProfile(userId),
        prisma.course.findMany({
          where: { userId, archivedAt: null },
          select: { id: true, name: true, code: true, color: true, communityId: true },
          orderBy: { name: 'asc' },
        }),
        getBlockedUserIds(userId),
      ]);

      // Auto-sync active courses that don't yet have a community link
      for (const c of courses) {
        if (!c.communityId) {
          c.communityId = await this.syncCourseToCommunity(userId, c.id);
        }
      }

      const memberships = await prisma.communityMember.findMany({
        where: { userId },
        include: {
          community: {
            include: {
              _count: { select: { members: true, posts: true, studyGroups: true } },
            },
          },
        },
      });

      const communityIds = memberships.map((m) => m.communityId);
      const blockedList = Array.from(blockedIds);

      const [unansweredPosts, recentPosts, groupMemberships] = await Promise.all([
        communityIds.length
          ? prisma.communityPost.findMany({
              where: {
                communityId: { in: communityIds },
                hidden: false,
                status: 'unanswered',
                ...(blockedList.length ? { authorId: { notIn: blockedList } } : {}),
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: {
                community: { select: { id: true, displayName: true, universityName: true } },
                author: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                    communityProfile: { select: { helpedCount: true, hideStats: true } },
                  },
                },
              },
            })
          : [],
        communityIds.length
          ? prisma.communityPost.findMany({
              where: {
                communityId: { in: communityIds },
                hidden: false,
                ...(blockedList.length ? { authorId: { notIn: blockedList } } : {}),
              },
              orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
              take: 10,
              include: {
                community: { select: { id: true, displayName: true, universityName: true } },
                author: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                    communityProfile: { select: { helpedCount: true, hideStats: true } },
                  },
                },
              },
            })
          : [],
        prisma.studyGroupMember.findMany({
          where: { userId },
          include: {
            group: {
              include: {
                community: { select: { id: true, displayName: true } },
                _count: { select: { members: true, messages: true } },
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        }),
      ]);

      return {
        rulesAccepted: Boolean(profile.rulesAcceptedAt),
        profile: {
          helpedCount: profile.helpedCount,
          acceptedCount: profile.acceptedCount,
          badge: helperBadgeForCount(profile.helpedCount),
          hideStats: profile.hideStats,
          showInClassmates: profile.showInClassmates,
        },
        examNotice: settings?.communityExamNoticeEnabled
          ? { enabled: true, message: settings.communityExamNoticeMessage }
          : { enabled: false, message: null },
        communities: memberships.map((m) => ({
          id: m.community.id,
          slug: m.community.slug,
          displayName: m.community.displayName,
          universityName: m.community.universityName,
          role: m.role,
          isPaused: m.community.isPaused,
          memberCount: m.community._count.members,
          postCount: m.community._count.posts,
          groupCount: m.community._count.studyGroups,
        })),
        myGroups: groupMemberships.map((gm) => ({
          id: gm.group.id,
          name: gm.group.name,
          description: gm.group.description,
          visibility: gm.group.visibility,
          role: gm.role,
          muted: gm.muted,
          communityId: gm.group.communityId,
          communityName: gm.group.community.displayName,
          memberCount: gm.group._count.members,
          messageCount: gm.group._count.messages,
        })),
        unanswered: unansweredPosts.map((p) => ({
          id: p.id,
          communityId: p.communityId,
          communityName: p.community.displayName,
          type: p.type,
          title: p.title,
          topicTag: p.topicTag,
          status: p.status,
          replyCount: p.replyCount,
          helpfulCount: p.helpfulCount,
          createdAt: p.createdAt,
          author: formatAuthor(p.author, p.isAnonymous),
        })),
        trending: recentPosts.map((p) => ({
          id: p.id,
          communityId: p.communityId,
          communityName: p.community.displayName,
          type: p.type,
          title: p.title,
          topicTag: p.topicTag,
          status: p.status,
          replyCount: p.replyCount,
          helpfulCount: p.helpfulCount,
          createdAt: p.createdAt,
          author: formatAuthor(p.author, p.isAnonymous),
        })),
      };
    },

    async acceptRules(userId: string) {
      const profile = await prisma.userCommunityProfile.upsert({
        where: { userId },
        create: { userId, rulesAcceptedAt: new Date() },
        update: { rulesAcceptedAt: new Date() },
      });
      return { rulesAcceptedAt: profile.rulesAcceptedAt };
    },

    async updateProfile(
      userId: string,
      input: { hideStats?: boolean; showInClassmates?: boolean },
    ) {
      const profile = await prisma.userCommunityProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
      return profile;
    },

    async switchCourseCommunity(
      userId: string,
      courseId: string,
      input: { scope?: 'university' | 'global'; communityId?: string },
    ) {
      const course = await prisma.course.findFirst({ where: { id: courseId, userId } });
      if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { university: true },
      });

      let targetCommunityId = input.communityId;
      if (!targetCommunityId) {
        const useUni = input.scope === 'university' ? user?.university : null;
        const { slug, normalizedName, universityKey } = buildCommunitySlug(course.name, useUni);
        const comm = await prisma.community.upsert({
          where: { slug },
          create: {
            slug,
            normalizedName,
            displayName: course.name.trim(),
            universityKey,
            universityName: useUni?.trim() || null,
          },
          update: {},
        });
        targetCommunityId = comm.id;
      } else {
        const exists = await prisma.community.findUnique({ where: { id: targetCommunityId } });
        if (!exists) throw new AppError('NOT_FOUND', 'Community not found');
      }

      await Promise.all([
        prisma.course.update({
          where: { id: course.id },
          data: { communityId: targetCommunityId },
        }),
        prisma.communityMember.upsert({
          where: { communityId_userId: { communityId: targetCommunityId, userId } },
          create: { communityId: targetCommunityId, userId, role: 'member' },
          update: {},
        }),
      ]);

      return { communityId: targetCommunityId };
    },

    async leaveCommunity(userId: string, communityId: string) {
      await assertCommunityMember(userId, communityId);
      await prisma.communityMember.delete({
        where: { communityId_userId: { communityId, userId } },
      });
      await prisma.course.updateMany({
        where: { userId, communityId },
        data: { communityId: null },
      });
    },

    async getCommunityDetail(userId: string, communityId: string) {
      const settings = await assertCommunityFeatureEnabled();
      const member = await assertCommunityMember(userId, communityId);
      const community = await prisma.community.findUnique({
        where: { id: communityId },
        include: {
          _count: { select: { members: true, posts: true, studyGroups: true } },
        },
      });
      if (!community) throw new AppError('NOT_FOUND', 'Community not found');

      const classmates = await prisma.communityMember.findMany({
        where: {
          communityId,
          userId: { not: userId },
          user: {
            status: 'active',
            OR: [{ communityProfile: null }, { communityProfile: { showInClassmates: true } }],
          },
        },
        take: 30,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              communityProfile: { select: { helpedCount: true, hideStats: true } },
            },
          },
        },
      });

      const pausedSlugs = parseStringArray(settings?.communityPausedCourseSlugsJson);
      const isPaused =
        community.isPaused ||
        pausedSlugs.includes(community.slug) ||
        pausedSlugs.includes(community.normalizedName);

      return {
        id: community.id,
        slug: community.slug,
        displayName: community.displayName,
        universityName: community.universityName,
        isPaused,
        myRole: member.role,
        memberCount: community._count.members,
        postCount: community._count.posts,
        groupCount: community._count.studyGroups,
        examNotice: settings?.communityExamNoticeEnabled
          ? { enabled: true, message: settings.communityExamNoticeMessage }
          : { enabled: false, message: null },
        classmates: classmates.map((c) => ({
          ...formatAuthor(c.user, false),
          role: c.role,
        })),
      };
    },

    async listPosts(
      userId: string,
      communityId: string,
      query: {
        cursor?: string;
        limit: number;
        filter: 'all' | 'unanswered' | 'my_questions' | 'my_answers' | 'resources';
        topic?: string;
        q?: string;
      },
    ) {
      await assertCommunityFeatureEnabled();
      await assertCommunityMember(userId, communityId);
      const blockedIds = Array.from(await getBlockedUserIds(userId));

      const where: Record<string, unknown> = {
        communityId,
        hidden: false,
        ...(blockedIds.length ? { authorId: { notIn: blockedIds } } : {}),
        ...(query.filter === 'unanswered' ? { status: 'unanswered' } : {}),
        ...(query.filter === 'my_questions' ? { authorId: userId, type: 'question' } : {}),
        ...(query.filter === 'my_answers'
          ? { replies: { some: { authorId: userId, hidden: false } } }
          : {}),
        ...(query.filter === 'resources' ? { type: 'resource' } : {}),
        ...(query.topic ? { topicTag: { equals: query.topic, mode: 'insensitive' } } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' } },
                { body: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const rows = await prisma.communityPost.findMany({
        where,
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              communityProfile: { select: { helpedCount: true, hideStats: true } },
            },
          },
          attachments: {
            select: { id: true, originalName: true, mimeType: true, kind: true, sizeBytes: true },
          },
        },
      });

      const hasMore = rows.length > query.limit;
      const items = hasMore ? rows.slice(0, query.limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]!.id : null;

      const postIds = items.map((p) => p.id);
      const myVotes = postIds.length
        ? await prisma.communityVote.findMany({
            where: { userId, targetType: 'post', targetId: { in: postIds } },
            select: { targetId: true },
          })
        : [];
      const votedSet = new Set(myVotes.map((v) => v.targetId));

      return {
        items: items.map((p) => ({
          id: p.id,
          communityId: p.communityId,
          type: p.type,
          title: p.title,
          body: p.body,
          topicTag: p.topicTag,
          status: p.status,
          isAnonymous: p.isAnonymous,
          isPinned: p.isPinned,
          acceptedReplyId: p.acceptedReplyId,
          helpfulCount: p.helpfulCount,
          replyCount: p.replyCount,
          aiAttempt: p.aiAttempt,
          hasVoted: votedSet.has(p.id),
          isOwn: p.authorId === userId,
          author: formatAuthor(p.author, p.isAnonymous),
          attachments: p.attachments,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        nextCursor,
      };
    },

    async createPost(
      userId: string,
      communityId: string,
      input: {
        type: 'question' | 'discussion' | 'resource' | 'announcement';
        title: string;
        body: string;
        topicTag?: string | null;
        isAnonymous: boolean;
        aiAttempt?: string | null;
        attachmentIds: string[];
      },
    ) {
      const settings = await assertCommunityFeatureEnabled();
      await assertRulesAccepted(userId);
      const member = await assertCommunityMember(userId, communityId);

      if (member.mutedUntil && member.mutedUntil > new Date()) {
        throw new AppError('FORBIDDEN', 'You are temporarily muted in this course community.');
      }
      if (
        input.type === 'announcement' &&
        member.role !== 'course_rep' &&
        member.role !== 'moderator'
      ) {
        throw new AppError('FORBIDDEN', 'Only course reps or moderators can post announcements.');
      }

      const community = await prisma.community.findUnique({ where: { id: communityId } });
      if (!community) throw new AppError('NOT_FOUND', 'Community not found');
      const pausedSlugs = parseStringArray(settings?.communityPausedCourseSlugsJson);
      if (
        input.type === 'question' &&
        (community.isPaused ||
          pausedSlugs.includes(community.slug) ||
          pausedSlugs.includes(community.normalizedName))
      ) {
        throw new AppError(
          'FORBIDDEN',
          'Question posting is temporarily paused in this course during the exam period.',
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });

      const title = sanitizeCommunityText(input.title, 200);
      const body = sanitizeCommunityText(input.body, 10_000);
      const aiAttempt = input.aiAttempt ? sanitizeCommunityText(input.aiAttempt, 6000) : null;

      // Spam / duplicate check in last 5 minutes
      const recentDup = await prisma.communityPost.findFirst({
        where: {
          communityId,
          authorId: userId,
          title: { equals: title, mode: 'insensitive' },
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      });
      if (recentDup) {
        throw new AppError(
          'CONFLICT',
          'Duplicate post detected. Please wait before posting again.',
        );
      }

      const adminBlockDomains = parseStringArray(settings?.recommendationBlockDomainsJson);
      try {
        assertSafeCommunityLinks(
          `${title} ${body}`,
          user?.createdAt ?? new Date(),
          adminBlockDomains,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'NEW_ACCOUNT_LINK_LIMIT') {
          throw new AppError(
            'FORBIDDEN',
            'New accounts (<24h) can include at most 1 link per post.',
          );
        }
        throw new AppError('VALIDATION_ERROR', 'Post contains a blocked or unsafe domain.');
      }

      const bannedWords = parseStringArray(settings?.communityBannedWordsJson);
      const profanity = checkProfanityAndBannedWords(`${title}\n${body}`, bannedWords);

      const post = await prisma.communityPost.create({
        data: {
          communityId,
          authorId: userId,
          type: input.type,
          title,
          body,
          topicTag: input.topicTag?.trim() || null,
          status: input.type === 'question' ? 'unanswered' : 'answered',
          isAnonymous: input.isAnonymous,
          aiAttempt,
          flaggedByFilter: profanity.flagged,
          flagReason: profanity.reason,
        },
      });

      if (input.attachmentIds.length > 0) {
        await prisma.communityAttachment.updateMany({
          where: { id: { in: input.attachmentIds }, userId, postId: null },
          data: { postId: post.id },
        });
      }

      return { id: post.id, flaggedByFilter: post.flaggedByFilter };
    },

    async getPostDetail(userId: string, postId: string) {
      await assertCommunityFeatureEnabled();
      const post = await prisma.communityPost.findUnique({
        where: { id: postId },
        include: {
          community: { select: { id: true, displayName: true, universityName: true } },
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              communityProfile: { select: { helpedCount: true, hideStats: true } },
            },
          },
          attachments: true,
        },
      });
      if (!post || post.hidden) throw new AppError('NOT_FOUND', 'Post not found');
      const member = await assertCommunityMember(userId, post.communityId);
      const blockedIds = await getBlockedUserIds(userId);
      if (post.authorId && blockedIds.has(post.authorId)) {
        throw new AppError('NOT_FOUND', 'Post not found');
      }

      const blockedList = Array.from(blockedIds);
      const replies = await prisma.communityReply.findMany({
        where: {
          postId: post.id,
          hidden: false,
          ...(blockedList.length ? { authorId: { notIn: blockedList } } : {}),
        },
        orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'asc' }],
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              communityProfile: { select: { helpedCount: true, hideStats: true } },
            },
          },
          attachments: true,
        },
      });

      const targetIds = [post.id, ...replies.map((r) => r.id)];
      const votes = await prisma.communityVote.findMany({
        where: { userId, targetId: { in: targetIds } },
        select: { targetId: true },
      });
      const votedSet = new Set(votes.map((v) => v.targetId));

      // Sort accepted answer first, then helpfulCount desc
      const sortedReplies = [...replies].sort((a, b) => {
        if (a.id === post.acceptedReplyId) return -1;
        if (b.id === post.acceptedReplyId) return 1;
        if (b.helpfulCount !== a.helpfulCount) return b.helpfulCount - a.helpfulCount;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      return {
        post: {
          id: post.id,
          communityId: post.communityId,
          communityName: post.community.displayName,
          type: post.type,
          title: post.title,
          body: post.body,
          topicTag: post.topicTag,
          status: post.status,
          isAnonymous: post.isAnonymous,
          isPinned: post.isPinned,
          acceptedReplyId: post.acceptedReplyId,
          helpfulCount: post.helpfulCount,
          replyCount: post.replyCount,
          aiAttempt: post.aiAttempt,
          hasVoted: votedSet.has(post.id),
          isOwn: post.authorId === userId,
          myRole: member.role,
          author: formatAuthor(post.author, post.isAnonymous),
          attachments: post.attachments,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        },
        replies: sortedReplies.map((r) => ({
          id: r.id,
          postId: r.postId,
          parentReplyId: r.parentReplyId,
          body: r.body,
          isAnonymous: r.isAnonymous,
          isAiGenerated: r.isAiGenerated,
          isAccepted: r.id === post.acceptedReplyId,
          helpfulCount: r.helpfulCount,
          hasVoted: votedSet.has(r.id),
          isOwn: r.authorId === userId,
          author: formatAuthor(r.author, r.isAnonymous),
          attachments: r.attachments,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      };
    },

    async updatePost(
      userId: string,
      postId: string,
      input: {
        title?: string;
        body?: string;
        topicTag?: string | null;
        status?: 'unanswered' | 'answered' | 'resolved';
      },
    ) {
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post || post.hidden) throw new AppError('NOT_FOUND', 'Post not found');
      if (post.authorId !== userId)
        throw new AppError('FORBIDDEN', 'Only the author can edit this post');

      return prisma.communityPost.update({
        where: { id: post.id },
        data: {
          ...(input.title !== undefined ? { title: sanitizeCommunityText(input.title, 200) } : {}),
          ...(input.body !== undefined ? { body: sanitizeCommunityText(input.body, 10_000) } : {}),
          ...(input.topicTag !== undefined ? { topicTag: input.topicTag?.trim() || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
    },

    async deletePost(userId: string, postId: string) {
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post) throw new AppError('NOT_FOUND', 'Post not found');
      const member = await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: post.communityId, userId } },
      });
      const isMod = member?.role === 'moderator' || member?.role === 'course_rep';
      if (post.authorId !== userId && !isMod) {
        throw new AppError('FORBIDDEN', 'You cannot delete this post');
      }
      await prisma.communityPost.update({ where: { id: post.id }, data: { hidden: true } });
    },

    async createReply(
      userId: string,
      postId: string,
      input: {
        body: string;
        parentReplyId?: string | null;
        isAnonymous: boolean;
        isAiGenerated: boolean;
        attachmentIds: string[];
      },
    ) {
      const settings = await assertCommunityFeatureEnabled();
      await assertRulesAccepted(userId);
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post || post.hidden) throw new AppError('NOT_FOUND', 'Post not found');
      await assertCommunityMember(userId, post.communityId);

      const blockedIds = await getBlockedUserIds(userId);
      if (post.authorId && blockedIds.has(post.authorId)) {
        throw new AppError('FORBIDDEN', 'You cannot reply to this post.');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });
      const body = sanitizeCommunityText(input.body, 6000);
      const adminBlockDomains = parseStringArray(settings?.recommendationBlockDomainsJson);
      try {
        assertSafeCommunityLinks(body, user?.createdAt ?? new Date(), adminBlockDomains);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'NEW_ACCOUNT_LINK_LIMIT') {
          throw new AppError(
            'FORBIDDEN',
            'New accounts (<24h) can include at most 1 link per reply.',
          );
        }
        throw new AppError('VALIDATION_ERROR', 'Reply contains a blocked or unsafe domain.');
      }

      const bannedWords = parseStringArray(settings?.communityBannedWordsJson);
      const profanity = checkProfanityAndBannedWords(body, bannedWords);

      const reply = await prisma.communityReply.create({
        data: {
          postId: post.id,
          parentReplyId: input.parentReplyId ?? null,
          authorId: userId,
          body,
          isAnonymous: input.isAnonymous,
          isAiGenerated: input.isAiGenerated,
          flaggedByFilter: profanity.flagged,
        },
      });

      if (input.attachmentIds.length > 0) {
        await prisma.communityAttachment.updateMany({
          where: { id: { in: input.attachmentIds }, userId, replyId: null },
          data: { replyId: reply.id },
        });
      }

      await prisma.communityPost.update({
        where: { id: post.id },
        data: {
          replyCount: { increment: 1 },
          ...(post.status === 'unanswered' ? { status: 'answered' } : {}),
        },
      });

      if (post.authorId && post.authorId !== userId) {
        await sendCommunityNotification({
          recipientId: post.authorId,
          prefField: post.type === 'question' ? 'inAppAnswer' : 'inAppReply',
          title:
            post.type === 'question' ? 'New answer to your question' : 'New reply to your post',
          body: `Someone replied to "${post.title}".`,
          occurrenceKey: `comm_reply:${reply.id}`,
        });
      }

      return { id: reply.id, flaggedByFilter: reply.flaggedByFilter };
    },

    async acceptReply(userId: string, postId: string, replyId: string) {
      const post = await prisma.communityPost.findUnique({ where: { id: postId } });
      if (!post || post.hidden) throw new AppError('NOT_FOUND', 'Post not found');
      if (post.authorId !== userId) {
        throw new AppError('FORBIDDEN', 'Only the question author can accept an answer');
      }
      const reply = await prisma.communityReply.findFirst({
        where: { id: replyId, postId: post.id, hidden: false },
      });
      if (!reply) throw new AppError('NOT_FOUND', 'Reply not found');

      await prisma.communityPost.update({
        where: { id: post.id },
        data: { acceptedReplyId: reply.id, status: 'resolved' },
      });

      if (reply.authorId && reply.authorId !== userId) {
        await prisma.userCommunityProfile.upsert({
          where: { userId: reply.authorId },
          create: { userId: reply.authorId, helpedCount: 1, acceptedCount: 1 },
          update: { helpedCount: { increment: 1 }, acceptedCount: { increment: 1 } },
        });
        await sendCommunityNotification({
          recipientId: reply.authorId,
          prefField: 'inAppAccepted',
          title: 'Your answer was accepted!',
          body: `Your answer on "${post.title}" was marked as accepted.`,
          occurrenceKey: `comm_accept:${post.id}:${reply.id}`,
        });
      }
      return { acceptedReplyId: reply.id, status: 'resolved' };
    },

    async toggleVote(userId: string, targetType: 'post' | 'reply' | 'resource', targetId: string) {
      const existing = await prisma.communityVote.findUnique({
        where: { userId_targetType_targetId: { userId, targetType, targetId } },
      });

      const delta = existing ? -1 : 1;
      if (existing) {
        await prisma.communityVote.delete({ where: { id: existing.id } });
      } else {
        await prisma.communityVote.create({ data: { userId, targetType, targetId } });
      }

      if (targetType === 'post') {
        const updated = await prisma.communityPost.update({
          where: { id: targetId },
          data: { helpfulCount: { increment: delta } },
          select: { helpfulCount: true },
        });
        return { voted: !existing, helpfulCount: Math.max(0, updated.helpfulCount) };
      }
      if (targetType === 'reply') {
        const updated = await prisma.communityReply.update({
          where: { id: targetId },
          data: { helpfulCount: { increment: delta } },
          select: { helpfulCount: true, authorId: true },
        });
        if (!existing && updated.authorId && updated.authorId !== userId) {
          await prisma.userCommunityProfile.upsert({
            where: { userId: updated.authorId },
            create: { userId: updated.authorId, helpedCount: 1 },
            update: { helpedCount: { increment: 1 } },
          });
        }
        return { voted: !existing, helpfulCount: Math.max(0, updated.helpfulCount) };
      }
      const updated = await prisma.sharedResource.update({
        where: { id: targetId },
        data: { helpfulCount: { increment: delta } },
        select: { helpfulCount: true },
      });
      return { voted: !existing, helpfulCount: Math.max(0, updated.helpfulCount) };
    },

    async askAwalFirst(
      userId: string,
      input: { title: string; body: string; mode: 'ask_first' | 'draft_helper' },
    ) {
      await assertCommunityFeatureEnabled();
      await enforceAiQuota(prisma, userId, dailyTokenLimit);
      if (!llm || !llm.isConfigured()) {
        throw new AppError('AI_UNAVAILABLE', 'AWAL AI is not configured right now.');
      }

      const start = Date.now();
      const systemPrompt =
        input.mode === 'ask_first'
          ? 'You are AWAL, a helpful university tutor in LearnSpace. Give a clear, concise explanation with step-by-step math (using $...$ or $$...$$) so the student can understand the concept immediately.'
          : 'You are AWAL. Draft a concise, friendly explanation to help a student answer a classmate’s question clearly. Include math in LaTeX if relevant.';

      try {
        const res = await llm.generateText(
          `Question title: ${input.title}\nDetails: ${input.body}`,
          { systemPrompt, temperature: 0.3, maxOutputTokens: 900 },
        );
        await recordUsageEvent(prisma, {
          userId,
          feature: 'community_ai',
          model: llm.modelName,
          tokensIn: res.usage?.inputTokens ?? 0,
          tokensOut: res.usage?.outputTokens ?? 0,
          durationMs: Date.now() - start,
          status: 'success',
          route: `community:${input.mode}`,
        });
        return { answer: res.text, isAiGenerated: true };
      } catch (err) {
        logger.warn({ err }, 'Community AWAL helper failed');
        throw new AppError('AI_PROVIDER_ERROR', 'AWAL could not generate an answer right now.');
      }
    },

    async reportContent(
      userId: string,
      input: {
        targetType: 'post' | 'reply' | 'message' | 'resource' | 'user';
        targetId: string;
        reason: string;
      },
    ) {
      let targetUserId: string | null = null;
      if (input.targetType === 'post') {
        const p = await prisma.communityPost.findUnique({ where: { id: input.targetId } });
        targetUserId = p?.authorId ?? null;
      } else if (input.targetType === 'reply') {
        const r = await prisma.communityReply.findUnique({ where: { id: input.targetId } });
        targetUserId = r?.authorId ?? null;
      } else if (input.targetType === 'message') {
        const m = await prisma.studyGroupMessage.findUnique({ where: { id: input.targetId } });
        targetUserId = m?.authorId ?? null;
      } else if (input.targetType === 'resource') {
        const sr = await prisma.sharedResource.findUnique({ where: { id: input.targetId } });
        targetUserId = sr?.authorId ?? null;
      } else if (input.targetType === 'user') {
        targetUserId = input.targetId;
      }

      const report = await prisma.communityReport.create({
        data: {
          reporterId: userId,
          targetType: input.targetType,
          targetId: input.targetId,
          targetUserId,
          reason: sanitizeCommunityText(input.reason, 600),
        },
      });
      return { id: report.id, status: report.status };
    },

    async blockUser(userId: string, blockedId: string) {
      if (userId === blockedId)
        throw new AppError('VALIDATION_ERROR', 'You cannot block yourself.');
      await prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId } },
        create: { blockerId: userId, blockedId },
        update: {},
      });
      return { blocked: true };
    },

    async unblockUser(userId: string, blockedId: string) {
      await prisma.userBlock.deleteMany({
        where: { blockerId: userId, blockedId },
      });
      return { blocked: false };
    },

    async moderateInCommunity(
      userId: string,
      communityId: string,
      input: {
        action: 'pin' | 'unpin' | 'hide' | 'unhide' | 'delete' | 'mute_user';
        targetType: 'post' | 'reply' | 'resource' | 'user';
        targetId: string;
        reason?: string;
        muteHours: number;
      },
    ) {
      const member = await assertCommunityMember(userId, communityId);
      if (member.role !== 'moderator' && member.role !== 'course_rep') {
        throw new AppError(
          'FORBIDDEN',
          'Only community moderators or course reps can perform this action.',
        );
      }

      if (input.targetType === 'post') {
        const post = await prisma.communityPost.findFirst({
          where: { id: input.targetId, communityId },
        });
        if (!post) throw new AppError('NOT_FOUND', 'Post not found in this community');
        if (input.action === 'pin' || input.action === 'unpin') {
          await prisma.communityPost.update({
            where: { id: post.id },
            data: { isPinned: input.action === 'pin' },
          });
        } else if (
          input.action === 'hide' ||
          input.action === 'delete' ||
          input.action === 'unhide'
        ) {
          await prisma.communityPost.update({
            where: { id: post.id },
            data: { hidden: input.action !== 'unhide' },
          });
        }
      } else if (input.targetType === 'reply') {
        await prisma.communityReply.updateMany({
          where: { id: input.targetId, post: { communityId } },
          data: { hidden: input.action !== 'unhide' },
        });
      } else if (input.targetType === 'resource') {
        await prisma.sharedResource.updateMany({
          where: { id: input.targetId, communityId },
          data: { hidden: input.action !== 'unhide' },
        });
      } else if (input.targetType === 'user' && input.action === 'mute_user') {
        const until = new Date(Date.now() + input.muteHours * 60 * 60 * 1000);
        await prisma.communityMember.updateMany({
          where: { communityId, userId: input.targetId },
          data: { mutedUntil: until },
        });
      }

      await prisma.moderationAction.create({
        data: {
          communityId,
          actorId: userId,
          targetUserId: input.targetType === 'user' ? input.targetId : null,
          targetType: input.targetType,
          targetId: input.targetId,
          action: input.action,
          reason: input.reason?.slice(0, 500) ?? null,
        },
      });
      return { ok: true };
    },

    async getNotificationPreferences(userId: string) {
      return prisma.communityNotificationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    },

    async updateNotificationPreferences(
      userId: string,
      input: Record<string, boolean | undefined>,
    ) {
      return prisma.communityNotificationPreference.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
    },
  };
}
