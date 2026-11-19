import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors';

const ESTIMATED_USD_PER_TOKEN = 0.000002;
const MAX_CONCURRENT_AI_PER_USER = 2;

const activeAiByUser = new Map<string, number>();

function utcDayBounds(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const dayDate = new Date(Date.UTC(y, m, d));
  const monthStart = new Date(Date.UTC(y, m, 1));
  const resetsAt = new Date(Date.UTC(y, m, d + 1)).toISOString();
  return { dayDate, monthStart, resetsAt };
}

/**
 * Acquires a per-user concurrency slot for AI generation/streaming.
 * Throws 429 RATE_LIMITED if the user already has too many active AI requests.
 */
export function acquireAiConcurrency(userId: string): () => void {
  const current = activeAiByUser.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_AI_PER_USER) {
    throw new AppError(
      'RATE_LIMITED',
      'Too many concurrent AI requests. Please wait for your current response to finish.',
    );
  }
  activeAiByUser.set(userId, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (activeAiByUser.get(userId) ?? 1) - 1;
    if (next <= 0) {
      activeAiByUser.delete(userId);
    } else {
      activeAiByUser.set(userId, next);
    }
  };
}

/**
 * Enforces global monthly AI cost cap, per-user daily message limit,
 * and per-user daily token quota across all AI endpoints.
 */
export async function enforceAiQuota(
  prisma: PrismaClient,
  userId: string,
  dailyTokenLimit: number | null,
): Promise<void> {
  const { dayDate, monthStart, resetsAt } = utcDayBounds();
  const maybePrisma = prisma as unknown as {
    appSettings?: {
      findUnique?: (args: unknown) => Promise<{
        featureChat?: boolean;
        dailyMessageLimit?: number;
        monthlyCostCapUsd?: number;
      } | null>;
    };
    aiUsageDaily?: {
      findUnique?: (args: unknown) => Promise<{ inputTokens: number; outputTokens: number } | null>;
      aggregate?: (args: unknown) => Promise<{
        _sum: { inputTokens: number | null; outputTokens: number | null };
      }>;
    };
    message?: {
      count?: (args: unknown) => Promise<number>;
    };
  };

  const settings = maybePrisma.appSettings?.findUnique
    ? await maybePrisma.appSettings.findUnique({ where: { id: 'global' } }).catch(() => null)
    : null;

  if (settings?.featureChat === false) {
    throw new AppError('AI_UNAVAILABLE', 'AI features are currently disabled by an administrator');
  }

  if (
    settings?.monthlyCostCapUsd &&
    settings.monthlyCostCapUsd > 0 &&
    maybePrisma.aiUsageDaily?.aggregate
  ) {
    const agg = await maybePrisma.aiUsageDaily
      .aggregate({
        where: { day: { gte: monthStart } },
        _sum: { inputTokens: true, outputTokens: true },
      })
      .catch(() => null);
    const monthTokens = (agg?._sum?.inputTokens ?? 0) + (agg?._sum?.outputTokens ?? 0);
    const estimatedCostUsd = monthTokens * ESTIMATED_USD_PER_TOKEN;
    if (estimatedCostUsd >= settings.monthlyCostCapUsd) {
      throw new AppError(
        'AI_UNAVAILABLE',
        'AI features are temporarily paused because the monthly cost cap has been reached.',
      );
    }
  }

  if (settings?.dailyMessageLimit && settings.dailyMessageLimit > 0 && maybePrisma.message?.count) {
    const usedMessagesToday = await maybePrisma.message
      .count({
        where: { userId, role: 'user', createdAt: { gte: dayDate } },
      })
      .catch(() => 0);
    if (usedMessagesToday >= settings.dailyMessageLimit) {
      throw new AppError('AI_BUDGET_EXCEEDED', 'Daily AI message limit reached', { resetsAt });
    }
  }

  if (dailyTokenLimit !== null && dailyTokenLimit > 0 && maybePrisma.aiUsageDaily?.findUnique) {
    const usageRow = await maybePrisma.aiUsageDaily
      .findUnique({ where: { userId_day: { userId, day: dayDate } } })
      .catch(() => null);
    const usedToday = (usageRow?.inputTokens ?? 0) + (usageRow?.outputTokens ?? 0);
    if (usedToday >= dailyTokenLimit) {
      throw new AppError('AI_BUDGET_EXCEEDED', 'Daily AI token limit reached', { resetsAt });
    }
  }
}
