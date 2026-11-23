import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createCommunityHubService } from '../../src/modules/community/community.hub.service';

describe('Community Hub Service (SHS & University isolation, social actions)', () => {
  it('blocks cross-scope community join, follow, and bookmark between SHS and University', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          if (where.id === 'shs-1') {
            return {
              id: 'shs-1',
              name: 'Abena SHS',
              avatarUrl: null,
              learnerType: 'shs',
              schoolYear: 'SHS 2',
              programme: 'Science',
              university: null,
              status: 'active',
            };
          }
          if (where.id === 'uni-1') {
            return {
              id: 'uni-1',
              name: 'Kwame Uni',
              status: 'active',
              learnerType: 'university',
              communityProfile: { showInClassmates: true },
            };
          }
          return null;
        }),
      },
      community: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'comm-uni',
          learnerScope: 'university',
        }),
      },
      communityPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'post-uni',
          hidden: false,
          community: { learnerScope: 'university' },
        }),
      },
    } as unknown as PrismaClient;

    const hub = createCommunityHubService({
      prisma,
      assertCommunityFeatureEnabled: async () => ({ featureShsCommunity: true }),
      getBlockedUserIds: async () => new Set(),
      ensureCommunityProfile: async () => ({
        helpedCount: 0,
        acceptedCount: 0,
        hideStats: false,
        showInClassmates: true,
        rulesAcceptedAt: new Date(),
      }),
      syncCourseToCommunity: async () => 'c1',
      formatAuthor: (a) => ({ id: a?.id ?? null, name: a?.name ?? 'User', avatarUrl: null }),
      sendCommunityNotification: async () => undefined,
    });

    await expect(hub.joinCommunity('shs-1', 'comm-uni')).rejects.toThrow(/Community not found/i);
    await expect(hub.toggleFollow('shs-1', 'uni-1')).rejects.toThrow(/Student not found/i);
    await expect(hub.toggleBookmark('shs-1', 'post-uni')).rejects.toThrow(
      /Discussion post not found/i,
    );
  });

  it('toggles follow and bookmark within same learner scope and scopes leaderboard', async () => {
    let followed = false;
    let bookmarked = false;
    const sendNotification = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      user: {
        findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          name: where.id === 'shs-1' ? 'Ama' : 'Kojo',
          avatarUrl: null,
          learnerType: 'shs',
          status: 'active',
          schoolYear: 'SHS 2',
          programme: 'General Arts',
          university: null,
          communityProfile: { showInClassmates: true },
        })),
      },
      communityFollow: {
        findUnique: vi.fn().mockImplementation(async () => (followed ? { id: 'f1' } : null)),
        create: vi.fn().mockImplementation(async () => {
          followed = true;
          return { id: 'f1' };
        }),
        delete: vi.fn().mockImplementation(async () => {
          followed = false;
        }),
      },
      communityPost: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'p1',
          hidden: false,
          community: { learnerScope: 'shs' },
        }),
      },
      communityBookmark: {
        findUnique: vi.fn().mockImplementation(async () => (bookmarked ? { id: 'b1' } : null)),
        create: vi.fn().mockImplementation(async () => {
          bookmarked = true;
          return { id: 'b1' };
        }),
        delete: vi.fn().mockImplementation(async () => {
          bookmarked = false;
        }),
      },
      userCommunityProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            helpedCount: 12,
            acceptedCount: 4,
            user: {
              id: 'shs-2',
              name: 'Kojo',
              avatarUrl: null,
              schoolYear: 'SHS 3',
              programme: 'Science',
              university: null,
            },
          },
          {
            helpedCount: 3,
            acceptedCount: 1,
            user: {
              id: 'shs-1',
              name: 'Ama',
              avatarUrl: null,
              schoolYear: 'SHS 2',
              programme: 'General Arts',
              university: null,
            },
          },
        ]),
      },
    } as unknown as PrismaClient;

    const hub = createCommunityHubService({
      prisma,
      assertCommunityFeatureEnabled: async () => ({ featureShsCommunity: true }),
      getBlockedUserIds: async () => new Set(),
      ensureCommunityProfile: async () => ({
        helpedCount: 3,
        acceptedCount: 1,
        hideStats: false,
        showInClassmates: true,
        rulesAcceptedAt: new Date(),
      }),
      syncCourseToCommunity: async () => 'c1',
      formatAuthor: (a) => ({ id: a?.id ?? null, name: a?.name ?? 'User', avatarUrl: null }),
      sendCommunityNotification: sendNotification,
    });

    expect(await hub.toggleFollow('shs-1', 'shs-2')).toEqual({ following: true });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(await hub.toggleFollow('shs-1', 'shs-2')).toEqual({ following: false });

    expect(await hub.toggleBookmark('shs-1', 'p1')).toEqual({ bookmarked: true });
    expect(await hub.toggleBookmark('shs-1', 'p1')).toEqual({ bookmarked: false });

    const lb = await hub.getLeaderboard('shs-1');
    expect(lb.learnerType).toBe('shs');
    expect(lb.myStats.rank).toBe(2);
    expect(lb.leaders).toHaveLength(2);
    expect(lb.leaders[0]?.name).toBe('Kojo');
  });
});
