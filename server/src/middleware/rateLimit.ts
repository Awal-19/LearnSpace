import rateLimit, { type Options } from 'express-rate-limit';
import { AppError } from '../lib/errors';

type LimiterOptions = Partial<Pick<Options, 'windowMs' | 'limit' | 'skip' | 'keyGenerator'>>;

/**
 * Rate limiter that reports through the standard error envelope.
 * Keys by authenticated user ID when available, falling back to real client IP.
 * Sets Retry-After header and includes retryAfterSeconds in error details.
 */
export function createRateLimiter(options: LimiterOptions) {
  const windowSeconds = Math.max(1, Math.ceil((options.windowMs ?? 60_000) / 1000));
  return rateLimit({
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    ...options,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res, next) => {
      if (!res.getHeader('Retry-After')) {
        res.setHeader('Retry-After', String(windowSeconds));
      }
      const retryHeader = Number(res.getHeader('Retry-After'));
      const retryAfterSeconds = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : windowSeconds;
      next(
        new AppError(
          'RATE_LIMITED',
          'Too many requests. Please slow down.',
          { retryAfterSeconds },
        ),
      );
    },
  });
}
