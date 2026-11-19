import type { PrismaClient } from '@prisma/client';
import rateLimit, {
  MemoryStore,
  type IncrementResponse,
  type Options,
  type Store,
} from 'express-rate-limit';
import { AppError } from '../lib/errors';

type LimiterOptions = Partial<Pick<Options, 'windowMs' | 'limit' | 'skip' | 'keyGenerator'>> & {
  prefix?: string;
};

let sharedPrisma: PrismaClient | null = null;

/**
 * Attaches a PrismaClient for the PostgreSQL-backed rate limit store so limits
 * survive restarts and are shared across multiple server instances.
 */
export function setRateLimitPrisma(prisma: PrismaClient | null): void {
  sharedPrisma = prisma;
}

class PostgresRateLimitStore implements Store {
  private windowMs = 60_000;
  private readonly fallback = new MemoryStore();

  constructor(public readonly prefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  private scopedKey(key: string): string {
    return `${this.prefix}:${key}`.slice(0, 255);
  }

  async increment(key: string): Promise<IncrementResponse> {
    if (!sharedPrisma || typeof sharedPrisma.$queryRaw !== 'function') {
      return this.fallback.increment(key);
    }
    const scoped = this.scopedKey(key);
    const nextReset = new Date(Date.now() + this.windowMs);
    try {
      const rows = await sharedPrisma.$queryRaw<Array<{ hits: number; resetAt: Date }>>`
        INSERT INTO "rate_limit_buckets" ("key", "hits", "resetAt")
        VALUES (${scoped}, 1, ${nextReset})
        ON CONFLICT ("key") DO UPDATE SET
          "hits" = CASE
            WHEN "rate_limit_buckets"."resetAt" <= NOW() THEN 1
            ELSE "rate_limit_buckets"."hits" + 1
          END,
          "resetAt" = CASE
            WHEN "rate_limit_buckets"."resetAt" <= NOW() THEN ${nextReset}
            ELSE "rate_limit_buckets"."resetAt"
          END
        RETURNING "hits", "resetAt"
      `;
      const row = rows[0];
      if (!row) return this.fallback.increment(key);
      return { totalHits: Number(row.hits), resetTime: new Date(row.resetAt) };
    } catch {
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    if (!sharedPrisma || typeof sharedPrisma.$executeRaw !== 'function') {
      return this.fallback.decrement(key);
    }
    const scoped = this.scopedKey(key);
    try {
      await sharedPrisma.$executeRaw`
        UPDATE "rate_limit_buckets"
        SET "hits" = GREATEST(0, "hits" - 1)
        WHERE "key" = ${scoped}
      `;
    } catch {
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    if (!sharedPrisma || typeof sharedPrisma.$executeRaw !== 'function') {
      return this.fallback.resetKey(key);
    }
    const scoped = this.scopedKey(key);
    try {
      await sharedPrisma.$executeRaw`
        DELETE FROM "rate_limit_buckets" WHERE "key" = ${scoped}
      `;
    } catch {
      await this.fallback.resetKey(key);
    }
  }
}

let limiterSeq = 0;

/**
 * Rate limiter that reports through the standard error envelope.
 * Keys by authenticated user ID when available, falling back to real client IP.
 * Uses PostgreSQL when configured (falling back to MemoryStore in tests/offline).
 */
export function createRateLimiter(options: LimiterOptions) {
  const windowSeconds = Math.max(1, Math.ceil((options.windowMs ?? 60_000) / 1000));
  const prefix = options.prefix ?? `rl-${++limiterSeq}`;
  const { prefix: _ignored, ...rest } = options;
  return rateLimit({
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    ...rest,
    store: new PostgresRateLimitStore(prefix),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res, next) => {
      if (!res.getHeader('Retry-After')) {
        res.setHeader('Retry-After', String(windowSeconds));
      }
      const retryHeader = Number(res.getHeader('Retry-After'));
      const retryAfterSeconds =
        Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : windowSeconds;
      next(
        new AppError('RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSeconds }),
      );
    },
  });
}
