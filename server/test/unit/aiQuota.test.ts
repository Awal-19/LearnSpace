import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { verifyCaptchaToken } from '../../src/lib/captcha';
import { acquireAiConcurrency, enforceAiQuota } from '../../src/modules/ai/aiQuota';

describe('AI quota, concurrency & captcha hooks', () => {
  it('enforces monthlyCostCapUsd and dailyMessageLimit from AppSettings', async () => {
    const capPrisma = {
      appSettings: {
        findUnique: async () => ({
          featureChat: true,
          dailyMessageLimit: 100,
          monthlyCostCapUsd: 10,
        }),
      },
      aiUsageDaily: {
        aggregate: async () => ({
          _sum: { inputTokens: 3_000_000, outputTokens: 2_500_000 }, // 5.5M * $0.000002 = $11 >= $10
        }),
      },
      message: { count: async () => 0 },
    } as unknown as PrismaClient;

    await expect(enforceAiQuota(capPrisma, 'u1', null)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });

    const msgLimitPrisma = {
      appSettings: {
        findUnique: async () => ({
          featureChat: true,
          dailyMessageLimit: 5,
          monthlyCostCapUsd: 100,
        }),
      },
      aiUsageDaily: {
        aggregate: async () => ({ _sum: { inputTokens: 0, outputTokens: 0 } }),
      },
      message: { count: async () => 5 },
    } as unknown as PrismaClient;

    await expect(enforceAiQuota(msgLimitPrisma, 'u1', null)).rejects.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
    });
  });

  it('limits concurrent AI requests per user and releases slots cleanly', () => {
    const r1 = acquireAiConcurrency('user-conc-1');
    const r2 = acquireAiConcurrency('user-conc-1');
    expect(() => acquireAiConcurrency('user-conc-1')).toThrow(/concurrent/i);
    r1();
    const r3 = acquireAiConcurrency('user-conc-1');
    r2();
    r3();
  });

  it('requires captcha token when TURNSTILE_SECRET_KEY is configured in production', async () => {
    await expect(
      verifyCaptchaToken(
        { TURNSTILE_SECRET_KEY: 'secret', HCAPTCHA_SECRET_KEY: undefined, NODE_ENV: 'production' },
        undefined,
        '1.2.3.4',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      verifyCaptchaToken(
        { TURNSTILE_SECRET_KEY: undefined, HCAPTCHA_SECRET_KEY: undefined, NODE_ENV: 'production' },
        undefined,
        '1.2.3.4',
      ),
    ).resolves.toBeUndefined();
  });
});
