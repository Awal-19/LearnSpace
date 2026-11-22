import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { requireGuardianConsent } from '../../src/middleware/auth';
import { buildShsSystemPrompt, SHS_TUTOR_SYSTEM_PROMPT } from '../../src/modules/ai/ai.shs.prompts';
import { createAdminService } from '../../src/modules/admin/admin.service';
import { signupSchema } from '../../src/modules/auth/auth.schemas';
import { createCommunityService } from '../../src/modules/community/community.service';
import { detectShsPii, screenShsChatContent } from '../../src/modules/shs/shs.safety';
import { createShsService } from '../../src/modules/shs/shs.service';
import { testEnv } from '../helpers';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Parameters<typeof createShsService>[0]['logger'];

describe('Ghanaian SHS support & child safety', () => {
  it('validates signup for both university and SHS learners', () => {
    const uni = signupSchema.safeParse({
      name: 'Ama Mensah',
      email: 'ama@ug.edu.gh',
      password: 'Password123!',
      acceptTerms: true,
    });
    expect(uni.success).toBe(true);
    if (uni.success) expect(uni.data.learnerType).toBe('university');

    const shs = signupSchema.safeParse({
      name: 'Kwame Boateng',
      email: 'kwame@shs.edu.gh',
      password: 'Password123!',
      learnerType: 'shs',
      schoolYear: 'SHS 2',
      ageGroup: 'under_18',
      guardianEmail: 'parent@example.com',
      acceptTerms: true,
    });
    expect(shs.success).toBe(true);
  });

  it('onboards SHS subjects from catalogue and custom names', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', schoolYear: 'SHS 1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      subjectCatalogue: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'cat-1', name: 'Core Mathematics', code: 'CMATH' }]),
      },
      course: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: `c-${data.name}`,
          name: data.name,
          code: data.code ?? null,
          type: data.type,
        })),
      },
    } as unknown as PrismaClient;

    const shs = createShsService({ prisma, logger: silentLogger });
    const res = await shs.selectOnboardingSubjects('u1', {
      schoolYear: 'SHS 2',
      programme: 'General Science',
      subjectIds: ['cat-1'],
      customNames: ['ICT Elective'],
    });

    expect(res.schoolYear).toBe('SHS 2');
    expect(res.subjectsCount).toBe(2);
    expect(res.subjects.map((s) => s.name)).toEqual(['Core Mathematics', 'ICT Elective']);
  });

  it('locks out under-18 users without guardian consent and allows once given', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ ageGroup: 'under_18', guardianConsentStatus: 'pending' })
      .mockResolvedValueOnce({ ageGroup: 'under_18', guardianConsentStatus: 'given' });

    const prisma = { user: { findUnique } } as unknown as PrismaClient;
    const gate = requireGuardianConsent(prisma);

    const nextPending = vi.fn();
    gate({ user: { id: 'u-minor', iat: 1 } } as never, {} as never, nextPending);
    await vi.waitFor(() => expect(nextPending).toHaveBeenCalledWith(expect.any(AppError)));
    expect((nextPending.mock.calls[0]?.[0] as AppError).code).toBe('GUARDIAN_CONSENT_REQUIRED');

    const nextGiven = vi.fn();
    gate({ user: { id: 'u-minor', iat: 1 } } as never, {} as never, nextGiven);
    await vi.waitFor(() => expect(nextGiven).toHaveBeenCalledWith());
  });

  it('withdraws guardian consent and rotates tokensValidAfter to lock the account', async () => {
    const updateConsent = vi.fn().mockResolvedValue({});
    const updateUser = vi.fn().mockResolvedValue({});
    const prisma = {
      guardianConsent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'gc-1',
          userId: 'u-minor',
          status: 'given',
          user: { id: 'u-minor', name: 'Kofi' },
        }),
        update: updateConsent,
      },
      user: { update: updateUser },
      $transaction: vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaClient;

    const shs = createShsService({ prisma, logger: silentLogger });
    const res = await shs.withdrawGuardianConsent('raw-token-123456');
    expect(res.status).toBe('withdrawn');
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-minor' },
        data: expect.objectContaining({ guardianConsentStatus: 'withdrawn' }),
      }),
    );
  });

  it('builds SHS tutor prompt and screens distress, unsafe content, and PII', () => {
    const prompt = buildShsSystemPrompt({ schoolYear: 'SHS 2', programme: 'General Science' });
    expect(prompt).toContain(SHS_TUTOR_SYSTEM_PROMPT);
    expect(prompt).toContain('SHS 2');

    const distress = screenShsChatContent('I feel hopeless and want to kill myself');
    expect(distress.flagged).toBe(true);
    expect(distress.category).toBe('distress');
    expect(distress.safeReply).toMatch(/trusted adult/i);

    const unsafe = screenShsChatContent('send nudes');
    expect(unsafe.flagged).toBe(true);
    expect(unsafe.category).toBe('unsafe');

    expect(detectShsPii('Call me on 024 123 4567')).toBe('phone_number');
    expect(detectShsPii('My GhanaPost is GA-123-4567')).toBe('ghanapost_gps');
    expect(detectShsPii('DM me on instagram.com/kofi_shs')).toBe('social_handle_or_link');
    expect(detectShsPii('How do we balance Fe + O2 -> Fe2O3?')).toBeNull();
  });

  it('isolates SHS and university communities and blocks links/anonymity/PII in SHS posts', async () => {
    const prisma = {
      communityMember: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ communityId: 'comm-shs', userId: 'u-uni', role: 'member' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ learnerType: 'university' }),
      },
      community: {
        findUnique: vi.fn().mockResolvedValue({ learnerScope: 'shs' }),
      },
      appSettings: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ featureCommunity: true, featureShsCommunity: true }),
      },
    } as unknown as PrismaClient;

    const community = createCommunityService({ prisma, logger: silentLogger });
    await expect(community.assertCommunityMember('u-uni', 'comm-shs')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const shsPrisma = {
      appSettings: {
        findUnique: vi.fn().mockResolvedValue({
          featureCommunity: true,
          featureShsCommunity: true,
          shsBannedWordsJson: ['bullyword'],
        }),
      },
      userCommunityProfile: {
        upsert: vi
          .fn()
          .mockResolvedValue({ userId: 'u-shs', rulesAcceptedAt: new Date(), mutedUntil: null }),
      },
      communityMember: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ communityId: 'comm-shs', userId: 'u-shs', role: 'member' }),
      },
      community: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: 'comm-shs',
            learnerScope: 'shs',
            isPaused: false,
            slug: 'shs:maths',
            normalizedName: 'maths',
          }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ createdAt: new Date(), learnerType: 'shs' }),
      },
      shsModerationFlag: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;

    const shsCommunity = createCommunityService({ prisma: shsPrisma, logger: silentLogger });
    await expect(
      shsCommunity.createPost('u-shs', 'comm-shs', {
        type: 'question',
        title: 'Help with quadratic formula',
        body: 'Call me on 0541234567',
        isAnonymous: false,
        attachmentIds: [],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('grades WASSCE objective mock attempts and tracks weak topics', async () => {
    const updateMock = vi.fn().mockResolvedValue({});
    const prisma = {
      wassceMockAttempt: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mock-1',
          userId: 'u-shs',
          questionsJson: [
            {
              id: 'q1',
              type: 'objective',
              topic: 'Logarithms',
              prompt: 'log10(100) = ?',
              options: ['1', '2', '10', '100'],
              correctIndex: 1,
              explanation: '10^2 = 100',
            },
            {
              id: 'q2',
              type: 'objective',
              topic: 'Surds',
              prompt: 'sqrt(16) = ?',
              options: ['2', '4', '8', '16'],
              correctIndex: 1,
              explanation: '4*4 = 16',
            },
          ],
        }),
        update: updateMock,
      },
    } as unknown as PrismaClient;

    const shs = createShsService({ prisma, logger: silentLogger });
    const result = await shs.submitWassceMock('u-shs', 'mock-1', {
      answers: { q1: 1, q2: 0 },
      durationSeconds: 120,
    });

    expect(result.score).toBe(1);
    expect(result.total).toBe(2);
    expect(result.weakTopics).toEqual(['Surds']);
    expect(updateMock).toHaveBeenCalled();
  });

  it('filters admin users by learnerType and consentStatus', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = {
      user: { findMany, count },
    } as unknown as PrismaClient;

    const admin = createAdminService({
      prisma,
      env: testEnv(),
      email: {} as never,
      storage: {} as never,
      logger: silentLogger,
    });

    await admin.listUsers({
      learnerType: 'shs',
      consentStatus: 'pending',
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          learnerType: 'shs',
          guardianConsentStatus: 'pending',
        }),
      }),
    );
  });
});
