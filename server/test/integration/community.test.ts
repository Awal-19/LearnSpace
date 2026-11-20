/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { createCommunityGroupsService } from '../../src/modules/community/community.groups.service';
import { createCommunityRealtimeHub } from '../../src/modules/community/community.realtime';
import { createCommunityService } from '../../src/modules/community/community.service';
import { testEnv } from '../helpers';

function makeCommunityHarness() {
  const env = testEnv({ JWT_SECRET: '9f8e7d6c5b4a32109876543210fedcba9876543210abcdef' });
  const logger = createLogger(env);

  const userA = {
    id: randomUUID(),
    email: 'ama@ug.edu.gh',
    name: 'Ama Mensah',
    emailVerified: true,
    role: 'student',
    status: 'active',
    university: 'University of Ghana',
    avatarUrl: null,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  };
  const userB = {
    id: randomUUID(),
    email: 'kwame@ug.edu.gh',
    name: 'Kwame Boateng',
    emailVerified: true,
    role: 'student',
    status: 'active',
    university: 'University of Ghana',
    avatarUrl: null,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  };
  const outsider = {
    id: randomUUID(),
    email: 'outsider@knust.edu.gh',
    name: 'Outsider',
    emailVerified: true,
    role: 'student',
    status: 'active',
    university: 'KNUST',
    avatarUrl: null,
    createdAt: new Date(), // brand new account (< 24h)
  };
  const unverifiedUser = {
    id: randomUUID(),
    email: 'unverified@ug.edu.gh',
    name: 'Unverified',
    emailVerified: false,
    role: 'student',
    status: 'active',
    university: 'University of Ghana',
    avatarUrl: null,
    createdAt: new Date(),
  };

  const users = [userA, userB, outsider, unverifiedUser];
  const courses = [
    {
      id: randomUUID(),
      userId: userA.id,
      name: 'Algorithms',
      archivedAt: null,
      communityId: null as string | null,
    },
    {
      id: randomUUID(),
      userId: userB.id,
      name: 'Algorithms',
      archivedAt: null,
      communityId: null as string | null,
    },
  ];
  const communities: any[] = [];
  const members: any[] = [];
  const profiles: any[] = [];
  const posts: any[] = [];
  const replies: any[] = [];
  const votes: any[] = [];
  const groups: any[] = [];
  const groupMembers: any[] = [];
  const groupMessages: any[] = [];
  const reports: any[] = [];
  const blocks: any[] = [];
  const notifPrefs: any[] = [];
  const notifications: any[] = [];

  const settings = {
    id: 'global',
    featureCommunity: true,
    communityBannedWordsJson: ['badword'],
    communityExamNoticeEnabled: false,
    communityExamNoticeMessage: 'Exam notice',
    communityPausedCourseSlugsJson: [],
    recommendationBlockDomainsJson: ['libgen.is'],
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
    },
    appSettings: {
      findUnique: async () => settings,
    },
    course: {
      findMany: async ({ where }: any) => courses.filter((c) => c.userId === where.userId),
      findFirst: async ({ where }: any) =>
        courses.find((c) => c.id === where.id && c.userId === where.userId) ?? null,
      update: async ({ where, data }: any) => {
        const c = courses.find((x) => x.id === where.id);
        if (c) Object.assign(c, data);
        return c;
      },
    },
    community: {
      upsert: async ({ where, create }: any) => {
        let row = communities.find((c) => c.slug === where.slug);
        if (!row) {
          row = {
            id: randomUUID(),
            isPaused: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          communities.push(row);
        }
        return row;
      },
      findUnique: async ({ where }: any) => {
        const c = communities.find((x) => x.id === where.id);
        if (!c) return null;
        return {
          ...c,
          _count: {
            members: members.filter((m) => m.communityId === c.id).length,
            posts: posts.filter((p) => p.communityId === c.id && !p.hidden).length,
            studyGroups: groups.filter((g) => g.communityId === c.id).length,
          },
        };
      },
    },
    communityMember: {
      upsert: async ({ where, create }: any) => {
        const key = where.communityId_userId;
        let row = members.find((m) => m.communityId === key.communityId && m.userId === key.userId);
        if (!row) {
          row = { id: randomUUID(), mutedUntil: null, joinedAt: new Date(), ...create };
          members.push(row);
        }
        return row;
      },
      findUnique: async ({ where }: any) => {
        const key = where.communityId_userId;
        return (
          members.find((m) => m.communityId === key.communityId && m.userId === key.userId) ?? null
        );
      },
      findMany: async ({ where }: any) =>
        members
          .filter(
            (m) =>
              (!where.userId || m.userId === where.userId) &&
              (!where.communityId || m.communityId === where.communityId),
          )
          .map((m) => {
            const c = communities.find((x) => x.id === m.communityId);
            const u = users.find((x) => x.id === m.userId);
            return {
              ...m,
              community: c
                ? {
                    ...c,
                    _count: {
                      members: members.filter((x) => x.communityId === c.id).length,
                      posts: posts.filter((x) => x.communityId === c.id && !x.hidden).length,
                      studyGroups: groups.filter((x) => x.communityId === c.id).length,
                    },
                  }
                : null,
              user: u
                ? {
                    ...u,
                    communityProfile: profiles.find((p) => p.userId === u.id) ?? null,
                  }
                : null,
            };
          }),
      delete: async ({ where }: any) => {
        const key = where.communityId_userId;
        const idx = members.findIndex(
          (m) => m.communityId === key.communityId && m.userId === key.userId,
        );
        if (idx >= 0) members.splice(idx, 1);
      },
    },
    userCommunityProfile: {
      upsert: async ({ where, create, update }: any) => {
        let row = profiles.find((p) => p.userId === where.userId);
        if (!row) {
          row = {
            userId: where.userId,
            helpedCount: 0,
            acceptedCount: 0,
            hideStats: false,
            showInClassmates: true,
            rulesAcceptedAt: null,
            mutedUntil: null,
            ...create,
          };
          profiles.push(row);
        } else {
          if (update.helpedCount?.increment) row.helpedCount += update.helpedCount.increment;
          if (update.acceptedCount?.increment) row.acceptedCount += update.acceptedCount.increment;
          const rest = { ...update };
          delete rest.helpedCount;
          delete rest.acceptedCount;
          Object.assign(row, rest);
        }
        return row;
      },
    },
    communityPost: {
      findMany: async ({ where }: any) =>
        posts
          .filter((p) => {
            if (
              where.communityId &&
              typeof where.communityId === 'string' &&
              p.communityId !== where.communityId
            )
              return false;
            if (where.communityId?.in && !where.communityId.in.includes(p.communityId))
              return false;
            if (where.hidden !== undefined && p.hidden !== where.hidden) return false;
            if (where.status && p.status !== where.status) return false;
            if (where.authorId?.notIn && where.authorId.notIn.includes(p.authorId)) return false;
            return true;
          })
          .map((p) => ({
            ...p,
            community: communities.find((c) => c.id === p.communityId),
            author: users.find((u) => u.id === p.authorId) ?? null,
            attachments: [],
          })),
      findFirst: async ({ where }: any) =>
        posts.find(
          (p) =>
            p.communityId === where.communityId &&
            p.authorId === where.authorId &&
            p.title.toLowerCase() === where.title?.equals?.toLowerCase(),
        ) ?? null,
      findUnique: async ({ where }: any) => {
        const p = posts.find((x) => x.id === where.id);
        if (!p) return null;
        return {
          ...p,
          community: communities.find((c) => c.id === p.communityId),
          author: users.find((u) => u.id === p.authorId) ?? null,
          attachments: [],
        };
      },
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          isPinned: false,
          acceptedReplyId: null,
          helpfulCount: 0,
          replyCount: 0,
          hidden: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        posts.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const p = posts.find((x) => x.id === where.id);
        if (data.helpfulCount?.increment !== undefined) {
          p.helpfulCount += data.helpfulCount.increment;
          const rest = { ...data };
          delete rest.helpfulCount;
          Object.assign(p, rest);
        } else if (data.replyCount?.increment !== undefined) {
          p.replyCount += data.replyCount.increment;
          const rest = { ...data };
          delete rest.replyCount;
          Object.assign(p, rest);
        } else {
          Object.assign(p, data);
        }
        return p;
      },
    },
    communityReply: {
      findMany: async ({ where }: any) =>
        replies
          .filter(
            (r) =>
              r.postId === where.postId &&
              !r.hidden &&
              (!where.authorId?.notIn || !where.authorId.notIn.includes(r.authorId)),
          )
          .map((r) => ({
            ...r,
            author: users.find((u) => u.id === r.authorId) ?? null,
            attachments: [],
          })),
      findFirst: async ({ where }: any) =>
        replies.find((r) => r.id === where.id && r.postId === where.postId && !r.hidden) ?? null,
      findUnique: async ({ where }: any) => replies.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          helpfulCount: 0,
          hidden: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        replies.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const r = replies.find((x) => x.id === where.id);
        if (data.helpfulCount?.increment !== undefined) {
          r.helpfulCount += data.helpfulCount.increment;
        } else {
          Object.assign(r, data);
        }
        return r;
      },
    },
    communityVote: {
      findUnique: async ({ where }: any) => {
        const k = where.userId_targetType_targetId;
        return (
          votes.find(
            (v) =>
              v.userId === k.userId && v.targetType === k.targetType && v.targetId === k.targetId,
          ) ?? null
        );
      },
      findMany: async ({ where }: any) =>
        votes.filter((v) => v.userId === where.userId && where.targetId.in.includes(v.targetId)),
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        votes.push(row);
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = votes.findIndex((v) => v.id === where.id);
        if (idx >= 0) votes.splice(idx, 1);
      },
    },
    studyGroup: {
      count: async ({ where }: any) => groups.filter((g) => g.creatorId === where.creatorId).length,
      findUnique: async ({ where }: any) =>
        groups.find((g) => (where.id ? g.id === where.id : g.inviteCode === where.inviteCode)) ??
        null,
      findMany: async ({ where }: any) =>
        groups
          .filter((g) => g.communityId === where.communityId)
          .map((g) => ({
            ...g,
            _count: {
              members: groupMembers.filter((m) => m.groupId === g.id).length,
              messages: groupMessages.filter((m) => m.groupId === g.id).length,
            },
            members: groupMembers.filter((m) => m.groupId === g.id),
          })),
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          pinnedMessageId: null,
          activeFocusTitle: null,
          activeFocusEndsAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        delete row.members;
        groups.push(row);
        if (data.members?.create) {
          groupMembers.push({
            id: randomUUID(),
            groupId: row.id,
            muted: false,
            joinedAt: new Date(),
            ...data.members.create,
          });
        }
        return row;
      },
    },
    studyGroupMember: {
      findUnique: async ({ where }: any) => {
        const k = where.groupId_userId;
        const gm = groupMembers.find((m) => m.groupId === k.groupId && m.userId === k.userId);
        if (!gm) return null;
        const g = groups.find((x) => x.id === gm.groupId);
        return {
          ...gm,
          group: g ? { ...g, community: communities.find((c) => c.id === g.communityId) } : null,
        };
      },
      findMany: async ({ where }: any) =>
        groupMembers
          .filter((m) => (where.userId ? m.userId === where.userId : m.groupId === where.groupId))
          .map((m) => {
            const g = groups.find((x) => x.id === m.groupId);
            return {
              ...m,
              user: users.find((u) => u.id === m.userId),
              group: g
                ? {
                    ...g,
                    community: communities.find((c) => c.id === g.communityId),
                    _count: {
                      members: groupMembers.filter((x) => x.groupId === g.id).length,
                      messages: groupMessages.filter((x) => x.groupId === g.id).length,
                    },
                  }
                : null,
            };
          }),
      upsert: async ({ where, create }: any) => {
        const k = where.groupId_userId;
        let gm = groupMembers.find((m) => m.groupId === k.groupId && m.userId === k.userId);
        if (!gm) {
          gm = { id: randomUUID(), muted: false, joinedAt: new Date(), ...create };
          groupMembers.push(gm);
        }
        return gm;
      },
    },
    studyGroupMessage: {
      findUnique: async () => null,
      findMany: async ({ where }: any) =>
        groupMessages
          .filter((m) => m.groupId === where.groupId && !m.hidden)
          .map((m) => ({
            ...m,
            author: users.find((u) => u.id === m.authorId) ?? null,
            replyTo: null,
            attachments: [],
          })),
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          hidden: false,
          isAiGenerated: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        groupMessages.push(row);
        return {
          ...row,
          author: users.find((u) => u.id === row.authorId) ?? null,
          attachments: [],
        };
      },
    },
    studyGroupTask: { findMany: async () => [] },
    communityReport: {
      create: async ({ data }: any) => {
        const rep = { id: randomUUID(), status: 'open', createdAt: new Date(), ...data };
        reports.push(rep);
        return rep;
      },
    },
    userBlock: {
      findMany: async ({ where }: any) =>
        blocks.filter(
          (b) => b.blockerId === where.OR[0].blockerId || b.blockedId === where.OR[1].blockedId,
        ),
      upsert: async ({ create }: any) => {
        blocks.push({ id: randomUUID(), ...create });
      },
    },
    communityNotificationPreference: {
      upsert: async ({ where, create, update }: any) => {
        let row = notifPrefs.find((n) => n.userId === where.userId);
        if (!row) {
          row = {
            userId: where.userId,
            inAppAnswer: true,
            inAppAccepted: true,
            inAppReply: true,
            inAppGroupInvite: true,
            inAppMention: true,
            emailAnswer: false,
            emailAccepted: true,
            emailReply: false,
            emailGroupInvite: true,
            emailMention: true,
            emailDailyDigest: false,
            ...create,
          };
          notifPrefs.push(row);
        } else {
          Object.assign(row, update);
        }
        return row;
      },
      findUnique: async ({ where }: any) =>
        notifPrefs.find((n) => n.userId === where.userId) ?? null,
    },
    notification: {
      create: async ({ data }: any) => {
        notifications.push(data);
        return data;
      },
    },
  } as unknown as PrismaClient;

  const realtime = createCommunityRealtimeHub();
  const core = createCommunityService({ prisma, logger });
  const groupsSvc = createCommunityGroupsService({ prisma, core, realtime, logger });

  const isEmailVerified = async (uid: string) =>
    Boolean(users.find((u) => u.id === uid)?.emailVerified);

  const app = createApp(env, {
    checkDb: async () => {},
    community: { core, groups: groupsSvc, realtime, isEmailVerified },
    isEmailVerified,
  });

  return {
    app,
    userA,
    userB,
    outsider,
    unverifiedUser,
    tokenA: signAccessToken(userA.id, env.JWT_SECRET).token,
    tokenB: signAccessToken(userB.id, env.JWT_SECRET).token,
    tokenOutsider: signAccessToken(outsider.id, env.JWT_SECRET).token,
    tokenUnverified: signAccessToken(unverifiedUser.id, env.JWT_SECRET).token,
    reports,
    notifications,
    posts,
  };
}

