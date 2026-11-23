import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { helperBadgeForCount } from './community.safety';
import type { CommunityAuthorView } from './community.service';

export interface CommunityHubCoreDeps {
  prisma: PrismaClient;
  assertCommunityFeatureEnabled: () => Promise<{ featureShsCommunity?: boolean | null } | null>;
  getBlockedUserIds: (userId: string) => Promise<Set<string>>;
  ensureCommunityProfile: (userId: string) => Promise<{
    helpedCount: number;
    acceptedCount: number;
    hideStats: boolean;
    showInClassmates: boolean;
    rulesAcceptedAt: Date | null;
  }>;
  syncCourseToCommunity: (userId: string, courseId: string) => Promise<string>;
  formatAuthor: (
    author: {
      id: string;
      name: string;
      avatarUrl: string | null;
      communityProfile?: { helpedCount: number; hideStats: boolean } | null;
    } | null,
    isAnonymous: boolean,
  ) => CommunityAuthorView;
  sendCommunityNotification: (params: {
    recipientId: string;
    prefField: 'inAppAnswer' | 'inAppAccepted' | 'inAppReply' | 'inAppGroupInvite' | 'inAppMention';
    title: string;
    body: string;
    occurrenceKey: string;
  }) => Promise<void>;
}

export function createCommunityHubService(deps: CommunityHubCoreDeps) {
  const {
    prisma,
    assertCommunityFeatureEnabled,
    getBlockedUserIds,
    ensureCommunityProfile,
    syncCourseToCommunity,
    formatAuthor,
    sendCommunityNotification,
  } = deps;

  async function requireScopedUser(userId: string) {
    const settings = await assertCommunityFeatureEnabled();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        learnerType: true,
        schoolYear: true,
        programme: true,
        university: true,
      },
    });
    if (!user) throw new AppError('UNAUTHENTICATED', 'User not found');
    if (user.learnerType === 'shs' && settings?.featureShsCommunity === false) {
      throw new AppError('FORBIDDEN', 'SHS community is currently paused by an administrator.');
    }
    return user;
  }

  return {
    async getDashboard(userId: string) {
      const user = await requireScopedUser(userId);
      const scope = user.learnerType;

      const [profile, courses, blockedIds] = await Promise.all([
        ensureCommunityProfile(userId),
        prisma.course.findMany({
          where: { userId, archivedAt: null },
          select: { id: true, communityId: true },
        }),
        getBlockedUserIds(userId),
      ]);

      for (const c of courses) {
        if (!c.communityId) {
          await syncCourseToCommunity(userId, c.id).catch(() => undefined);
        }
      }

      const blockedList = Array.from(blockedIds);
      const [
        myMemberships,
        myGroupMemberships,
        myFollows,
        myBookmarks,
        scopeCommunities,
        trendingPosts,
        suggestedGroupsRaw,
        candidateUsers,
        recentPosts,
        recentResources,
        recentGroups,
        totalStudents,
        totalPosts,
        solvedDiscussions,
        totalGroups,
        totalResources,
      ] = await Promise.all([
        prisma.communityMember.findMany({
          where: { userId },
          select: { communityId: true, role: true },
        }),
        prisma.studyGroupMember.findMany({
          where: { userId },
          select: { groupId: true },
        }),
        prisma.communityFollow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        }),
        prisma.communityBookmark.findMany({
          where: { userId },
          select: { postId: true },
        }),
        prisma.community.findMany({
          where: { learnerScope: scope },
          include: {
            _count: { select: { members: true, posts: true, studyGroups: true } },
          },
          orderBy: [{ members: { _count: 'desc' } }, { posts: { _count: 'desc' } }],
          take: 12,
        }),
        prisma.communityPost.findMany({
          where: {
            hidden: false,
            community: { learnerScope: scope },
            ...(blockedList.length ? { authorId: { notIn: blockedList } } : {}),
          },
          orderBy: [{ helpfulCount: 'desc' }, { replyCount: 'desc' }, { createdAt: 'desc' }],
          take: 6,
          include: {
            community: { select: { id: true, displayName: true } },
            author: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                communityProfile: { select: { helpedCount: true, hideStats: true } },
              },
            },
          },
        }),
        prisma.studyGroup.findMany({
          where: {
            visibility: 'public_course',
            community: { learnerScope: scope },
            members: { none: { userId } },
          },
          include: {
            community: { select: { id: true, displayName: true } },
            _count: { select: { members: true, messages: true } },
          },
          orderBy: [{ members: { _count: 'desc' } }, { createdAt: 'desc' }],
          take: 6,
        }),
        prisma.user.findMany({
          where: {
            id: { notIn: [userId, ...blockedList] },
            learnerType: scope,
            status: 'active',
            OR: [{ communityProfile: { showInClassmates: true } }, { communityProfile: null }],
          },
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            schoolYear: true,
            programme: true,
            university: true,
            communityProfile: {
              select: { helpedCount: true, acceptedCount: true, hideStats: true },
            },
            communityMemberships: { select: { communityId: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 18,
        }),
        prisma.communityPost.findMany({
          where: {
            hidden: false,
            community: { learnerScope: scope },
            ...(blockedList.length ? { authorId: { notIn: blockedList } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: {
            community: { select: { id: true, displayName: true } },
            author: { select: { id: true, name: true } },
          },
        }),
        prisma.sharedResource.findMany({
          where: {
            hidden: false,
            community: { learnerScope: scope },
            ...(blockedList.length ? { authorId: { notIn: blockedList } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
          include: {
            community: { select: { id: true, displayName: true } },
            author: { select: { id: true, name: true } },
          },
        }),
        prisma.studyGroup.findMany({
          where: {
            visibility: 'public_course',
            community: { learnerScope: scope },
          },
          orderBy: { createdAt: 'desc' },
          take: 4,
          include: {
            community: { select: { id: true, displayName: true } },
          },
        }),
        prisma.user.count({ where: { learnerType: scope, status: 'active' } }),
        prisma.communityPost.count({
          where: { hidden: false, community: { learnerScope: scope } },
        }),
        prisma.communityPost.count({
          where: { hidden: false, status: 'resolved', community: { learnerScope: scope } },
        }),
        prisma.studyGroup.count({ where: { community: { learnerScope: scope } } }),
        prisma.sharedResource.count({
          where: { hidden: false, community: { learnerScope: scope } },
        }),
      ]);

      const joinedSet = new Set(myMemberships.map((m) => m.communityId));
      const followingSet = new Set(myFollows.map((f) => f.followingId));

      const suggestedStudents = candidateUsers
        .map((peer) => {
          const sharedCount = peer.communityMemberships.filter((m) =>
            joinedSet.has(m.communityId),
          ).length;
          const helped = peer.communityProfile?.helpedCount ?? 0;
          const hideStats = peer.communityProfile?.hideStats ?? false;
          return {
            id: peer.id,
            name: peer.name,
            avatarUrl: peer.avatarUrl,
            subtitle:
              scope === 'shs'
                ? [peer.schoolYear, peer.programme].filter(Boolean).join(' · ') || 'SHS Student'
                : peer.university || 'University Student',
            sharedCount,
            helpedCount: hideStats ? 0 : helped,
            badge: hideStats ? null : helperBadgeForCount(helped),
            isFollowing: followingSet.has(peer.id),
            score: sharedCount * 10 + helped,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      const recentActivities = [
        ...recentPosts.map((p) => ({
          id: `post:${p.id}`,
          kind: p.type === 'question' ? ('question' as const) : ('post' as const),
          actorName: p.isAnonymous ? 'Anonymous student' : (p.author?.name ?? 'Student'),
          title: p.title,
          targetName: p.community.displayName,
          communityId: p.community.id,
          postId: p.id,
          groupId: null as string | null,
          createdAt: p.createdAt,
        })),
        ...recentResources.map((r) => ({
          id: `res:${r.id}`,
          kind: 'resource' as const,
          actorName: r.author?.name ?? 'Student',
          title: r.title,
          targetName: r.community.displayName,
          communityId: r.community.id,
          postId: null as string | null,
          groupId: r.groupId,
          createdAt: r.createdAt,
        })),
        ...recentGroups.map((g) => ({
          id: `grp:${g.id}`,
          kind: 'group' as const,
          actorName: 'Study Group',
          title: g.name,
          targetName: g.community.displayName,
          communityId: g.community.id,
          postId: null as string | null,
          groupId: g.id,
          createdAt: g.createdAt,
        })),
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8);

      return {
        learnerType: scope,
        userSummary: {
          id: user.id,
          name: user.name,
          schoolYear: user.schoolYear,
          programme: user.programme,
          university: user.university,
        },
        rulesAccepted: Boolean(profile.rulesAcceptedAt),
        stats: {
          totalStudents,
          totalPosts,
          solvedDiscussions,
          totalGroups,
          totalResources,
          followingCount: followingSet.size,
          joinedSubjectsCount: joinedSet.size,
          myGroupsCount: myGroupMemberships.length,
        },
        popularSubjects: scopeCommunities.map((c) => ({
          id: c.id,
          slug: c.slug,
          displayName: c.displayName,
          universityName: c.universityName,
          isPaused: c.isPaused,
          memberCount: c._count.members,
          postCount: c._count.posts,
          groupCount: c._count.studyGroups,
          isJoined: joinedSet.has(c.id),
        })),
        trendingDiscussions: trendingPosts.map((p) => ({
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
        suggestedGroups: suggestedGroupsRaw.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          visibility: g.visibility,
          communityId: g.communityId,
          communityName: g.community.displayName,
          memberCount: g._count.members,
          messageCount: g._count.messages,
        })),
        suggestedStudents,
        recentActivities,
        myBookmarkedIds: myBookmarks.map((b) => b.postId),
        myFollowingIds: myFollows.map((f) => f.followingId),
      };
    },

    async listFeed(
      userId: string,
      params: {
        filter?: 'all' | 'following' | 'unanswered' | 'trending' | 'resources' | 'bookmarks';
        type?: 'all' | 'question' | 'discussion' | 'resource' | 'announcement';
        communityId?: string;
        q?: string;
        cursor?: string;
        limit?: number;
      },
    ) {
      const user = await requireScopedUser(userId);
      const blockedIds = await getBlockedUserIds(userId);
      const blockedList = Array.from(blockedIds);
      const limit = Math.min(30, Math.max(5, params.limit ?? 15));

      const followingRows =
        params.filter === 'following'
          ? await prisma.communityFollow.findMany({
              where: { followerId: userId },
              select: { followingId: true },
            })
          : [];
      const followingIds = followingRows.map((f) => f.followingId);

      if (params.filter === 'following' && followingIds.length === 0) {
        return { items: [], nextCursor: null };
      }

      const where: Record<string, unknown> = {
        hidden: false,
        community: { learnerScope: user.learnerType },
        ...(params.communityId ? { communityId: params.communityId } : {}),
        ...(blockedList.length ? { authorId: { notIn: blockedList } } : {}),
      };

      if (params.type && params.type !== 'all') {
        where.type = params.type;
      }
      if (params.filter === 'unanswered') {
        where.status = 'unanswered';
      } else if (params.filter === 'resources') {
        where.type = 'resource';
      } else if (params.filter === 'bookmarks') {
        where.bookmarks = { some: { userId } };
      } else if (params.filter === 'following') {
        where.authorId = { in: followingIds };
        where.isAnonymous = false;
      }

      if (params.q?.trim()) {
        const q = params.q.trim();
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
          { topicTag: { contains: q, mode: 'insensitive' } },
          { community: { displayName: { contains: q, mode: 'insensitive' } } },
        ];
      }

      const orderBy =
        params.filter === 'trending'
          ? [
              { helpfulCount: 'desc' as const },
              { replyCount: 'desc' as const },
              { createdAt: 'desc' as const },
            ]
          : [{ isPinned: 'desc' as const }, { createdAt: 'desc' as const }];

      const rows = await prisma.communityPost.findMany({
        where,
        orderBy,
        take: limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        include: {
          community: { select: { id: true, displayName: true } },
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

      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const postIds = sliced.map((p) => p.id);

      const [votes, bookmarks] = postIds.length
        ? await Promise.all([
            prisma.communityVote.findMany({
              where: { userId, targetType: 'post', targetId: { in: postIds } },
              select: { targetId: true },
            }),
            prisma.communityBookmark.findMany({
              where: { userId, postId: { in: postIds } },
              select: { postId: true },
            }),
          ])
        : [[], []];

      const votedSet = new Set(votes.map((v) => v.targetId));
      const bookmarkedSet = new Set(bookmarks.map((b) => b.postId));

      return {
        items: sliced.map((p) => ({
          id: p.id,
          communityId: p.communityId,
          communityName: p.community.displayName,
          type: p.type,
          title: p.title,
          body: p.body,
          topicTag: p.topicTag,
          status: p.status,
          isAnonymous: p.isAnonymous,
          isPinned: p.isPinned,
          acceptedReplyId: p.acceptedReplyId,
          replyCount: p.replyCount,
          helpfulCount: p.helpfulCount,
          hasVoted: votedSet.has(p.id),
          isBookmarked: bookmarkedSet.has(p.id),
          isOwn: p.authorId === userId,
          createdAt: p.createdAt,
          author: formatAuthor(p.author, p.isAnonymous),
          attachments: p.attachments,
        })),
        nextCursor: hasMore ? sliced[sliced.length - 1]!.id : null,
      };
    },

    async discover(userId: string, q?: string) {
      const user = await requireScopedUser(userId);
      const scope = user.learnerType;
      const blockedList = Array.from(await getBlockedUserIds(userId));
      const search = q?.trim();

      const [myMemberships, myFollows, communities, students, recentTags] = await Promise.all([
        prisma.communityMember.findMany({ where: { userId }, select: { communityId: true } }),
        prisma.communityFollow.findMany({
          where: { followerId: userId },
          select: { followingId: true },
        }),
        prisma.community.findMany({
          where: {
            learnerScope: scope,
            ...(search ? { displayName: { contains: search, mode: 'insensitive' } } : {}),
          },
          include: {
            _count: { select: { members: true, posts: true, studyGroups: true } },
          },
          orderBy: [{ members: { _count: 'desc' } }, { displayName: 'asc' }],
          take: 30,
        }),
        prisma.user.findMany({
          where: {
            id: { notIn: [userId, ...blockedList] },
            learnerType: scope,
            status: 'active',
            OR: [{ communityProfile: { showInClassmates: true } }, { communityProfile: null }],
            ...(search
              ? {
                  AND: [
                    {
                      OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { programme: { contains: search, mode: 'insensitive' } },
                        { university: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            schoolYear: true,
            programme: true,
            university: true,
            communityProfile: { select: { helpedCount: true, hideStats: true } },
            communityMemberships: { select: { communityId: true } },
          },
          take: 24,
        }),
        prisma.communityPost.findMany({
          where: {
            hidden: false,
            topicTag: { not: null },
            community: { learnerScope: scope },
          },
          select: { topicTag: true },
          orderBy: { createdAt: 'desc' },
          take: 60,
        }),
      ]);

      const joinedSet = new Set(myMemberships.map((m) => m.communityId));
      const followingSet = new Set(myFollows.map((f) => f.followingId));

      const tagCounts = new Map<string, number>();
      for (const t of recentTags) {
        if (!t.topicTag) continue;
        tagCounts.set(t.topicTag, (tagCounts.get(t.topicTag) ?? 0) + 1);
      }

      return {
        communities: communities.map((c) => ({
          id: c.id,
          slug: c.slug,
          displayName: c.displayName,
          universityName: c.universityName,
          isPaused: c.isPaused,
          memberCount: c._count.members,
          postCount: c._count.posts,
          groupCount: c._count.studyGroups,
          isJoined: joinedSet.has(c.id),
        })),
        students: students.map((s) => {
          const sharedCount = s.communityMemberships.filter((m) =>
            joinedSet.has(m.communityId),
          ).length;
          const helped = s.communityProfile?.helpedCount ?? 0;
          const hideStats = s.communityProfile?.hideStats ?? false;
          return {
            id: s.id,
            name: s.name,
            avatarUrl: s.avatarUrl,
            subtitle:
              scope === 'shs'
                ? [s.schoolYear, s.programme].filter(Boolean).join(' · ') || 'SHS Student'
                : s.university || 'University Student',
            sharedCount,
            helpedCount: hideStats ? 0 : helped,
            badge: hideStats ? null : helperBadgeForCount(helped),
            isFollowing: followingSet.has(s.id),
          };
        }),
        popularTags: Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([tag, count]) => ({ tag, count })),
      };
    },

    async joinCommunity(userId: string, communityId: string) {
      const user = await requireScopedUser(userId);
      const community = await prisma.community.findUnique({ where: { id: communityId } });
      if (!community || community.learnerScope !== user.learnerType) {
        throw new AppError('NOT_FOUND', 'Community not found');
      }
      await prisma.communityMember.upsert({
        where: { communityId_userId: { communityId, userId } },
        create: { communityId, userId, role: 'member' },
        update: {},
      });
      return { joined: true, communityId };
    },

    async listGroupsHub(userId: string, params: { communityId?: string; q?: string }) {
      const user = await requireScopedUser(userId);
      const scope = user.learnerType;
      const search = params.q?.trim();

      const [myGroupsRaw, discoverGroupsRaw, communities] = await Promise.all([
        prisma.studyGroupMember.findMany({
          where: {
            userId,
            group: {
              community: { learnerScope: scope },
              ...(params.communityId ? { communityId: params.communityId } : {}),
            },
          },
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
        prisma.studyGroup.findMany({
          where: {
            visibility: 'public_course',
            community: { learnerScope: scope },
            members: { none: { userId } },
            ...(params.communityId ? { communityId: params.communityId } : {}),
            ...(search
              ? {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          include: {
            community: { select: { id: true, displayName: true } },
            _count: { select: { members: true, messages: true } },
          },
          orderBy: [{ members: { _count: 'desc' } }, { createdAt: 'desc' }],
          take: 30,
        }),
        prisma.community.findMany({
          where: { learnerScope: scope },
          select: { id: true, displayName: true },
          orderBy: { displayName: 'asc' },
          take: 50,
        }),
      ]);

      return {
        myGroups: myGroupsRaw
          .filter(
            (gm) =>
              !search ||
              gm.group.name.toLowerCase().includes(search.toLowerCase()) ||
              (gm.group.description ?? '').toLowerCase().includes(search.toLowerCase()),
          )
          .map((gm) => ({
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
        discoverGroups: discoverGroupsRaw.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          visibility: g.visibility,
          communityId: g.communityId,
          communityName: g.community.displayName,
          memberCount: g._count.members,
          messageCount: g._count.messages,
        })),
        communities,
      };
    },

    async toggleFollow(userId: string, targetUserId: string) {
      const user = await requireScopedUser(userId);
      if (userId === targetUserId) {
        throw new AppError('VALIDATION_ERROR', 'You cannot follow yourself.');
      }
      const blockedIds = await getBlockedUserIds(userId);
      if (blockedIds.has(targetUserId)) {
        throw new AppError('FORBIDDEN', 'Cannot follow this user.');
      }

      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          status: true,
          learnerType: true,
          communityProfile: { select: { showInClassmates: true } },
        },
      });
      if (!target || target.status !== 'active' || target.learnerType !== user.learnerType) {
        throw new AppError('NOT_FOUND', 'Student not found');
      }
      if (target.communityProfile?.showInClassmates === false) {
        throw new AppError('FORBIDDEN', 'This student has disabled classmate connections.');
      }

      const existing = await prisma.communityFollow.findUnique({
        where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
      });
      if (existing) {
        await prisma.communityFollow.delete({ where: { id: existing.id } });
        return { following: false };
      }

      await prisma.communityFollow.create({
        data: { followerId: userId, followingId: targetUserId },
      });
      await sendCommunityNotification({
        recipientId: targetUserId,
        prefField: 'inAppGroupInvite',
        title: `${user.name} started following your study updates`,
        body: 'You can manage classmate visibility anytime in Community Privacy settings.',
        occurrenceKey: `follow:${userId}:${targetUserId}`,
      });
      return { following: true };
    },

    async toggleBookmark(userId: string, postId: string) {
      const user = await requireScopedUser(userId);
      const post = await prisma.communityPost.findUnique({
        where: { id: postId },
        include: { community: { select: { learnerScope: true } } },
      });
      if (!post || post.hidden || post.community.learnerScope !== user.learnerType) {
        throw new AppError('NOT_FOUND', 'Discussion post not found');
      }

      const existing = await prisma.communityBookmark.findUnique({
        where: { userId_postId: { userId, postId } },
      });
      if (existing) {
        await prisma.communityBookmark.delete({ where: { id: existing.id } });
        return { bookmarked: false };
      }
      await prisma.communityBookmark.create({ data: { userId, postId } });
      return { bookmarked: true };
    },

    async getLeaderboard(userId: string) {
      const user = await requireScopedUser(userId);
      const scope = user.learnerType;
      const blockedList = Array.from(await getBlockedUserIds(userId));

      const [myProfile, leadersRaw] = await Promise.all([
        ensureCommunityProfile(userId),
        prisma.userCommunityProfile.findMany({
          where: {
            hideStats: false,
            user: {
              learnerType: scope,
              status: 'active',
              ...(blockedList.length ? { id: { notIn: blockedList } } : {}),
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                schoolYear: true,
                programme: true,
                university: true,
              },
            },
          },
          orderBy: [{ helpedCount: 'desc' }, { acceptedCount: 'desc' }, { updatedAt: 'asc' }],
          take: 25,
        }),
      ]);

      const leaders = leadersRaw.map((entry, idx) => ({
        rank: idx + 1,
        userId: entry.user.id,
        name: entry.user.name,
        avatarUrl: entry.user.avatarUrl,
        subtitle:
          scope === 'shs'
            ? [entry.user.schoolYear, entry.user.programme].filter(Boolean).join(' · ') ||
              'SHS Student'
            : entry.user.university || 'University Student',
        helpedCount: entry.helpedCount,
        acceptedCount: entry.acceptedCount,
        badge: helperBadgeForCount(entry.helpedCount),
        isMe: entry.user.id === userId,
      }));

      const myRankIdx = leaders.findIndex((l) => l.userId === userId);
      return {
        learnerType: scope,
        myStats: {
          rank: myRankIdx >= 0 ? myRankIdx + 1 : null,
          helpedCount: myProfile.helpedCount,
          acceptedCount: myProfile.acceptedCount,
          badge: helperBadgeForCount(myProfile.helpedCount),
          hideStats: myProfile.hideStats,
        },
        leaders,
      };
    },
  };
}