describe('Community & Collaboration security & behavior', () => {
  it('blocks unverified users (403 EMAIL_NOT_VERIFIED) and enforces rules acceptance', async () => {
    const h = makeCommunityHarness();
    const unvRes = await request(h.app)
      .get('/api/v1/community/home')
      .set('Authorization', `Bearer ${h.tokenUnverified}`);
    expect(unvRes.status).toBe(403);
    expect(unvRes.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const homeA = await request(h.app)
      .get('/api/v1/community/home')
      .set('Authorization', `Bearer ${h.tokenA}`);
    expect(homeA.status).toBe(200);
    expect(homeA.body.communities).toHaveLength(1);
    const commId = homeA.body.communities[0].id;

    // Posting before accepting rules fails
    const noRules = await request(h.app)
      .post(`/api/v1/community/courses/${commId}/posts`)
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ type: 'question', title: 'Help with DFS', body: 'How does topological sort work?' });
    expect(noRules.status).toBe(400);
  });

  it('supports Q&A, anonymous posting, XSS sanitization, non-duplicate voting, accepted answer, and non-member isolation', async () => {
    const h = makeCommunityHarness();
    const homeA = await request(h.app)
      .get('/api/v1/community/home')
      .set('Authorization', `Bearer ${h.tokenA}`);
    const homeB = await request(h.app)
      .get('/api/v1/community/home')
      .set('Authorization', `Bearer ${h.tokenB}`);
    const commId = homeA.body.communities[0].id;
    expect(homeB.body.communities[0].id).toBe(commId); // matched same course + university!

    await request(h.app)
      .post('/api/v1/community/rules/accept')
      .set('Authorization', `Bearer ${h.tokenA}`);
    await request(h.app)
      .post('/api/v1/community/rules/accept')
      .set('Authorization', `Bearer ${h.tokenB}`);

    // Outsider cannot read community posts
    const outsiderRes = await request(h.app)
      .get(`/api/v1/community/courses/${commId}/posts`)
      .set('Authorization', `Bearer ${h.tokenOutsider}`);
    expect(outsiderRes.status).toBe(404);

    // Anonymous post with XSS payload
    const postRes = await request(h.app)
      .post(`/api/v1/community/courses/${commId}/posts`)
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({
        type: 'question',
        title: 'Big-O <script>alert(1)</script>',
        body: 'Explain $O(n \\log n)$ <iframe src="evil"></iframe>',
        isAnonymous: true,
      });
    expect(postRes.status).toBe(201);
    const postId = postRes.body.id;

    // User B sees anonymous author & sanitized content
    const detailB = await request(h.app)
      .get(`/api/v1/community/posts/${postId}`)
      .set('Authorization', `Bearer ${h.tokenB}`);
    expect(detailB.status).toBe(200);
    expect(detailB.body.post.author.name).toBe('Anonymous student');
    expect(detailB.body.post.author.id).toBeNull();
    expect(detailB.body.post.title).not.toContain('<script>');
    expect(detailB.body.post.body).not.toContain('<iframe');

    // User B replies
    const replyRes = await request(h.app)
      .post(`/api/v1/community/posts/${postId}/replies`)
      .set('Authorization', `Bearer ${h.tokenB}`)
      .send({ body: 'Merge sort splits the array in half recursively.' });
    expect(replyRes.status).toBe(201);
    const replyId = replyRes.body.id;

    // Vote once -> +1, vote again -> toggles back to 0 (cannot duplicate)
    const v1 = await request(h.app)
      .post('/api/v1/community/votes')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ targetType: 'reply', targetId: replyId });
    expect(v1.body.helpfulCount).toBe(1);
    const v2 = await request(h.app)
      .post('/api/v1/community/votes')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ targetType: 'reply', targetId: replyId });
    expect(v2.body.helpfulCount).toBe(0);

    // Only question author can accept
    const badAccept = await request(h.app)
      .post(`/api/v1/community/posts/${postId}/accept/${replyId}`)
      .set('Authorization', `Bearer ${h.tokenB}`);
    expect(badAccept.status).toBe(403);

    const goodAccept = await request(h.app)
      .post(`/api/v1/community/posts/${postId}/accept/${replyId}`)
      .set('Authorization', `Bearer ${h.tokenA}`);
    expect(goodAccept.status).toBe(200);
    expect(goodAccept.body.status).toBe('resolved');
  });

  it('enforces blocking, reporting, study group authorization, daily group limit, and notification preferences', async () => {
    const h = makeCommunityHarness();
    const homeA = await request(h.app)
      .get('/api/v1/community/home')
      .set('Authorization', `Bearer ${h.tokenA}`);
    const commId = homeA.body.communities[0].id;
    await request(h.app)
      .post('/api/v1/community/rules/accept')
      .set('Authorization', `Bearer ${h.tokenA}`);

    // Create invite-only group
    const g1 = await request(h.app)
      .post('/api/v1/community/groups')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ communityId: commId, name: 'Group 1', visibility: 'invite_only' });
    expect(g1.status).toBe(201);

    // Non-member cannot read group messages
    const nonMemberMsg = await request(h.app)
      .get(`/api/v1/community/groups/${g1.body.id}/messages`)
      .set('Authorization', `Bearer ${h.tokenB}`);
    expect(nonMemberMsg.status).toBe(404);

    // Join via invite code
    const joinRes = await request(h.app)
      .post('/api/v1/community/groups/join-code')
      .set('Authorization', `Bearer ${h.tokenB}`)
      .send({ inviteCode: g1.body.inviteCode });
    expect(joinRes.status).toBe(200);

    // Daily group limit (max 3 per day)
    await request(h.app)
      .post('/api/v1/community/groups')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ communityId: commId, name: 'G2' });
    await request(h.app)
      .post('/api/v1/community/groups')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ communityId: commId, name: 'G3' });
    const g4 = await request(h.app)
      .post('/api/v1/community/groups')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ communityId: commId, name: 'G4' });
    expect(g4.status).toBe(429);

    // Report & Block
    const rep = await request(h.app)
      .post('/api/v1/community/reports')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ targetType: 'user', targetId: h.userB.id, reason: 'Spamming chat' });
    expect(rep.status).toBe(201);
    expect(h.reports).toHaveLength(1);

    const blk = await request(h.app)
      .post('/api/v1/community/blocks')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ userId: h.userB.id });
    expect(blk.status).toBe(201);

    // Notification preferences
    const prefRes = await request(h.app)
      .patch('/api/v1/community/notifications/preferences')
      .set('Authorization', `Bearer ${h.tokenA}`)
      .send({ emailDailyDigest: true, inAppAnswer: false });
    expect(prefRes.status).toBe(200);
    expect(prefRes.body.emailDailyDigest).toBe(true);
    expect(prefRes.body.inAppAnswer).toBe(false);
  });
});
